import { getList } from "./erp";
import { getSettings } from "./settings";

const r3 = (n) => Math.round(n * 1000) / 1000;
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// satuan berat -> kg
const KG = { kg: 1, kgs: 1, kilogram: 1, g: 0.001, gr: 0.001, gram: 0.001, grams: 0.001, mg: 1e-6, ton: 1000, tonne: 1000, mt: 1000, "metric ton": 1000, kuintal: 100, kwintal: 100, quintal: 100, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, oz: 0.0283495 };
const toKg = (uom) => KG[String(uom || "").trim().toLowerCase()];

export const NO_TUJUAN = "(Tanpa tujuan)";

// Semua Stock Entry "Material Transfer" berstatus draft, berat dihitung dari berat per unit di master Item,
// dikelompokkan per Tujuan.
export async function mutasiDraft({ company, from_date, to_date } = {}) {
  const cfg = getSettings();
  const tf = cfg.se_tujuan_field;
  const filters = [
    ["docstatus", "=", 0],
    ["stock_entry_type", "=", "Material Transfer"],
    ...(company ? [["company", "=", company]] : []),
    ...(from_date ? [["posting_date", ">=", from_date]] : []),
    ...(to_date ? [["posting_date", "<=", to_date]] : []),
  ];
  const base = ["name", "posting_date", "from_warehouse", "to_warehouse", "owner"];
  const args = { filters, order_by: "posting_date desc, creation desc" };
  let tujuanMissing = false;
  const heads = await getList("Stock Entry", { ...args, fields: [...base, tf] }).catch(() => {
    tujuanMissing = true; // field tujuan tidak ada / tidak terbaca
    return getList("Stock Entry", { ...args, fields: base });
  });

  const names = heads.map((h) => h.name);
  const items = (await Promise.all(chunk(names, 200).map((c) =>
    getList("Stock Entry Detail", { parent: "Stock Entry", fields: ["parent", "item_code", "item_name", "qty", "uom", "transfer_qty", "conversion_factor"], filters: [["parent", "in", c]] })
  ))).flat();

  const codes = [...new Set(items.map((i) => i.item_code))];
  const master = Object.fromEntries((await Promise.all(chunk(codes, 300).map((c) =>
    getList("Item", { fields: ["name", "weight_per_unit", "weight_uom"], filters: [["name", "in", c]] })
  ))).flat().map((i) => [i.name, i]));

  const byDoc = {};
  const noWeight = {};
  const assumed = new Set();
  for (const it of items) {
    const m = master[it.item_code] || {};
    const wpu = Number(m.weight_per_unit) || 0;
    const stockQty = Number(it.transfer_qty) || Number(it.qty) * (Number(it.conversion_factor) || 1);
    const d = (byDoc[it.parent] ||= { items: 0, qty: 0, kg: 0, noWeight: 0 });
    d.items += 1;
    d.qty = r3(d.qty + stockQty);
    if (!wpu) {
      d.noWeight += 1;
      (noWeight[it.item_code] ||= { item_code: it.item_code, item_name: it.item_name, docs: new Set() }).docs.add(it.parent);
      continue;
    }
    let f = toKg(m.weight_uom);
    if (f === undefined) { f = 1; assumed.add(m.weight_uom || "(kosong)"); }
    d.kg = r3(d.kg + stockQty * wpu * f);
  }

  const groups = {};
  for (const h of heads) {
    const t = String(h[tf] || "").trim() || NO_TUJUAN;
    const d = byDoc[h.name] || { items: 0, qty: 0, kg: 0, noWeight: 0 };
    const g = (groups[t] ||= { tujuan: t, docs: [], docs_count: 0, items_count: 0, kg: 0 });
    g.docs.push({ name: h.name, url: `${cfg.erpnext_url}/app/stock-entry/${h.name}`, posting_date: h.posting_date, from_warehouse: h.from_warehouse, to_warehouse: h.to_warehouse, owner: h.owner, ...d });
    g.docs_count += 1;
    g.items_count += d.items;
    g.kg = r3(g.kg + d.kg);
  }
  const list = Object.values(groups).sort((a, b) => (a.tujuan === NO_TUJUAN) - (b.tujuan === NO_TUJUAN) || a.tujuan.localeCompare(b.tujuan));
  return {
    tujuan_field: tf,
    tujuan_missing: tujuanMissing,
    groups: list,
    total: { docs: heads.length, groups: list.length, kg: r3(list.reduce((a, g) => a + g.kg, 0)) },
    no_weight: Object.values(noWeight).map((x) => ({ item_code: x.item_code, item_name: x.item_name, docs: [...x.docs] })),
    assumed_uom: [...assumed],
  };
}
