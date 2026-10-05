import { erp, getList } from "@/lib/erp";
import { allocate, cleanRows } from "@/lib/allocate";
import { acquire, release } from "@/lib/lock";

export const maxDuration = 60;

// tanggal lokal Jakarta (bukan UTC), format YYYY-MM-DD
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
// Required By tidak boleh lebih awal dari tanggal PO
const clamp = (d, min) => (!d || d < min ? min : d);

// daftar price list jual, urut prioritas (pisah koma). Yang pertama punya harga valid dipakai.
const SELLING_LISTS = (process.env.SELLING_PRICE_LISTS || "Grosir,88,LM 88").split(",").map((x) => x.trim()).filter(Boolean);
const SELLING_FIELD = process.env.PO_SELLING_FIELD || "price_list_rate_selling";

// harga jual (Item Price selling) dari ketiga price list, yang berlaku pada tanggal PO
async function sellingPrices(codes, date) {
  const rows = await getList("Item Price", {
    fields: ["item_code", "price_list", "price_list_rate", "valid_from", "valid_upto", "uom", "creation"],
    filters: [["item_code", "in", codes], ["selling", "=", 1], ["price_list", "in", SELLING_LISTS]],
  });
  const map = {};
  rows
    .filter((r) => (!r.valid_from || r.valid_from <= date) && (!r.valid_upto || r.valid_upto >= date))
    .sort((a, b) =>
      SELLING_LISTS.indexOf(a.price_list) - SELLING_LISTS.indexOf(b.price_list) ||
      (b.valid_from || "").localeCompare(a.valid_from || "") ||
      (b.creation || "").localeCompare(a.creation || ""))
    .forEach((r) => { (map[r.item_code] ||= []).push(r); });
  return map;
}

const handlers = {
  async companies() {
    return (await getList("Company", { fields: ["name"] })).map((c) => c.name);
  },
  async default_company() {
    return process.env.DEFAULT_COMPANY || null;
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
    const lock = await acquire();
    try {
      // hitung ulang: jangan pakai hasil preview lama
      const { lines, summary } = await allocate(rows, company);
      const trx = today();
      const prices = await sellingPrices([...new Set(lines.map((l) => l.item_code))], trx);
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
            const cand = prices[l.item_code] || [];
            const hit = cand.find((c) => c.uom && c.uom === l.uom) || cand.find((c) => !c.uom) || cand[0];
            if (hit) row[SELLING_FIELD] = hit.price_list_rate;
            Object.keys(row).forEach((k) => (row[k] == null || row[k] === "") && delete row[k]);
            return row;
          }),
        },
      });
      return { name: doc.name, url: `${process.env.ERPNEXT_URL}/app/purchase-order/${doc.name}`, summary, lines };
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
  try {
    return Response.json((await h(body)) ?? null);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
