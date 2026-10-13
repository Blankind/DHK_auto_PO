import { erp, erpRaw, getList } from "./erp";
import { getSettings } from "./settings";
import { dnRefs } from "./dnref";

const r6 = (n) => Math.round(n * 1e6) / 1e6;
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// Stok & valuation rate di source warehouse (tabel Bin). Item tanpa Bin = stok 0, rate 0.
async function stockInfo(codes, warehouse) {
  const bins = (await Promise.all(chunk(codes, 300).map((c) =>
    getList("Bin", { fields: ["item_code", "actual_qty", "valuation_rate"], filters: [["warehouse", "=", warehouse], ["item_code", "in", c]] })
  ))).flat();
  return Object.fromEntries(bins.map((b) => [b.item_code, { stock: Number(b.actual_qty) || 0, rate: Number(b.valuation_rate) || 0 }]));
}

// Pencarian DN:
// - token angka (mis. 0015) = cocokkan 4 digit terakhir nomor DN saja (tidak ikut mencari nama customer/telepon)
// - token teks, 1 kata = cari di nomor DN / nama customer; beberapa kata = nomor DN persis
// - cost_center (opsional) = batasi ke DN milik cost center itu
export async function searchDn({ txt = "", company, cost_center }) {
  const tokens = String(txt).split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return [];
  const filters = [["docstatus", "=", 0], ...(company ? [["company", "=", company]] : []), ...(cost_center ? [["cost_center", "=", cost_center]] : [])];
  const args = { fields: ["name", "customer", "customer_name", "posting_date"], order_by: "posting_date desc, creation desc", limit_page_length: 15 };
  const nums = tokens.filter((t) => /^\d+$/.test(t));
  const words = tokens.filter((t) => !/^\d+$/.test(t));
  const or = nums.map((t) => ["name", "like", `%${t}`]);
  if (words.length > 1) or.push(["name", "in", words]);
  else if (words.length === 1) {
    const like = `%${words[0]}%`;
    or.push(["name", "like", like], ["customer_name", "like", like], ["customer", "like", like]);
  }
  return getList("Delivery Note", { ...args, filters, or_filters: or });
}

// Ambil item dari DN terpilih; item yang sama (kode + UOM) diakumulasikan
export async function collect(dnNames, company, fromWarehouse) {
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
  // DN reference per baris item: gabungan DN yang menyumbang qty item itu (urut sesuai pilihan)
  const lines = [...acc.values()].filter((l) => l.qty > 0).map((l) => ({ ...l, dn_reference: dnRefs(l.sources.map((s) => by[s.dn])) }));
  if (!lines.length) throw new Error("Delivery Note terpilih tidak punya item");

  // cek stok & valuation di source warehouse (hanya penanda; tidak memblokir)
  let stockChecked = false;
  if (fromWarehouse) {
    try {
      const info = await stockInfo([...new Set(lines.map((l) => l.item_code))], fromWarehouse);
      const need = {};
      lines.forEach((l) => (need[l.item_code] = r6((need[l.item_code] || 0) + l.qty * l.conversion_factor)));
      lines.forEach((l) => {
        const b = info[l.item_code] || { stock: 0, rate: 0 };
        l.stock = b.stock;
        l.rate = b.rate;
        l.need = need[l.item_code];
        l.no_stock = b.stock <= 0;
        l.short = b.stock > 0 && b.stock < need[l.item_code];
        l.zero_rate = b.rate <= 0;
      });
      stockChecked = true;
    } catch {}
  }
  lines.forEach((l) => (l.key = `${l.item_code}|${l.uom}`));
  return { stock_checked: stockChecked, dns: names.map((n) => by[n]), lines, reference: dnRefs(names.map((n) => by[n])) };
}

export async function createStockEntry({ company, cost_center, from_warehouse, to_warehouse, dns, tujuan, exclude }) {
  if (!company || !cost_center || !from_warehouse || !to_warehouse) throw new Error("Company, Cost Center, Source Warehouse dan Target Warehouse wajib diisi");
  if (from_warehouse === to_warehouse) throw new Error("Source dan Target Warehouse tidak boleh sama");
  const all = await collect(dns, company, from_warehouse);
  const skip = new Set(exclude || []);
  const lines = all.lines.filter((l) => !skip.has(l.key));
  const skipped = all.lines.filter((l) => skip.has(l.key));
  if (!lines.length) throw new Error("Semua item dikeluarkan dari Stock Entry");
  const cfg = getSettings();

  // allow_zero_valuation_rate: item tanpa valuation rate / tanpa stok tetap bisa dibuat (draft)
  const build = (allZero) => ({
    doc: {
      doctype: "Stock Entry",
      stock_entry_type: "Material Transfer",
      purpose: "Material Transfer",
      company,
      cost_center,
      from_warehouse,
      to_warehouse,
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
        ...(allZero || l.zero_rate || l.no_stock ? { allow_zero_valuation_rate: 1 } : {}),
        [cfg.se_dn_field]: l.dn_reference, // custom_dn_reference ada di Stock Entry Detail (baris item)
      })),
    },
  });
  const hint = (e) => {
    const bad = lines.filter((l) => l.no_stock || l.short);
    return bad.length
      ? new Error(`${e.message} | Stok di ${from_warehouse}: ${bad.map((l) => `${l.item_code} (stok ${l.stock}, butuh ${l.need})`).join("; ")}. Hilangkan centang item itu lalu coba lagi.`)
      : e;
  };
  let doc;
  let retried = false;
  try {
    doc = await erp("frappe.client.insert", build(false));
  } catch (e) {
    if (!/valuation rate/i.test(e.message)) throw hint(e);
    retried = true; // valuation rate tidak terdeteksi di awal: ulangi dengan semua baris diizinkan 0
    doc = await erp("frappe.client.insert", build(true)).catch((e2) => { throw hint(e2); });
  }
  return {
    name: doc.name,
    url: `${cfg.erpnext_url}/app/stock-entry/${doc.name}`,
    lines,
    skipped: skipped.map((l) => l.item_code),
    zero_valuation: retried ? lines.map((l) => l.item_code) : lines.filter((l) => l.zero_rate || l.no_stock).map((l) => l.item_code),
    reference: all.reference,
  };
}

// Pilihan "Tujuan" diambil dari field di ERPNext (Select: daftar options, Link: daftar dokumen). Selain itu: input teks.
export async function tujuanOptions() {
  const field = getSettings().se_tujuan_field;
  try {
    const j = await erpRaw("frappe.desk.form.load.getdoctype", { doctype: "Stock Entry" });
    const meta = (j.docs || []).find((d) => d.name === "Stock Entry") || j.docs?.[0];
    const f = (meta?.fields || []).find((x) => x.fieldname === field);
    if (!f) return { field, type: "", options: [] };
    if (f.fieldtype === "Select") {
      return { field, type: "Select", options: String(f.options || "").split("\n").map((x) => x.trim()).filter(Boolean) };
    }
    if (f.fieldtype === "Link" && f.options) {
      const r = await getList(f.options, { fields: ["name"], order_by: "name asc", limit_page_length: 500 });
      return { field, type: "Link", options: r.map((x) => x.name) };
    }
    return { field, type: f.fieldtype || "", options: [] };
  } catch {
    return { field, type: "", options: [] };
  }
}
