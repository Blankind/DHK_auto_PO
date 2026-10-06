"use client";
import { useState } from "react";
import { call } from "@/lib/client";
import { addLog } from "@/lib/log";
import { fmt, num, readSheet } from "@/lib/excel";
import SeriesSelect from "@/components/SeriesSelect";

const ALIAS = {
  item_code: ["itemcode", "item", "code", "kodeitem", "kodebarang"],
  qty: ["qty", "quantity", "jumlah"],
};

export default function Receipt() {
  const [po, setPo] = useState("");
  const [series, setSeries] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const meta = { type: "PR", po: po.trim(), series, items: rows.length, qty: totalQty, file: fileName };

  const run = (name, fn) => async () => {
    setBusy(name);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
      addLog({ ...meta, action: name, status: "gagal", message: e.message });
    }
    setBusy("");
  };

  async function onFile(f) {
    if (!f) return;
    setPreview(null);
    setDone(null);
    setErr("");
    setFileName(f.name);
    const { raw, pick } = await readSheet(f);
    const [kc, kq] = ["item_code", "qty"].map((k) => pick(ALIAS[k]));
    if (!kc || !kq) {
      setRows([]);
      return setErr("Kolom wajib: Item Code, Qty.");
    }
    setRows(raw.map((r) => ({ item_code: String(r[kc]).trim(), qty: num(r[kq]) })).filter((r) => r.item_code && r.qty > 0));
  }

  const ready = po.trim() && rows.length;
  const check = run("cek", async () => {
    const p = await call("receipt_preview", { po: po.trim(), items: rows });
    setPreview(p);
    addLog({ ...meta, action: "cek", status: "ok", message: `${p.lines.length} baris receipt` });
  });
  const create = run("buat", async () => {
    if (!confirm(`Buat Purchase Receipt dari ${po.trim()}?`)) return;
    const d = await call("receipt_create", { po: po.trim(), items: rows, series });
    setDone(d);
    setPreview(null);
    addLog({ ...meta, action: "buat", status: "ok", message: `PR ${d.name} (${d.submitted ? "submitted" : "draft"}) dari ${po.trim()}`, ref: d.name, url: d.url });
  });

  const sum = done?.summary || preview?.summary;
  const lines = done?.lines || preview?.lines;
  const hasExcess = sum?.some((s) => s.excess > 0);
  const mrQty = sum?.reduce((a, s) => a + s.mr_qty, 0) || 0;
  const stockQty = sum?.reduce((a, s) => a + s.stock_qty, 0) || 0;

  return (
    <main>
      <div className="page-head">
        <h1>Purchase Receipt</h1>
        <p>Input nomor PO (sudah submit) dan Excel penerimaan. Qty dialokasikan ke MR yang muat penuh, sisanya ke stock, lalu MR teratas.</p>
      </div>

      <div className="card">
        <h2 className="card-title">1. Data penerimaan</h2>
        <div className="grid">
          <div>
            <label htmlFor="po">Nomor PO</label>
            <input id="po" value={po} onChange={(e) => { setPo(e.target.value); setPreview(null); }} placeholder="PUR-ORD-2026-00001" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="ns">Naming Series</label>
            <SeriesSelect id="ns" doctype="Purchase Receipt" value={series} onChange={setSeries} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">2. File Excel <small><a href="/receipt_template.xlsx" download>Unduh template</a></small></h2>
        <label className="drop">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files[0])} />
          <span className="ic" aria-hidden>↑</span>
          <div>
            <b>{fileName || "Pilih file Excel / CSV"}</b>
            <span>{fileName ? `${rows.length} baris valid, total qty ${fmt(totalQty)}` : "Kolom: Item Code, Qty"}</span>
          </div>
        </label>
        <div className="actions">
          <button className="btn sec" disabled={!ready || !!busy} onClick={check}>{busy === "cek" && <i className="spin" />}Cek Alokasi</button>
          <button className="btn" disabled={!ready || !preview || hasExcess || !!busy} onClick={create}>{busy === "buat" && <i className="spin" />}Buat Purchase Receipt</button>
        </div>
        {err && <div className="alert err" role="alert">{err}</div>}
        {hasExcess && <div className="alert warn">Ada qty melebihi sisa PO. Perbaiki Excel dulu.</div>}
        {done && <div className="alert ok">Purchase Receipt <a href={done.url} target="_blank" rel="noreferrer"><b>{done.name}</b></a> dibuat ({done.submitted ? "submitted" : "draft"}).</div>}
      </div>

      {sum && (
        <>
          <div className="stats">
            <div className="stat"><span>Item</span><b>{sum.length}</b></div>
            <div className="stat"><span>Total qty</span><b>{fmt(totalQty)}</b></div>
            <div className="stat"><span>Ke Material Request</span><b style={{ color: "var(--mr)" }}>{fmt(mrQty)}</b></div>
            <div className="stat"><span>Ke Stock</span><b style={{ color: "var(--stock)" }}>{fmt(stockQty)}</b></div>
          </div>
          <div className="card">
            <h2 className="card-title">Alokasi per item</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th className="n">Excel</th><th className="n">MR</th><th className="n">Stock</th><th className="n">Lebih</th></tr></thead>
                <tbody>
                  {sum.map((s) => (
                    <tr key={s.item_code}>
                      <td>{s.item_code}</td>
                      <td className="n">{fmt(s.excel_qty)}</td>
                      <td className="n">{fmt(s.mr_qty)}</td>
                      <td className="n">{fmt(s.stock_qty)}</td>
                      <td className="n">{s.excess ? <span className="badge err">{fmt(s.excess)}</span> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {lines && (
        <div className="card">
          <h2 className="card-title">Baris Purchase Receipt {preview && <small>Preview. Server menghitung ulang saat dibuat.</small>}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th className="n">Qty</th><th>Sumber</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.item_code}</td>
                    <td className="n">{fmt(l.qty)}</td>
                    <td>{l.material_request ? <span className="badge mr">{l.material_request}</span> : <span className="badge stock">Stock</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
