import { erp, getList } from "./erp";
import { getSettings } from "./settings";

const r6 = (n) => Math.round(n * 1e6) / 1e6;
const MAKE_PR = "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt";

// Logika qty per item (pool = baris PO yang masih sisa, urut atas ke bawah):
// 1) MR teratas yang muat PENUH di sisa qty, ulangi sampai tidak ada yang muat
// 2) sisa qty -> baris stock (tanpa MR)
// 3) stock habis -> MR teratas (parsial)
// 4) masih sisa -> excess (melebihi PO)
export function allocateItem(pool, qty) {
  const mr = pool.filter((p) => p.material_request);
  const st = pool.filter((p) => !p.material_request);
  const out = [];
  let left = r6(qty);
  const take = (p, n, src) => {
    if (n <= 0) return;
    p.rem = r6(p.rem - n);
    left = r6(left - n);
    const hit = out.find((o) => o.p === p);
    if (hit) hit.qty = r6(hit.qty + n);
    else out.push({ p, qty: n, src });
  };
  for (;;) {
    const hit = mr.find((p) => p.rem > 0 && p.rem <= left);
    if (!hit || left <= 0) break;
    take(hit, hit.rem, "MR");
  }
  for (const p of st) if (left > 0) take(p, Math.min(left, p.rem), "Stock");
  for (const p of mr) if (left > 0) take(p, Math.min(left, p.rem), "MR");
  return { out, excess: left };
}

async function mapPO(po) {
  if (!po) throw new Error("Nomor PO wajib");
  const doc = await erp(MAKE_PR, { source_name: po });
  if (!doc?.items?.length) throw new Error(`PO ${po} tidak punya sisa item untuk diterima`);
  return doc;
}

export async function planReceipt(po, rows) {
  const doc = await mapPO(po);
  const pools = {};
  doc.items.forEach((it) => (pools[it.item_code] ||= []).push({ it, rem: r6(Number(it.qty) || 0), material_request: it.material_request || "" }));
  const unknown = [...new Set(rows.map((r) => r.item_code))].filter((c) => !pools[c]);
  if (unknown.length) throw new Error(`Item tidak ada di sisa PO ${po}: ${unknown.join(", ")}`);

  const lines = [];
  const summary = {};
  for (const r of rows) {
    const s = (summary[r.item_code] ||= { item_code: r.item_code, excel_qty: 0, mr_qty: 0, stock_qty: 0, excess: 0 });
    s.excel_qty = r6(s.excel_qty + r.qty);
    const { out, excess } = allocateItem(pools[r.item_code], r.qty);
    s.excess = r6(s.excess + excess);
    for (const o of out) {
      s[o.src === "MR" ? "mr_qty" : "stock_qty"] = r6(s[o.src === "MR" ? "mr_qty" : "stock_qty"] + o.qty);
      lines.push({ item_code: r.item_code, qty: o.qty, material_request: o.p.material_request || null, purchase_order_item: o.p.it.purchase_order_item, src: o.src });
    }
  }
  const used = new Set(rows.map((r) => r.item_code));
  const poRows = doc.items
    .filter((it) => used.has(it.item_code))
    .map((it) => ({
      purchase_order_item: it.purchase_order_item,
      item_code: it.item_code,
      material_request: it.material_request || null,
      item_inden: it.item_inden || null,
      remaining: r6(Number(it.qty) || 0),
    }));
  return { doc, lines, summary: Object.values(summary), poRows };
}

// Alokasi manual dari user: tiap baris wajib baris PO yang valid dan tidak melebihi sisa
function manualLines(doc, manual) {
  const by = Object.fromEntries(doc.items.map((i) => [i.purchase_order_item, i]));
  const sum = {};
  for (const m of manual || []) {
    const qty = Number(m.qty);
    if (!(qty > 0)) continue;
    const it = by[m.purchase_order_item];
    if (!it) throw new Error("Baris PO tidak ditemukan atau sudah selesai diterima. Cek alokasi ulang.");
    sum[m.purchase_order_item] = r6((sum[m.purchase_order_item] || 0) + qty);
    if (sum[m.purchase_order_item] > r6(Number(it.qty) || 0))
      throw new Error(`${it.item_code} (${it.material_request || "Stock"}): qty ${sum[m.purchase_order_item]} melebihi sisa ${it.qty}`);
  }
  const lines = Object.entries(sum).map(([poi, qty]) => ({
    item_code: by[poi].item_code,
    qty,
    material_request: by[poi].material_request || null,
    purchase_order_item: poi,
    src: by[poi].material_request ? "MR" : "Stock",
  }));
  if (!lines.length) throw new Error("Tidak ada baris dengan qty > 0");
  return lines;
}

function summarize(lines, rows) {
  const out = {};
  for (const r of rows) (out[r.item_code] ||= { item_code: r.item_code, excel_qty: 0, mr_qty: 0, stock_qty: 0, excess: 0 }).excel_qty = r6(out[r.item_code].excel_qty + r.qty);
  for (const l of lines) {
    const s = (out[l.item_code] ||= { item_code: l.item_code, excel_qty: 0, mr_qty: 0, stock_qty: 0, excess: 0 });
    s[l.src === "MR" ? "mr_qty" : "stock_qty"] = r6(s[l.src === "MR" ? "mr_qty" : "stock_qty"] + l.qty);
  }
  return Object.values(out);
}

const DROP = ["name", "owner", "creation", "modified", "modified_by", "parent", "parenttype", "parentfield", "amount", "base_amount", "net_amount", "base_net_amount", "stock_qty", "received_stock_qty"];
function clean(o) {
  if (Array.isArray(o)) return o.map(clean);
  if (o && typeof o === "object") {
    const n = {};
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith("__") || DROP.includes(k) || v == null) continue;
      n[k] = clean(v);
    }
    return n;
  }
  return o;
}

export async function createReceipt(po, rows, series, manual) {
  const plan = await planReceipt(po, rows);
  const { doc } = plan;
  const lines = manual?.length ? manualLines(doc, manual) : plan.lines;
  const summary = manual?.length ? summarize(lines, rows) : plan.summary;
  const bad = manual?.length ? [] : summary.filter((s) => s.excess > 0);
  if (bad.length) throw new Error(`Qty melebihi sisa PO: ${bad.map((s) => `${s.item_code} (lebih ${s.excess})`).join(", ")}`);
  // item_inden dari Purchase Order Item (jika field ada)
  const inden = await getList("Purchase Order Item", { parent: "Purchase Order", fields: ["name", "item_inden"], filters: [["parent", "=", po]] })
    .then((r) => Object.fromEntries(r.map((x) => [x.name, x.item_inden])))
    .catch(() => ({}));
  const byName = Object.fromEntries(doc.items.map((i) => [i.purchase_order_item, i]));
  const out = clean({ ...doc, items: [] });
  const cfg = getSettings();
  if (series) out.naming_series = String(series);
  out.docstatus = cfg.pr_submit ? 1 : 0;
  out.items = lines.map((l) => {
    const row = { ...clean(byName[l.purchase_order_item]), qty: l.qty, received_qty: l.qty, rejected_qty: 0 };
    const iv = inden[l.purchase_order_item] || row.item_inden;
    if (iv) row.item_inden = iv;
    return row;
  });
  const pr = await erp("frappe.client.insert", { doc: out });
  return { name: pr.name, url: `${cfg.erpnext_url}/app/purchase-receipt/${pr.name}`, summary, lines, submitted: out.docstatus === 1 };
}
