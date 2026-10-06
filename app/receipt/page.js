"use client";
import { useMemo, useState } from "react";
import { call } from "@/lib/client";
import { addLog } from "@/lib/log";
import { fmt, num, readSheet } from "@/lib/excel";
import SeriesSelect from "@/components/SeriesSelect";

const ALIAS = {
  item_code: ["itemcode", "item", "code", "kodeitem", "kodebarang"],
  qty: ["qty", "quantity", "jumlah"],
};
const r6 = (n) => Math.round(n * 1e6) / 1e6;
let uid = 0;
const toEdit = (lines) => lines.map((l) => ({ id: ++uid, poi: l.purchase_order_item, qty: String(l.qty) }));
const label = (r) => `${r.material_request || "Stock"}${r.item_inden ? ` · ${r.item_inden}` : ""} (sisa ${fmt(r.remaining)})`;

export default function Receipt() {
  const [po, setPo] = useState("");
  const [series, setSeries] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState([]);
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
    setEdit([]);
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

  // ---- state turunan dari alokasi yang sedang diedit
  const poRows = preview?.po_rows || [];
  const rowMap = useMemo(() => Object.fromEntries(poRows.map((r) => [r.purchase_order_item, r])), [poRows]);
  const used = useMemo(() => {
    const u = {};
    edit.forEach((e) => (u[e.poi] = r6((u[e.poi] || 0) + (Number(e.qty) || 0))));
    return u;
  }, [edit]);
  const over = (poi) => (used[poi] || 0) > (rowMap[poi]?.remaining ?? 0) + 1e-9;
  const anyOver = edit.some((e) => over(e.poi));

  const editSum = useMemo(() => {
    const m = {};
    rows.forEach((r) => ((m[r.item_code] ||= { item_code: r.item_code, excel_qty: 0, mr_qty: 0, stock_qty: 0 }).excel_qty += r.qty));
    edit.forEach((e) => {
      const pr = rowMap[e.poi];
      if (!pr || !m[pr.item_code]) return;
      m[pr.item_code][pr.material_request ? "mr_qty" : "stock_qty"] += Number(e.qty) || 0;
    });
    return Object.values(m).map((s) => ({ ...s, diff: r6(s.excel_qty - s.mr_qty - s.stock_qty) }));
  }, [rows, edit, rowMap]);
  const hasDiff = editSum.some((s) => s.diff !== 0);
  const validLines = edit.filter((e) => Number(e.qty) > 0);
  const edited = preview && JSON.stringify(toEdit(preview.lines).map((e) => [e.poi, Number(e.qty)])) !== JSON.stringify(validLines.map((e) => [e.poi, Number(e.qty)]));

  const setQty = (id, qty) => setEdit((p) => p.map((e) => (e.id === id ? { ...e, qty } : e)));
  const setSrc = (id, poi) => setEdit((p) => p.map((e) => (e.id === id ? { ...e, poi } : e)));
  const remove = (id) => setEdit((p) => p.filter((e) => e.id !== id));
  const addLine = (code) => {
    const cands = poRows.filter((r) => r.item_code === code);
    const free = cands.find((r) => (used[r.purchase_order_item] || 0) < r.remaining) || cands[0];
    if (free) setEdit((p) => [...p, { id: ++uid, poi: free.purchase_order_item, qty: String(Math.max(0, r6(free.remaining - (used[free.purchase_order_item] || 0)))) }]);
  };

  const ready = po.trim() && rows.length;
  const check = run("cek", async () => {
    const p = await call("receipt_preview", { po: po.trim(), items: rows });
    setPreview(p);
    setEdit(toEdit(p.lines));
    addLog({ ...meta, action: "cek", status: "ok", message: `${p.lines.length} baris receipt` });
  });
  const create = run("buat", async () => {
    const warn = hasDiff ? "\n\nPERHATIAN: total alokasi tidak sama dengan qty di Excel." : "";
    if (!confirm(`Buat Purchase Receipt dari ${po.trim()}?${warn}`)) return;
    const lines = validLines.map((e) => ({ purchase_order_item: e.poi, qty: Number(e.qty) }));
    const d = await call("receipt_create", { po: po.trim(), items: rows, series, lines });
    setDone(d);
    setPreview(null);
    setEdit([]);
    addLog({ ...meta, action: "buat", status: "ok", ref: d.name, url: d.url, message: `PR ${d.name} (${d.submitted ? "submitted" : "draft"}) dari ${po.trim()}${edited ? ", alokasi diubah manual" : ""}` });
  });

  const doneSum = done?.summary?.map((s) => ({ ...s, diff: r6(s.excel_qty - s.mr_qty - s.stock_qty) }));
  const sum = preview ? editSum : doneSum;
  const mrQty = sum?.reduce((a, s) => a + s.mr_qty, 0) || 0;
  const stockQty = sum?.reduce((a, s) => a + s.stock_qty, 0) || 0;

  return (
    <main>
      <div className="page-head">
        <h1>Purchase Receipt</h1>
        <p>Input nomor PO (sudah submit) dan Excel penerimaan. Alokasi otomatis bisa diubah sebelum dokumen dibuat.</p>
      </div>

      <div className="card">
        <h2 className="card-title">1. Data penerimaan</h2>
        <div className="grid">
          <div>
            <label htmlFor="po">Nomor PO</label>
            <input id="po" value={po} onChange={(e) => { setPo(e.target.value); setPreview(null); setEdit([]); }} placeholder="PUR-ORD-2026-00001" autoComplete="off" />
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
          <button className="btn" disabled={!preview || !validLines.length || anyOver || !!busy} onClick={create}>{busy === "buat" && <i className="spin" />}Buat Purchase Receipt</button>
        </div>
        {err && <div className="alert err" role="alert">{err}</div>}
        {anyOver && <div className="alert warn">Ada qty yang melebihi sisa baris PO (ditandai merah). Kurangi qty atau pindahkan ke baris lain.</div>}
        {preview && !anyOver && hasDiff && <div className="alert warn">Total alokasi berbeda dari qty Excel. Lihat kolom Selisih; dokumen tetap bisa dibuat setelah konfirmasi.</div>}
        {done && <div className="alert ok">Purchase Receipt <a href={done.url} target="_blank" rel="noreferrer"><b>{done.name}</b></a> dibuat ({done.submitted ? "submitted" : "draft"}).</div>}
      </div>

      {sum && (
        <>
          <div className="stats">
            <div className="stat"><span>Item</span><b>{sum.length}</b></div>
            <div className="stat"><span>Total qty Excel</span><b>{fmt(totalQty)}</b></div>
            <div className="stat"><span>Ke Material Request</span><b style={{ color: "var(--mr)" }}>{fmt(mrQty)}</b></div>
            <div className="stat"><span>Ke Stock</span><b style={{ color: "var(--stock)" }}>{fmt(stockQty)}</b></div>
          </div>
          <div className="card">
            <h2 className="card-title">Ringkasan per item</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th className="n">Excel</th><th className="n">MR</th><th className="n">Stock</th><th className="n">Selisih</th>{preview && <th />}</tr></thead>
                <tbody>
                  {sum.map((s) => (
                    <tr key={s.item_code}>
                      <td>{s.item_code}</td>
                      <td className="n">{fmt(s.excel_qty)}</td>
                      <td className="n">{fmt(s.mr_qty)}</td>
                      <td className="n">{fmt(s.stock_qty)}</td>
                      <td className="n">{s.diff ? <span className="badge err">{s.diff > 0 ? "+" : ""}{fmt(s.diff)}</span> : <span className="badge ok">OK</span>}</td>
                      {preview && <td className="n"><button className="btn sec sm" onClick={() => addLine(s.item_code)}>+ Baris</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview && <p className="hint">Selisih = qty Excel dikurangi total alokasi. Positif berarti belum teralokasi, negatif berarti berlebih.</p>}
          </div>
        </>
      )}

      {preview && (
        <div className="card">
          <h2 className="card-title">
            Alokasi Purchase Receipt <small>Ubah sumber atau qty sesuai kebutuhan {edited && <span className="badge info">diubah manual</span>}</small>
          </h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Sumber (MR / Stock)</th><th className="n">Qty</th><th className="n">Sisa baris PO</th><th /></tr></thead>
              <tbody>
                {edit.map((e) => {
                  const pr = rowMap[e.poi];
                  const bad = over(e.poi);
                  return (
                    <tr key={e.id} style={bad ? { background: "var(--err-bg)" } : undefined}>
                      <td>{pr?.item_code}</td>
                      <td>
                        <select value={e.poi} onChange={(ev) => setSrc(e.id, ev.target.value)} style={{ minWidth: 260 }} aria-label="Sumber alokasi">
                          {poRows.filter((r) => r.item_code === pr?.item_code).map((r) => (
                            <option key={r.purchase_order_item} value={r.purchase_order_item}>{label(r)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="n"><input type="number" min="0" step="any" value={e.qty} onChange={(ev) => setQty(e.id, ev.target.value)} style={{ width: 110, textAlign: "right" }} aria-label="Qty" /></td>
                      <td className="n">{bad ? <span className="badge err">{fmt(used[e.poi])} / {fmt(pr?.remaining)}</span> : fmt(pr?.remaining)}</td>
                      <td className="n"><button className="btn sec sm" onClick={() => remove(e.id)}>Hapus</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!edit.length && <div className="empty">Belum ada baris. Gunakan “+ Baris” pada ringkasan.</div>}
          </div>
          <div className="actions">
            <button className="btn sec sm" onClick={() => setEdit(toEdit(preview.lines))}>Reset ke alokasi otomatis</button>
          </div>
        </div>
      )}

      {done && (
        <div className="card">
          <h2 className="card-title">Baris Purchase Receipt</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th className="n">Qty</th><th>Sumber</th></tr></thead>
              <tbody>
                {done.lines.map((l, i) => (
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
