import { erp, getList } from "./erp";
import { getSettings } from "./settings";
import { dnRefs } from "./dnref";

const r6 = (n) => Math.round(n * 1e6) / 1e6;

export async function searchDn({ txt = "", company }) {
  const tokens = String(txt).split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return [];
  const filters = [["docstatus", "=", 0], ...(company ? [["company", "=", company]] : [])];
  const args = { fields: ["name", "customer", "customer_name", "posting_date"], order_by: "posting_date desc, creation desc", limit_page_length: 30 };
  if (tokens.length > 1) return getList("Delivery Note", { ...args, filters: [...filters, ["name", "in", tokens]] });
  const like = `%${tokens[0]}%`;
  return getList("Delivery Note", { ...args, filters, or_filters: [["name", "like", like], ["customer_name", "like", like], ["customer", "like", like]] });
}

// Ambil item dari DN terpilih; item yang sama (kode + UOM) diakumulasikan
export async function collect(dnNames, company) {
  const names = [...new Set((dnNames || []).map((x) => String(x).trim()).filter(Boolean))];
  if (!names.length) throw new Error("Pilih minimal satu Delivery Note");
  const dns = await getList("Delivery Note", { fields: ["name", "customer", "customer_name", "posting_date", "company", "docstatus"], filters: [["name", "in", names]] });
  const by = Object.fromEntries(dns.map((d) => [d.name, d]));
  const missing = names.filter((n) => !by[n]);
  if (missing.length) throw new Error(`Delivery Note tidak ditemukan: ${missing.join(", ")}`);
  const bad = names.filter((n) => by[n].docstatus !== 0);
  if (bad.length) throw new Error(`Delivery Note sudah submit / dibatalkan (hanya DN draft yang bisa dipakai): ${bad.join(", ")}`);
  const other = company ? names.filter((n) => by[n].company !== company) : [];
  if (other.length) throw new Error(`Delivery Note beda company: ${other.join(", ")}`);

  const rows = await getList("Delivery Note Item", {
    parent: "Delivery Note",
    fields: ["parent", "idx", "item_code", "item_name", "qty", "uom", "stock_uom", "conversion_factor"],
    filters: [["parent", "in", names]],
    order_by: "parent asc, idx asc",
  });
  const order = Object.fromEntries(names.map((n, i) => [n, i]));
  rows.sort((a, b) => order[a.parent] - order[b.parent] || a.idx - b.idx);

  const acc = new Map();
  for (const r of rows) {
    const key = `${r.item_code}|${r.uom}`;
    const e = acc.get(key) || { item_code: r.item_code, item_name: r.item_name, uom: r.uom, stock_uom: r.stock_uom, conversion_factor: r.conversion_factor || 1, qty: 0, sources: [] };
    e.qty = r6(e.qty + Number(r.qty || 0));
    const src = e.sources.find((s) => s.dn === r.parent);
    if (src) src.qty = r6(src.qty + Number(r.qty || 0));
    else e.sources.push({ dn: r.parent, qty: r6(Number(r.qty || 0)) });
    acc.set(key, e);
  }
  const lines = [...acc.values()].filter((l) => l.qty > 0);
  if (!lines.length) throw new Error("Delivery Note terpilih tidak punya item");
  return { dns: names.map((n) => by[n]), lines, reference: dnRefs(names.map((n) => by[n])) };
}

export async function createStockEntry({ company, cost_center, from_warehouse, to_warehouse, dns, tujuan }) {
  if (!company || !cost_center || !from_warehouse || !to_warehouse) throw new Error("Company, Cost Center, Source Warehouse dan Target Warehouse wajib diisi");
  if (from_warehouse === to_warehouse) throw new Error("Source dan Target Warehouse tidak boleh sama");
  const { lines, reference } = await collect(dns, company);
  const cfg = getSettings();
  const doc = await erp("frappe.client.insert", {
    doc: {
      doctype: "Stock Entry",
      stock_entry_type: "Material Transfer",
      purpose: "Material Transfer",
      company,
      cost_center,
      from_warehouse,
      to_warehouse,
      [cfg.se_dn_field]: reference,
      ...(String(tujuan || "").trim() ? { [cfg.se_tujuan_field]: String(tujuan).trim() } : {}),
      docstatus: 0, // draft
      items: lines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        uom: l.uom,
        stock_uom: l.stock_uom,
        conversion_factor: l.conversion_factor,
        transfer_qty: r6(l.qty * l.conversion_factor),
        s_warehouse: from_warehouse,
        t_warehouse: to_warehouse,
        cost_center,
      })),
    },
  });
  return { name: doc.name, url: `${cfg.erpnext_url}/app/stock-entry/${doc.name}`, lines, reference };
}
