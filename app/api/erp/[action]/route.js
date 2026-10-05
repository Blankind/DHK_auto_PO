import { erp, getList } from "@/lib/erp";
import { allocate, cleanRows } from "@/lib/allocate";
import { acquire, release } from "@/lib/lock";
import { planReceipt, createReceipt } from "@/lib/receipt";
import { getSettings, withSettings } from "@/lib/settings";

export const maxDuration = 60;

// tanggal lokal Jakarta (bukan UTC), format YYYY-MM-DD
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
// Required By tidak boleh lebih awal dari tanggal PO
const clamp = (d, min) => (!d || d < min ? min : d);

// harga jual price list Grosir yang berlaku pada tanggal PO
async function sellingPrices(codes, date, list) {
  const rows = await getList("Item Price", {
    fields: ["item_code", "price_list_rate", "valid_from", "valid_upto", "uom", "creation"],
    filters: [["item_code", "in", codes], ["selling", "=", 1], ["price_list", "=", list]],
  });
  const map = {};
  rows
    .filter((r) => (!r.valid_from || r.valid_from <= date) && (!r.valid_upto || r.valid_upto >= date))
    .sort((a, b) => (b.valid_from || "").localeCompare(a.valid_from || "") || (b.creation || "").localeCompare(a.creation || ""))
    .forEach((r) => (map[r.item_code] ||= []).push(r));
  return map;
}

// ubah description Item master hanya jika berbeda
async function updateDescriptions(desc) {
  const codes = Object.keys(desc);
  if (!codes.length) return [];
  const cur = await getList("Item", { fields: ["name", "description"], filters: [["name", "in", codes]] });
  const old = Object.fromEntries(cur.map((i) => [i.name, (i.description || "").trim()]));
  const errors = [];
  for (const c of codes) {
    if (old[c] === desc[c]) continue;
    try {
      await erp("frappe.client.set_value", { doctype: "Item", name: c, fieldname: "description", value: desc[c] });
    } catch (e) {
      errors.push(`${c}: ${e.message}`);
    }
  }
  return errors;
}

const handlers = {
  async server_info() {
    return { erpnext_url: getSettings().erpnext_url };
  },
  async test_connection() {
    const user = await erp("frappe.auth.get_logged_user");
    return { user };
  },
  async companies() {
    return (await getList("Company", { fields: ["name"] })).map((c) => c.name);
  },
  async default_company() {
    return getSettings().default_company || null;
  },
  async suppliers({ txt = "" }) {
    const like = `%${txt}%`;
    return getList("Supplier", {
      fields: ["name", "supplier_name"],
      filters: [["disabled", "=", 0]],
      or_filters: [["name", "like", like], ["supplier_name", "like", like], ["supplier_group", "like", like]],
      limit_page_length: 20,
    });
  },
  async preview({ company, items }) {
    if (!company) throw new Error("Company wajib");
    return allocate(cleanRows(items), company);
  },
  async create({ supplier, company, items }) {
    if (!supplier || !company) throw new Error("Supplier dan Company wajib");
    const rows = cleanRows(items);
    const desc = {};
    rows.forEach((r) => r.description && (desc[r.item_code] = r.description));
    const lock = await acquire();
    try {
      // hitung ulang: jangan pakai hasil preview lama
      const { lines, summary } = await allocate(rows, company);
      const trx = today();
      const cfg = getSettings();
      const prices = await sellingPrices([...new Set(lines.map((l) => l.item_code))], trx, cfg.selling_price_list);
      const dates = lines.map((l) => clamp(l.schedule_date, trx)).sort();
      const schedule = dates[0] || trx;
      const doc = await erp("frappe.client.insert", {
        doc: {
          doctype: "Purchase Order",
          supplier,
          company,
          transaction_date: trx,
          schedule_date: schedule,
          docstatus: 0, // draft, tidak submit
          items: lines.map((l) => {
            const row = { ...l, schedule_date: clamp(l.schedule_date, trx) };
            if (desc[l.item_code]) row.description = desc[l.item_code];
            const cand = prices[l.item_code] || [];
            const hit = cand.find((c) => c.uom && c.uom === l.uom) || cand.find((c) => !c.uom) || cand[0];
            if (hit) row[cfg.selling_field] = hit.price_list_rate;
            Object.keys(row).forEach((k) => (row[k] == null || row[k] === "") && delete row[k]);
            return row;
          }),
        },
      });
      const descErrors = await updateDescriptions(desc).catch((e) => [e.message]);
      return { name: doc.name, url: `${cfg.erpnext_url}/app/purchase-order/${doc.name}`, summary, lines, descErrors };
    } finally {
      await release(lock);
    }
  },
  async receipt_preview({ po, items }) {
    const { lines, summary } = await planReceipt(po, cleanRows(items));
    return { lines, summary };
  },
  async receipt_create({ po, items }) {
    const rows = cleanRows(items);
    const lock = await acquire();
    try {
      return await createReceipt(po, rows);
    } finally {
      await release(lock);
    }
  },
};

export async function POST(req, { params }) {
  const { action } = await params;
  const h = handlers[action];
  if (!h) return Response.json({ error: "Aksi tidak dikenal" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  let cfg = {};
  try {
    cfg = JSON.parse(decodeURIComponent(req.headers.get("x-dhk-cfg") || "{}"));
  } catch {}
  try {
    return Response.json((await withSettings(cfg, () => h(body))) ?? null);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
