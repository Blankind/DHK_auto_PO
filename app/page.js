"use client";
import { useEffect, useState } from "react";
import { call } from "@/lib/client";
import { addLog } from "@/lib/log";
import { fmt, num, readSheet } from "@/lib/excel";
import SeriesSelect from "@/components/SeriesSelect";
import { ADDRESSES, addressFor } from "@/lib/addresses";

const PICKUP = "LOCO diambil sendiri";
const pref = (k) => { try { return localStorage.getItem(`dhk_po_${k}`) || ""; } catch { return ""; } };
const setPref = (k, v) => { try { localStorage.setItem(`dhk_po_${k}`, v); } catch {} };

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
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState("");
  const [costCenters, setCostCenters] = useState([]);
  const [costCenter, setCostCenter] = useState("");
  const [templates, setTemplates] = useState([]);
  const [tcName, setTcName] = useState("");
  const [addrId, setAddrId] = useState("");
  const [pickup, setPickup] = useState(PICKUP);
  const [other, setOther] = useState("");
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
    call("terms_templates").then((t) => { setTemplates(t); setTcName(t.includes(pref("tc")) ? pref("tc") : ""); }).catch(() => {});
    setPickup(pref("pickup") === "Others" ? "Others" : PICKUP);
  }, []);

  useEffect(() => {
    if (!company) return;
    call("warehouses", { company })
      .then((w) => {
        setWarehouses(w);
        const v = w.includes(pref("wh")) ? pref("wh") : "";
        setWarehouse(v);
        setAddrId(addressFor(v)?.id || "");
      })
      .catch(() => setWarehouses([]));
    call("cost_centers", { company })
      .then((c) => { setCostCenters(c); setCostCenter(c.includes(pref("cc")) ? pref("cc") : ""); })
      .catch(() => setCostCenters([]));
  }, [company]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (supTxt.length > 0) call("suppliers", { txt: supTxt }).then(setSups).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [supTxt]);

  const onWarehouse = (v) => { setWarehouse(v); setPref("wh", v); setAddrId(addressFor(v)?.id || ""); };
  const address = ADDRESSES.find((a) => a.id === addrId)?.text || "";
  const extra = pickup === "Others" ? other.trim() : pickup;
  const termsOk = pickup !== "Others" || !!other.trim();

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
    const d = await call("create", { supplier, company, items: rows, naming_series: series, set_warehouse: warehouse, cost_center: costCenter, tc_name: tcName, terms_address: address, terms_extra: extra });
    setDone(d);
    setPreview(null);
    addLog({ ...meta, action: "buat", status: "ok", ref: d.name, url: d.url, message: `Draft dibuat${warehouse ? ` · WH ${warehouse}` : ""}${costCenter ? ` · CC ${costCenter}` : ""}${d.descErrors?.length ? ` · Description gagal: ${d.descErrors.join("; ")}` : ""}` });
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
        <div className="grid" style={{ marginTop: 16 }}>
          <div>
            <label htmlFor="wh">Target Warehouse (set_warehouse)</label>
            <select id="wh" value={warehouse} onChange={(e) => onWarehouse(e.target.value)}>
              <option value="">- Ikuti warehouse di MR -</option>
              {warehouses.map((w) => <option key={w}>{w}</option>)}
            </select>
            <p className="hint">Jika dipilih, semua item PO memakai warehouse ini.</p>
          </div>
          <div>
            <label htmlFor="cc">Cost Center</label>
            <select id="cc" value={costCenter} onChange={(e) => { setCostCenter(e.target.value); setPref("cc", e.target.value); }}>
              <option value="">- Default ERPNext -</option>
              {costCenters.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tc">Terms Template (tc_name)</label>
            <select id="tc" value={tcName} onChange={(e) => { setTcName(e.target.value); setPref("tc", e.target.value); }}>
              <option value="">- Tanpa template -</option>
              {templates.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">2. Terms and Conditions <small>Diisi ke tab Terms di PO</small></h2>
        <div className="grid">
          <div>
            <label htmlFor="ad">Alamat pengiriman</label>
            <select id="ad" value={addrId} onChange={(e) => setAddrId(e.target.value)}>
              <option value="">- Tanpa alamat -</option>
              {ADDRESSES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <p className="hint">Otomatis mengikuti warehouse, bisa diubah manual.</p>
          </div>
          <div>
            <label htmlFor="pk">Pengambilan</label>
            <select id="pk" value={pickup} onChange={(e) => { setPickup(e.target.value); setPref("pickup", e.target.value); }}>
              <option value={PICKUP}>{PICKUP}</option>
              <option value="Others">Others</option>
            </select>
          </div>
          {pickup === "Others" && (
            <div>
              <label htmlFor="ot">Others (isi manual)</label>
              <input id="ot" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Tulis keterangan pengambilan" />
            </div>
          )}
        </div>
        <label style={{ marginTop: 16 }}>Hasil di Terms and Conditions</label>
        <div className="drop" style={{ cursor: "default", display: "block", lineHeight: 1.7 }}>
          {address || extra ? <>{address && <div>{address}</div>}{extra && <div>{extra}</div>}</> : <span>Belum ada isi.</span>}
        </div>
        {!termsOk && <p className="hint" style={{ color: "var(--err)" }}>Isi keterangan “Others” terlebih dahulu.</p>}
      </div>

      <div className="card">
        <h2 className="card-title">3. File Excel <small><a href="/purchase_import_template.xlsx" download>Unduh template</a></small></h2>
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
          <button className="btn" disabled={!ready || !supplier || !preview || !termsOk || !!busy} onClick={create}>{busy === "buat" && <i className="spin" />}Buat Purchase Order</button>
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
