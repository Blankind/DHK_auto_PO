"use client";
import { useEffect, useState } from "react";
import { call } from "@/lib/client";
import { addLog } from "@/lib/log";
import { fmt, num, readSheet } from "@/lib/excel";
import SeriesSelect from "@/components/SeriesSelect";

const ALIAS = {
  item_code: ["itemcode", "item", "code", "kodeitem", "kodebarang"],
  qty: ["qty", "quantity", "jumlah"],
  rate: ["rate", "harga", "hargabeli"],
  description: ["description", "deskripsi", "keterangan", "desc"],
};

export default function PurchaseOrder() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState("");
  const [series, setSeries] = useState("");
  const [supTxt, setSupTxt] = useState("");
  const [sups, setSups] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    Promise.all([call("companies"), call("default_company")])
      .then(([c, d]) => {
        setCompanies(c || []);
        setCompany(d || c?.[0] || "");
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (supTxt.length > 0) call("suppliers", { txt: supTxt }).then(setSups).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [supTxt]);

  const supplier = sups.find((s) => s.name === supTxt)?.name || "";
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const meta = { type: "PO", supplier, company, series, items: rows.length, qty: totalQty, file: fileName };

  const run = (name, fn) => async () => {
    setBusy(name);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
      addLog({ ...meta, action: name === "cek" ? "cek" : "buat", status: "gagal", message: e.message });
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
    const [kc, kq, kr, kd] = ["item_code", "qty", "rate", "description"].map((k) => pick(ALIAS[k]));
    if (!kc || !kq || !kr) {
      setRows([]);
      return setErr("Kolom wajib: Item Code, Qty, Rate (opsional: Description).");
    }
    setRows(
      raw
        .map((r) => ({ item_code: String(r[kc]).trim(), qty: num(r[kq]), rate: num(r[kr]), description: kd ? String(r[kd] ?? "").trim() : "" }))
        .filter((r) => r.item_code && r.qty > 0)
    );
  }

  const ready = company && rows.length;
  const check = run("cek", async () => {
    const p = await call("preview", { company, items: rows });
    setPreview(p);
    addLog({ ...meta, action: "cek", status: "ok", message: `${p.lines.length} baris PO` });
  });
  const create = run("buat", async () => {
    if (!confirm(`Buat Purchase Order (draft) untuk ${supplier}?\nDescription item akan ikut diperbarui.`)) return;
    const d = await call("create", { supplier, company, items: rows, naming_series: series });
    setDone(d);
    setPreview(null);
    addLog({ ...meta, action: "buat", status: "ok", ref: d.name, url: d.url, message: d.descErrors?.length ? `Description gagal: ${d.descErrors.join("; ")}` : "Draft dibuat" });
  });

  const sum = done?.summary || preview?.summary;
  const lines = done?.lines || preview?.lines;
  const mrQty = sum?.reduce((a, s) => a + s.mr_qty, 0) || 0;
  const stockQty = sum?.reduce((a, s) => a + s.stock_qty, 0) || 0;
  const hasInden = lines?.some((l) => l.item_inden);

  return (
    <main>
      <div className="page-head">
        <h1>Purchase Order</h1>
        <p>Upload Excel, qty dialokasikan ke Material Request aktif, sisanya menjadi pembelian stock.</p>
      </div>

      <div className="card">
        <h2 className="card-title">1. Data Purchase Order</h2>
        <div className="grid">
          <div>
            <label htmlFor="co">Company</label>
            <select id="co" value={company} onChange={(e) => setCompany(e.target.value)}>
              {companies.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="su">Supplier</label>
            <input id="su" list="sl" value={supTxt} onChange={(e) => setSupTxt(e.target.value)} placeholder="Ketik nama supplier" autoComplete="off" />
            <datalist id="sl">
              {sups.map((s) => <option key={s.name} value={s.name}>{s.supplier_name}</option>)}
            </datalist>
          </div>
          <div>
            <label htmlFor="ns">Naming Series</label>
            <SeriesSelect id="ns" doctype="Purchase Order" value={series} onChange={setSeries} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">2. File Excel <small><a href="/purchase_import_template.xlsx" download>Unduh template</a></small></h2>
        <label className="drop">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files[0])} />
          <span className="ic" aria-hidden>↑</span>
          <div>
            <b>{fileName || "Pilih file Excel / CSV"}</b>
            <span>{fileName ? `${rows.length} baris valid, total qty ${fmt(totalQty)}` : "Kolom: Item Code, Qty, Rate, Description"}</span>
          </div>
        </label>
        <div className="actions">
          <button className="btn sec" disabled={!ready || !!busy} onClick={check}>{busy === "cek" && <i className="spin" />}Cek Material Request</button>
          <button className="btn" disabled={!ready || !supplier || !preview || !!busy} onClick={create}>{busy === "buat" && <i className="spin" />}Buat Purchase Order</button>
        </div>
        {ready && !supplier && <p className="hint">Pilih supplier dari daftar saran agar tombol Buat aktif.</p>}
        {err && <div className="alert err" role="alert">{err}</div>}
        {done && (
          <div className="alert ok">
            Purchase Order <a href={done.url} target="_blank" rel="noreferrer"><b>{done.name}</b></a> dibuat sebagai draft.
            {done.descErrors?.length > 0 && <div>Description gagal diubah: {done.descErrors.join("; ")}</div>}
          </div>
        )}
      </div>

      {sum && (
        <>
          <div className="stats">
            <div className="stat"><span>Item</span><b>{sum.length}</b></div>
            <div className="stat"><span>Total qty</span><b>{fmt(mrQty + stockQty)}</b></div>
            <div className="stat"><span>Dari Material Request</span><b style={{ color: "var(--mr)" }}>{fmt(mrQty)}</b></div>
            <div className="stat"><span>Stock biasa</span><b style={{ color: "var(--stock)" }}>{fmt(stockQty)}</b></div>
          </div>
          <div className="card">
            <h2 className="card-title">Alokasi per item</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th className="n">Excel</th><th className="n">MR</th><th className="n">Stock</th><th>Komposisi</th></tr></thead>
                <tbody>
                  {sum.map((s) => (
                    <tr key={s.item_code}>
                      <td>{s.item_code}</td>
                      <td className="n">{fmt(s.excel_qty)}</td>
                      <td className="n">{fmt(s.mr_qty)}</td>
                      <td className="n">{fmt(s.stock_qty)}</td>
                      <td>
                        <div className="bar">
                          <i className="m" style={{ width: `${(s.mr_qty / s.excel_qty) * 100}%` }} />
                          <i className="s" style={{ width: `${(s.stock_qty / s.excel_qty) * 100}%` }} />
                        </div>
                      </td>
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
          <h2 className="card-title">Baris Purchase Order {preview && <small>Preview. Server menghitung ulang saat PO dibuat.</small>}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th className="n">Qty</th><th className="n">Rate</th><th>Sumber</th>{hasInden && <th>Item Inden</th>}</tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.item_code}</td>
                    <td className="n">{fmt(l.qty)}</td>
                    <td className="n">{fmt(l.rate)}</td>
                    <td>{l.material_request ? <span className="badge mr">{l.material_request}</span> : <span className="badge stock">Stock</span>}</td>
                    {hasInden && <td>{l.item_inden || "-"}</td>}
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
