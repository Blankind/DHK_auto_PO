"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { call } from "@/lib/client";

const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const jkt = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const ago = (n) => jkt(new Date(Date.now() - n * 864e5));
const head = (s) => { const [y, m, d] = s.split("-"); return `${d} ${MON[+m - 1]} ${y.slice(2)}`; };
const idr = (n) => Number(n).toLocaleString("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function CekLcv() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false); // nilai HPP disembunyikan sampai dicentang
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (co = company, f = from, t = to) => {
    setBusy(true);
    setErr("");
    try {
      setData(await call("lcv_check", { company: co, from_date: f, to_date: t }));
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  useEffect(() => {
    const f = ago(30), t = jkt(new Date());
    setFrom(f);
    setTo(t);
    Promise.all([call("companies"), call("default_company")])
      .then(([c, d]) => {
        setCompanies(c || []);
        const co = d || c?.[0] || "";
        setCompany(co);
        load(co, f, t);
      })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const codes = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.keys(data?.items || {}).sort().filter((c) => !s || c.toLowerCase().includes(s));
  }, [data, q]);

  const exportXlsx = () => {
    const rows = [["Kode Item", ...data.dates], ...codes.map((c) => [c, ...data.dates.map((d) => data.items[c][d]?.v ?? "")])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Laporan HPP");
    XLSX.writeFile(wb, `Analitik_HPP_${from}_ke_${to}.xlsx`);
  };

  return (
    <main>
      <div className="page-head">
        <h1>Cek LCV (Unit HPP)</h1>
        <p>Unit HPP per item dari Landed Cost Voucher yang sudah submit, per tanggal posting.</p>
      </div>

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div>
            <label htmlFor="co">Company</label>
            <select id="co" value={company} onChange={(e) => setCompany(e.target.value)}>{companies.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div><label htmlFor="f">Dari tanggal</label><input id="f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label htmlFor="t">Sampai tanggal</label><input id="t" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn" disabled={busy || !company || !from || !to} onClick={() => load()}>{busy && <i className="spin" />}Jalankan Analisis</button>
          <button className="btn sec" disabled={!codes.length || !show} onClick={exportXlsx} title={show ? "" : "Tampilkan nilai dulu untuk ekspor"}>Ekspor Excel</button>
        </div>
        {err && <div className="alert err" role="alert">{err}</div>}
      </div>

      {data && (
        <>
          <div className="stats">
            <div className="stat"><span>Voucher</span><b>{data.vouchers}</b></div>
            <div className="stat"><span>Item</span><b>{Object.keys(data.items).length}</b></div>
            <div className="stat"><span>Tanggal</span><b>{data.dates.length}</b></div>
          </div>

          {data.skipped > 0 && <div className="alert warn">{data.skipped} baris voucher dilewati karena qty 0.</div>}

          <div className="card">
            <h2 className="card-title">Matriks HPP <small>Klik sel untuk membuka voucher</small></h2>
            <div className="toolbar">
              <div className="grow"><label htmlFor="q">Cari kode item</label><input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik sebagian kode item" /></div>
              <label className="check" style={{ height: 40 }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Tampilkan nilai HPP</label>
            </div>
            <div className="table-wrap">
              <table className="matrix">
                <thead>
                  <tr><th>Kode Item</th>{data.dates.map((d) => <th key={d} className="n" title={d}>{head(d)}</th>)}</tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c}>
                      <td><b>{c}</b></td>
                      {data.dates.map((d) => {
                        const x = data.items[c][d];
                        return <td key={d} className="n">{x ? <a href={data.url_base + x.lcv} target="_blank" rel="noreferrer" title={x.lcv}>{show ? idr(x.v) : "•••••"}</a> : "-"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!codes.length && <div className="empty">{data.vouchers ? "Tidak ada item yang cocok." : "Tidak ada Landed Cost Voucher pada periode ini."}</div>}
            </div>
            <p className="hint">Unit HPP = (Rate Beli + Biaya Tambahan) / Qty. Jika ada lebih dari satu voucher pada hari yang sama, yang terbaru ditampilkan.</p>
          </div>
        </>
      )}
    </main>
  );
}
