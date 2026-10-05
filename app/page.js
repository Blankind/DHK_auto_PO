"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { call } from "@/lib/client";

const ALIAS = {
  item_code: ["itemcode", "item", "code", "kodeitem", "kodebarang"],
  qty: ["qty", "quantity", "jumlah"],
  rate: ["rate", "harga", "hargabeli"],
  description: ["description", "deskripsi", "keterangan", "desc"],
};
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

function num(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "");
  return parseFloat(s) || 0;
}

export default function Page() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState("");
  const [supTxt, setSupTxt] = useState("");
  const [sups, setSups] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

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
  const run = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  async function onFile(f) {
    if (!f) return;
    setPreview(null);
    setDone(null);
    setErr("");
    setFileName(f.name);
    const wb = XLSX.read(await f.arrayBuffer());
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const keys = Object.keys(raw[0] || {});
    const pick = (f) => keys.find((k) => ALIAS[f].includes(norm(k)));
    const [kc, kq, kr, kd] = [pick("item_code"), pick("qty"), pick("rate"), pick("description")];
    if (!kc || !kq || !kr) {
      setRows([]);
      return setErr("Kolom wajib: Item Code, Qty, Rate.");
    }
    setRows(
      raw
        .map((r) => ({ item_code: String(r[kc]).trim(), qty: num(r[kq]), rate: num(r[kr]), description: kd ? String(r[kd] ?? "").trim() : "" }))
        .filter((r) => r.item_code && r.qty > 0)
    );
  }

  const ready = company && rows.length;
  const check = () => run(async () => setPreview(await call("preview", { company, items: rows })));
  const create = () =>
    run(async () => {
      if (!confirm("Buat Purchase Order (draft)? Description item akan ikut diperbarui.")) return;
      setDone(await call("create", { supplier, company, items: rows }));
      setPreview(null);
    });

  const sum = done?.summary || preview?.summary;
  const lines = done?.lines || preview?.lines;

  return (
    <main>
      <h1>Purchase Import</h1>
      <p className="sub"><a href="/receipt">Ke Purchase Receipt →</a> · <a href="/settings">Pengaturan</a></p>
      <p className="sub">Upload Excel, qty dialokasikan ke Material Request aktif, sisanya jadi pembelian stock.</p>

      <section>
        <div className="grid">
          <div>
            <label htmlFor="co">Company</label>
            <select id="co" value={company} onChange={(e) => setCompany(e.target.value)}>
              {companies.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="su">Supplier</label>
            <input id="su" list="sl" value={supTxt} onChange={(e) => setSupTxt(e.target.value)} placeholder="Ketik nama supplier" />
            <datalist id="sl">
              {sups.map((s) => <option key={s.name} value={s.name}>{s.supplier_name}</option>)}
            </datalist>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label htmlFor="fi">File Excel / CSV (Item Code, Qty, Rate, Description)</label>
          <input id="fi" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files[0])} />
          <p className="sub" style={{ margin: "6px 0 0" }}>
            {fileName && `${fileName}: ${rows.length} baris. `}
            <a href="/purchase_import_template.xlsx" download>Unduh template</a>
          </p>
        </div>
        <div className="row">
          <button className="ghost" disabled={!ready || busy} onClick={check}>Cek Material Request</button>
          <button disabled={!ready || !supplier || !preview || busy} onClick={create}>Buat Purchase Order</button>
        </div>
        {err && <div className="msg err" role="alert">{err}</div>}
        {done && (
          <div className="msg ok">
            Purchase Order <a href={done.url} target="_blank" rel="noreferrer">{done.name}</a> dibuat (draft).
            {done.descErrors?.length > 0 && <div>Description gagal diubah: {done.descErrors.join("; ")}</div>}
          </div>
        )}
      </section>

      {sum && (
        <section>
          <h2>Alokasi per item</h2>
          <div className="key">
            <span><b style={{ background: "var(--mr)" }} />Dari Material Request</span>
            <span><b style={{ background: "var(--stock)" }} />Stock biasa</span>
          </div>
          <div className="tbl">
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
        </section>
      )}

      {lines && (
        <section>
          <h2>Baris Purchase Order</h2>
          <div className="tbl">
            <table>
              <thead><tr><th>Item</th><th className="n">Qty</th><th className="n">Rate</th><th>Sumber</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.item_code}</td>
                    <td className="n">{fmt(l.qty)}</td>
                    <td className="n">{fmt(l.rate)}</td>
                    <td>{l.material_request ? <span className="tag m">{l.material_request}</span> : <span className="tag">Stock</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview && <p className="sub" style={{ margin: "12px 0 0" }}>Preview saja. Server menghitung ulang saat PO dibuat.</p>}
        </section>
      )}
    </main>
  );
}
