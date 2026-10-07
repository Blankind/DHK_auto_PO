"use client";
import { useEffect, useState } from "react";
import { call } from "@/lib/client";
import { addLog } from "@/lib/log";
import { fmt } from "@/lib/excel";
import { dnRef, dnRefs } from "@/lib/dnref";

const pref = (k) => { try { return localStorage.getItem(`dhk_se_${k}`) || ""; } catch { return ""; } };
const setPref = (k, v) => { try { localStorage.setItem(`dhk_se_${k}`, v); } catch {} };

export default function StockEntry() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState("");
  const [costCenters, setCostCenters] = useState([]);
  const [costCenter, setCostCenter] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [tujuanOpts, setTujuanOpts] = useState([]);

  const [filterCc, setFilterCc] = useState(true);
  const [txt, setTxt] = useState("");
  const [found, setFound] = useState([]);
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    Promise.all([call("companies"), call("default_company")])
      .then(([c, d]) => { setCompanies(c || []); setCompany(d || c?.[0] || ""); })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    call("tujuan_options").then((r) => setTujuanOpts(r.options || [])).catch(() => setTujuanOpts([]));
  }, []);

  useEffect(() => {
    if (!company) return;
    setSelected([]); setPreview(null); setFound([]);
    call("cost_centers", { company }).then((c) => { setCostCenters(c); setCostCenter(c.includes(pref("cc")) ? pref("cc") : ""); }).catch(() => setCostCenters([]));
    call("warehouses", { company }).then((w) => { setWarehouses(w); setFrom(w.includes(pref("from")) ? pref("from") : ""); setTo(w.includes(pref("to")) ? pref("to") : ""); }).catch(() => setWarehouses([]));
  }, [company]);

  // Tujuan sudah diisi -> pencarian DN dipersempit ke cost center yang dipilih
  const ccFilter = tujuan.trim() && filterCc && costCenter ? costCenter : "";

  useEffect(() => {
    const t = setTimeout(() => {
      if (txt.trim().length >= 2) call("dn_search", { txt, company, cost_center: ccFilter || undefined }).then(setFound).catch((e) => setErr(e.message));
      else setFound([]);
    }, 350);
    return () => clearTimeout(t);
  }, [txt, company, ccFilter]);

  const sameWh = from && to && from === to;
  const headOk = company && costCenter && from && to && !sameWh;
  const names = selected.map((d) => d.name);
  const total = preview?.lines.reduce((a, l) => a + l.qty, 0) || 0;
  const where = `${from} → ${to} · CC ${costCenter}${tujuan.trim() ? ` · Tujuan: ${tujuan.trim()}` : ""}`;
  const meta = { type: "SE", po: dnRefs(selected), message: where };

  const add = (d) => { setSelected((p) => (p.some((x) => x.name === d.name) ? p : [...p, d])); setPreview(null); setDone(null); };
  const remove = (n) => { setSelected((p) => p.filter((x) => x.name !== n)); setPreview(null); };
  const addAll = () => found.forEach(add);

  const run = (name, fn) => async () => {
    setBusy(name); setErr("");
    try { await fn(); } catch (e) { setErr(e.message); addLog({ ...meta, action: name, status: "gagal", message: e.message }); }
    setBusy("");
  };

  const load = run("cek", async () => {
    const p = await call("se_preview", { dns: names, company });
    setPreview(p);
    addLog({ ...meta, action: "cek", status: "ok", items: p.lines.length, qty: p.lines.reduce((a, l) => a + l.qty, 0), message: `${p.lines.length} item dari ${names.length} DN` });
  });
  const create = run("buat", async () => {
    if (!confirm(`Buat Stock Entry (draft)?\n${from} → ${to}`)) return;
    const d = await call("se_create", { company, cost_center: costCenter, from_warehouse: from, to_warehouse: to, dns: names, tujuan });
    setDone(d);
    setPreview(null);
    addLog({ ...meta, action: "buat", status: "ok", ref: d.name, url: d.url, items: d.lines.length, qty: d.lines.reduce((a, l) => a + l.qty, 0), message: `Draft dibuat · ${where}` });
  });

  const WhSelect = ({ id, value, set, k, exclude }) => (
    <select id={id} value={value} onChange={(e) => { set(e.target.value); setPref(k, e.target.value); setPreview(null); }}>
      <option value="">- Pilih warehouse -</option>
      {warehouses.filter((w) => w !== exclude).map((w) => <option key={w}>{w}</option>)}
    </select>
  );

  return (
    <main>
      <div className="page-head">
        <h1>Stock Entry</h1>
        <p>Mutasi stok ke cabang berdasarkan Delivery Note. Item yang sama dari beberapa DN diakumulasikan.</p>
      </div>

      <div className="card">
        <h2 className="card-title">1. Data mutasi <small>Wajib diisi sebelum memilih Delivery Note</small></h2>
        <div className="grid">
          <div>
            <label htmlFor="co">Company</label>
            <select id="co" value={company} onChange={(e) => setCompany(e.target.value)}>{companies.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label htmlFor="cc">Cost Center</label>
            <select id="cc" value={costCenter} onChange={(e) => { setCostCenter(e.target.value); setPref("cc", e.target.value); setPreview(null); }}>
              <option value="">- Pilih cost center -</option>
              {costCenters.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tj">Tujuan</label>
            {tujuanOpts.length ? (
              <select id="tj" value={tujuan} onChange={(e) => setTujuan(e.target.value)}>
                <option value="">- Pilih tujuan -</option>
                {tujuanOpts.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input id="tj" value={tujuan} onChange={(e) => setTujuan(e.target.value)} placeholder="Tujuan pengiriman (opsional)" autoComplete="off" />
            )}
          </div>
        </div>
        <div className="grid" style={{ marginTop: 16 }}>
          <div><label htmlFor="fw">Source Warehouse</label><WhSelect id="fw" value={from} set={setFrom} k="from" /></div>
          <div><label htmlFor="tw">Target Warehouse</label><WhSelect id="tw" value={to} set={setTo} k="to" /></div>
        </div>
        {sameWh && <div className="alert err">Source dan Target Warehouse tidak boleh sama.</div>}
      </div>

      <div className={`card ${headOk ? "" : "locked"}`} aria-disabled={!headOk}>
        <h2 className="card-title">2. Delivery Note referensi {!headOk && <small>Lengkapi data mutasi dulu</small>}</h2>
        <label htmlFor="dn">Cari nomor DN / nama customer</label>
        <input id="dn" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ketik nomor DN, atau tempel beberapa nomor dipisah koma/spasi" autoComplete="off" />
        <p className="hint">Hanya DN draft (belum submit) milik company ini. Cukup ketik 4 digit terakhir nomor DN (mis. 0015).</p>
        {tujuan.trim() && costCenter && (
          <label className="hint" style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0 0", cursor: "pointer" }}>
            <input type="checkbox" checked={filterCc} onChange={(e) => setFilterCc(e.target.checked)} style={{ width: "auto" }} />
            Batasi DN ke cost center <b>{costCenter}</b>
          </label>
        )}

        {found.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <span className="hint" style={{ margin: 0 }}>{found.length} hasil</span>
              <button className="btn sec sm" onClick={addAll}>Tambah semua</button>
            </div>
            {found.map((d) => {
              const on = selected.some((x) => x.name === d.name);
              return (
                <div className="opt" key={d.name}>
                  <div><b>{dnRef(d)}</b><small>{d.name} · {d.posting_date}</small></div>
                  <button className="btn sec sm" disabled={on} onClick={() => add(d)}>{on ? "Dipilih" : "Pilih"}</button>
                </div>
              );
            })}
          </div>
        )}

        {selected.length > 0 && (
          <>
            <label style={{ marginTop: 18 }}>DN terpilih ({selected.length})</label>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nomor DN</th><th>DN Reference</th><th /></tr></thead>
                <tbody>
                  {selected.map((d) => (
                    <tr key={d.name}>
                      <td>{d.name}</td>
                      <td><span className="badge info">{dnRef(d)}</span></td>
                      <td className="n"><button className="btn sec sm" onClick={() => remove(d.name)}>Hapus</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="actions">
          <button className="btn sec" disabled={!headOk || !selected.length || !!busy} onClick={load}>{busy === "cek" && <i className="spin" />}Ambil Item dari DN</button>
          <button className="btn" disabled={!preview || !!busy} onClick={create}>{busy === "buat" && <i className="spin" />}Buat Stock Entry</button>
        </div>
        {err && <div className="alert err" role="alert">{err}</div>}
        {done && <div className="alert ok">Stock Entry <a href={done.url} target="_blank" rel="noreferrer"><b>{done.name}</b></a> dibuat sebagai draft.</div>}
      </div>

      {(preview || done) && (
        <>
          <div className="stats">
            <div className="stat"><span>DN dipakai</span><b>{selected.length || names.length}</b></div>
            <div className="stat"><span>Jenis item</span><b>{(preview || done).lines.length}</b></div>
            <div className="stat"><span>Total qty</span><b>{fmt((preview || done).lines.reduce((a, l) => a + l.qty, 0))}</b></div>
          </div>
          <div className="card">
            <h2 className="card-title">Item hasil akumulasi <small>DN reference: <b>{(preview || done).reference}</b></small></h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th>Nama</th><th>UOM</th><th className="n">Qty</th>{preview && <th>Dari DN</th>}</tr></thead>
                <tbody>
                  {(preview || done).lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.item_code}</td>
                      <td className="wrap">{l.item_name || "-"}</td>
                      <td>{l.uom}</td>
                      <td className="n"><b>{fmt(l.qty)}</b></td>
                      {preview && <td className="wrap">{l.sources.map((s) => `${s.dn.split("-").pop()}: ${fmt(s.qty)}`).join(" · ")}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
