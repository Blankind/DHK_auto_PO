import { getList } from "./erp";
import { getSettings } from "./settings";

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const r2 = (n) => Math.round(n * 100) / 100;
const MAX_DAYS = 92; // batasi beban query & waktu respons (maxDuration 60 dtk)

// Unit HPP per item per tanggal dari Landed Cost Voucher yang sudah submit.
// Unit HPP = (rate beli x qty + biaya tambahan teralokasi) / qty
// Baris item sama dalam 1 voucher digabung (rata-rata tertimbang qty).
// Voucher lebih dari satu di hari yang sama: yang terbaru (creation) dipakai.
export async function lcvHpp({ company, from_date, to_date } = {}) {
  if (!from_date || !to_date) throw new Error("Rentang tanggal wajib diisi");
  if (from_date > to_date) throw new Error("Tanggal mulai tidak boleh setelah tanggal akhir");
  if ((new Date(to_date) - new Date(from_date)) / 864e5 > MAX_DAYS) throw new Error(`Rentang maksimal ${MAX_DAYS} hari. Persempit periode.`);
  const cfg = getSettings();

  // 1 query header + 1 query child per 200 voucher (tidak N+1 seperti frappe.client.get per voucher)
  const heads = await getList("Landed Cost Voucher", {
    fields: ["name", "posting_date"],
    filters: [
      ["docstatus", "=", 1],
      ["posting_date", ">=", from_date],
      ["posting_date", "<=", to_date],
      ...(company ? [["company", "=", company]] : []),
    ],
    order_by: "posting_date asc, creation asc",
  });

  const rows = (await Promise.all(chunk(heads.map((h) => h.name), 200).map((c) =>
    getList("Landed Cost Item", {
      parent: "Landed Cost Voucher",
      fields: ["parent", "item_code", "qty", "rate", "amount", "applicable_charges"],
      filters: [["parent", "in", c]],
    })
  ))).flat();

  // gabung per (voucher, item)
  const agg = {};
  let skipped = 0;
  for (const r of rows) {
    const qty = Number(r.qty) || 0;
    if (qty <= 0) { skipped += 1; continue; } // hindari bagi nol
    const rate = Number(r.rate) || (Number(r.amount) || 0) / qty;
    const a = ((agg[r.parent] ||= {})[r.item_code] ||= { qty: 0, base: 0, charges: 0 });
    a.qty += qty;
    a.base += rate * qty;
    a.charges += Number(r.applicable_charges) || 0;
  }

  const items = {};
  const datesSet = new Set();
  for (const h of heads) { // urut posting_date, creation: voucher terbaru menimpa
    const perItem = agg[h.name];
    if (!perItem) continue;
    datesSet.add(h.posting_date);
    for (const [code, a] of Object.entries(perItem)) {
      (items[code] ||= {})[h.posting_date] = { v: r2((a.base + a.charges) / a.qty), lcv: h.name };
    }
  }

  return {
    dates: [...datesSet].sort(),
    items,
    vouchers: heads.length,
    skipped,
    url_base: `${cfg.erpnext_url}/app/landed-cost-voucher/`,
  };
}
