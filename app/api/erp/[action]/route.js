import { erp, erpRaw, getList } from "@/lib/erp";
import { allocate, cleanRows } from "@/lib/allocate";
import { acquire, release } from "@/lib/lock";
import { planReceipt, createReceipt } from "@/lib/receipt";
import { searchDn, collect, createStockEntry, tujuanOptions } from "@/lib/stock";
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

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>");
// Terms (Text Editor / HTML): alamat gudang, lalu baris pengambilan di bawahnya
const buildTerms = (address, extra) =>
  [address, extra].map((x) => String(x || "").trim()).filter(Boolean).map((x) => `<div>${esc(x)}</div>`).join("");

const handlers = {
  async warehouses({ company }) {
    const r = await getList("Warehouse", { fields: ["name"], filters: [["company", "=", company], ["is_group", "=", 0], ["disabled", "=", 0]], order_by: "name asc" });
    return r.map((x) => x.name);
  },
  async cost_centers({ company }) {
    const r = await getList("Cost Center", { fields: ["name"], filters: [["company", "=", company], ["is_group", "=", 0], ["disabled", "=", 0]], order_by: "name asc" });
    return r.map((x) => x.name);
  },
  async terms_templates() {
    const r = await getList("Terms and Conditions", { fields: ["name"], filters: [["disabled", "=", 0], ["buying", "=", 1]], order_by: "name asc" })
      .catch(() => getList("Terms and Conditions", { fields: ["name"], order_by: "name asc" }));
    return r.map((x) => x.name);
  },
  async naming_series({ doctype }) {
    if (!["Purchase Order", "Purchase Receipt"].includes(doctype)) throw new Error("Doctype tidak didukung");
    let options = [];
    let def = "";
    try {
      const j = await erpRaw("frappe.desk.form.load.getdoctype", { doctype });
      const meta = (j.docs || []).find((d) => d.name === doctype) || j.docs?.[0];
      const f = (meta?.fields || []).find((x) => x.fieldname === "naming_series");
      if (f) {
        options = String(f.options || "").split("\n").map((x) => x.trim()).filter(Boolean);
        def = f.default || "";
      }
    } catch {}
    if (!options.length) {
      const rows = await getList(doctype, { fields: ["naming_series"], order_by: "creation desc", limit_page_length: 200 }).catch(() => []);
      options = [...new Set(rows.map((r) => r.naming_series).filter(Boolean))];
    }
    return { options, default: options.includes(def) ? def : options[0] || "" };
  },
  async tujuan_options() {
    return tujuanOptions();
  },
  async dn_search(b) {
    return searchDn(b);
  },
  async se_preview({ dns, company }) {
    return collect(dns, company);
  },
  async se_create(b) {
    return createStockEntry(b); // tanpa lock: tidak berbagi state dengan PO/Receipt
  },
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
  async create({ supplier, company, items, naming_series, set_warehouse, cost_center, tc_name, terms_address, terms_extra }) {
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
          ...(naming_series ? { naming_series: String(naming_series) } : {}),
          ...(set_warehouse ? { set_warehouse } : {}),
          ...(cost_center ? { cost_center } : {}),
          ...(tc_name ? { tc_name } : {}),
          ...(buildTerms(terms_address, terms_extra) ? { terms: buildTerms(terms_address, terms_extra) } : {}),
          supplier,
          company,
          transaction_date: trx,
          schedule_date: schedule,
          docstatus: 0, // draft, tidak submit
          items: lines.map((l) => {
            const row = { ...l, schedule_date: clamp(l.schedule_date, trx) };
            if (desc[l.item_code]) row.description = desc[l.item_code];
            if (set_warehouse) row.warehouse = set_warehouse; // semua item mengikuti target warehouse
            if (cost_center) row.cost_center = cost_center;
            const cand = prices[l.item_code] || [];
            const hit = cand.find((c) => c.uom && c.uom === l.uom) || cand.find((c) => !c.uom) || cand[0];
            if (hit) row[cfg.selling_field] = hit.price_list_rate;
            Object.keys(row).forEach((k) => (row[k] == null || row[k] === "") && delete row[k]);
            return row;
          }),
        },
      });
      return { name: doc.name, url: `${cfg.erpnext_url}/app/purchase-order/${doc.name}`, summary, lines };
    } finally {
      await release(lock);
    }
  },
  async receipt_preview({ po, items }) {
    const { lines, summary, poRows } = await planReceipt(po, cleanRows(items));
    return { lines, summary, po_rows: poRows };
  },
  async receipt_create({ po, items, series, lines }) {
    const rows = cleanRows(items);
    const lock = await acquire();
    try {
      return await createReceipt(po, rows, series, lines);
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
