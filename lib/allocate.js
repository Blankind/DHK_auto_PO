import { getList } from "./erp";

const r6 = (n) => Math.round(n * 1e6) / 1e6;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function cleanRows(items) {
  const rows = (items || []).map((r, i) => {
    const item_code = String(r.item_code || "").trim();
    const qty = Number(r.qty);
    if (!item_code || !(qty > 0)) throw new Error(`Baris ${i + 1}: Item Code wajib dan Qty harus > 0`);
    return { item_code, qty, rate: Number(r.rate) || 0, description: String(r.description || "").trim() };
  });
  if (!rows.length) throw new Error("Data kosong");
  return rows;
}

export async function allocate(rows, company) {
  const codes = [...new Set(rows.map((r) => r.item_code))];

  const items = await getList("Item", { fields: ["name", "stock_uom"], filters: [["name", "in", codes]] });
  const stockUom = Object.fromEntries(items.map((i) => [i.name, i.stock_uom]));
  const missing = codes.filter((c) => !stockUom[c]);
  if (missing.length) throw new Error(`Item tidak ditemukan: ${missing.join(", ")}`);

  const mri = await getList("Material Request Item", {
    parent: "Material Request",
    fields: ["name", "parent", "item_code", "qty", "ordered_qty", "warehouse", "uom", "stock_uom", "conversion_factor", "schedule_date", "idx"],
    filters: [["item_code", "in", codes], ["docstatus", "=", 1]],
  });
  const open = mri.filter((m) => m.qty > (m.ordered_qty || 0));

  const parents = open.length
    ? await getList("Material Request", {
        fields: ["name", "transaction_date", "creation"],
        filters: [
          ["name", "in", [...new Set(open.map((m) => m.parent))]],
          ["docstatus", "=", 1],
          ["material_request_type", "=", "Purchase"],
          ["company", "=", company],
          ["status", "not in", ["Stopped", "Cancelled", "Ordered"]],
        ],
      })
    : [];
  const pmap = Object.fromEntries(parents.map((p) => [p.name, p]));

  const pool = {};
  open
    .filter((m) => pmap[m.parent])
    .sort((a, b) =>
      cmp(a.schedule_date || "", b.schedule_date || "") ||
      cmp(pmap[a.parent].transaction_date, pmap[b.parent].transaction_date) ||
      cmp(pmap[a.parent].creation, pmap[b.parent].creation) ||
      cmp(a.parent, b.parent) ||
      a.idx - b.idx
    )
    .forEach((m) => {
      m.remaining = r6(m.qty - (m.ordered_qty || 0));
      (pool[m.item_code] ||= []).push(m);
    });

  const defs = await getList("Item Default", {
    parent: "Item",
    fields: ["parent", "default_warehouse"],
    filters: [["parent", "in", codes], ["company", "=", company]],
  });
  const wh = Object.fromEntries(defs.map((d) => [d.parent, d.default_warehouse]));

  const lines = [];
  const summary = {};
  for (const r of rows) {
    const s = (summary[r.item_code] ||= { item_code: r.item_code, excel_qty: 0, mr_qty: 0, stock_qty: 0 });
    s.excel_qty = r6(s.excel_qty + r.qty);
    let left = r.qty;
    for (const m of pool[r.item_code] || []) {
      if (left <= 0) break;
      const take = Math.min(left, m.remaining);
      if (take <= 0) continue;
      m.remaining = r6(m.remaining - take);
      left = r6(left - take);
      s.mr_qty = r6(s.mr_qty + take);
      lines.push({
        item_code: r.item_code, qty: take, rate: r.rate,
        material_request: m.parent, material_request_item: m.name,
        warehouse: m.warehouse, uom: m.uom, stock_uom: m.stock_uom,
        conversion_factor: m.conversion_factor, schedule_date: m.schedule_date,
      });
    }
    if (left > 0) {
      s.stock_qty = r6(s.stock_qty + left);
      lines.push({
        item_code: r.item_code, qty: left, rate: r.rate,
        material_request: null, material_request_item: null,
        warehouse: wh[r.item_code] || undefined,
        uom: stockUom[r.item_code], stock_uom: stockUom[r.item_code], conversion_factor: 1,
      });
    }
  }
  return { lines, summary: Object.values(summary) };
}
