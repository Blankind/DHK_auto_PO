"use client";
import { useState } from "react";
import * as XLSX from "xlsx";

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const A = { item_code: ["itemcode", "item", "code", "kodeitem", "kodebarang"], qty: ["qty", "quantity", "jumlah"] };
const fmt = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });
function num(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "");
  return parseFloat(s) || 0;
}
async function call(action, body) {
  const r = await fetch(`/api/erp/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Permintaan gagal");
  return j;
}

export default function Receipt() {
  const [po, setPo] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setErr("");
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  async function onFile(f) {
    if (!f) return;
    setPreview(null); setDone(null); setErr(""); setFileName(f.name);
    const wb = XLSX.read(await f.arrayBuffer());
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const keys = Object.keys(raw[0] || {});
    const kc = keys.find((k) => A.item_code.includes(norm(k)));
    const kq = keys.find((k) => A.qty.includes(norm(k)));
    if (!kc || !kq) { setRows([]); return setErr("Kolom wajib: Item Code, Qty."); }
    setRows(raw.map((r) => ({ item_code: String(r[kc]).trim(), qty: num(r[kq]) })).filter((r) => r.item_code && r.qty > 0));
  }

  const ready = po.trim() && rows.length;
  const check = () => run(async () => setPreview(await call("receipt_preview", { po: po.trim(), items: rows })));
  const create = () => run(async () => {
    if (!confirm("Buat Purchase Receipt?")) return;
    setDone(await call("receipt_create", { po: po.trim(), items: rows }));
    setPreview(null);
  });

  const sum = done?.summary || preview?.summary;
  const lines = done?.lines || preview?.lines;
  const hasExcess = sum?.some((s) => s.excess > 0);

  return (
    <main>
      <h1>Purchase Receipt</h1>
      <p className="sub"><a href="/">← Ke Purchase Import</a></p>
      <p className="sub">Input nomor PO dan Excel penerimaan. Qty dialokasikan ke MR yang muat penuh, sisanya ke stock, lalu MR teratas.</p>
      <section>
        <label htmlFor="po">Nomor PO</label>
        <input id="po" value={po} onChange={(e) => { setPo(e.target.value); setPreview(null); }} placeholder="PUR-ORD-2026-00001" />
        <div style={{ marginTop: 16 }}>
          <label htmlFor="fi">File Excel / CSV (Item Code, Qty)</label>
          <input id="fi" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files[0])} />
          <p className="sub" style={{ margin: "6px 0 0" }}>
            {fileName && `${fileName}: ${rows.length} baris. `}
            <a href="/receipt_template.xlsx" download>Unduh template</a>
          </p>
        </div>
        <div className="row">
          <button className="ghost" disabled={!ready || busy} onClick={check}>Cek Alokasi</button>
          <button disabled={!ready || !preview || hasExcess || busy} onClick={create}>Buat Purchase Receipt</button>
        </div>
        {err && <div className="msg err" role="alert">{err}</div>}
        {hasExcess && <div className="msg err">Ada qty melebihi sisa PO. Perbaiki Excel dulu.</div>}
        {done && <div className="msg ok">Purchase Receipt <a href={done.url} target="_blank" rel="noreferrer">{done.name}</a> dibuat ({done.submitted ? "submitted" : "draft"}).</div>}
      </section>

      {sum && (
        <section>
          <h2>Alokasi per item</h2>
          <div className="tbl"><table>
            <thead><tr><th>Item</th><th className="n">Excel</th><th className="n">MR</th><th className="n">Stock</th><th className="n">Lebih</th></tr></thead>
            <tbody>{sum.map((s) => (
              <tr key={s.item_code}><td>{s.item_code}</td><td className="n">{fmt(s.excel_qty)}</td><td className="n">{fmt(s.mr_qty)}</td><td className="n">{fmt(s.stock_qty)}</td><td className="n">{s.excess ? fmt(s.excess) : "-"}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {lines && (
        <section>
          <h2>Baris Purchase Receipt</h2>
          <div className="tbl"><table>
            <thead><tr><th>Item</th><th className="n">Qty</th><th>Sumber</th></tr></thead>
            <tbody>{lines.map((l, i) => (
              <tr key={i}><td>{l.item_code}</td><td className="n">{fmt(l.qty)}</td><td>{l.material_request ? <span className="tag m">{l.material_request}</span> : <span className="tag">Stock</span>}</td></tr>
            ))}</tbody>
          </table></div>
          {preview && <p className="sub" style={{ margin: "12px 0 0" }}>Preview saja. Server menghitung ulang saat dibuat.</p>}
        </section>
      )}
    </main>
  );
}
