import { erp, getList } from "@/lib/erp";
import { allocate, cleanRows } from "@/lib/allocate";
import { acquire, release } from "@/lib/lock";

export const maxDuration = 60;

// tanggal lokal Jakarta (bukan UTC), format YYYY-MM-DD
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
// Required By tidak boleh lebih awal dari tanggal PO
const clamp = (d, min) => (!d || d < min ? min : d);

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
      const dates = lines.map((l) => clamp(l.schedule_date, trx)).sort();
      const schedule = dates[0] || trx;
      const doc = await erp("frappe.client.insert", {
        doc: {
          doctype: "Purchase Order",
          supplier,
          company,
          transaction_date: trx,
          schedule_date: schedule,
          docstatus: 1,
          items: lines.map((l) => {
            const row = { ...l, schedule_date: clamp(l.schedule_date, trx) };
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
