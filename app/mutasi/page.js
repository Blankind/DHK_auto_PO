"use client";
import { Fragment, useEffect, useState } from "react";
import { call } from "@/lib/client";

const kg = (n) => Number(n).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ton = (n) => Number(n / 1000).toLocaleString("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const num = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

export default function CekMutasi() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (co = company) => {
    setBusy(true);
    setErr("");
    try {
      setData(await call("mutasi_check", { company: co, from_date: from || undefined, to_date: to || undefined }));
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  useEffect(() => {
    Promise.all([call("companies"), call("default_company")])
      .then(([c, d]) => {
        setCompanies(c || []);
        const co = d || c?.[0] || "";
        setCompany(co);
        load(co);
      })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxKg = Math.max(1, ...(data?.groups.map((g) => g.kg) || [1]));

  const exportCsv = () => {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Tujuan", "Dokumen", "Tanggal", "Dari", "Ke", "Jumlah item", "Berat (kg)", "Berat (ton)", "Item tanpa berat"]];
    data.groups.forEach((g) => g.docs.forEach((d) => rows.push([g.tujuan, d.name, d.posting_date, d.from_warehouse, d.to_warehouse, d.items, d.kg, d.kg / 1000, d.noWeight])));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `mutasi_draft_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main>
      <div className="page-head">
        <h1>Cek Mutasi</h1>
        <p>Rekap semua Stock Entry Material Transfer berstatus draft: total tonase dikelompokkan per tujuan.</p>
      </div>

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div>
            <label htmlFor="co">Company</label>
            <select id="co" value={company} onChange={(e) => setCompany(e.target.value)}>{companies.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div><label htmlFor="f">Dari tanggal</label><input id="f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label htmlFor="t">Sampai tanggal</label><input id="t" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn" disabled={busy || !company} onClick={() => load()}>{busy && <i className="spin" />}Muat Data</button>
          <button className="btn sec" disabled={!data?.groups.length} onClick={exportCsv}>Ekspor CSV</button>
        </div>
        {err && <div className="alert err" role="alert">{err}</div>}
      </div>

      {data && (
        <>
          <div className="stats">
            <div className="stat"><span>Dokumen draft</span><b>{data.total.docs}</b></div>
            <div className="stat"><span>Jumlah tujuan</span><b>{data.total.groups}</b></div>
            <div className="stat"><span>Total berat</span><b>{ton(data.total.kg)} <small style={{ fontSize: 13, fontWeight: 400 }}>ton</small></b></div>
            <div className="stat"><span>Total berat (kg)</span><b>{kg(data.total.kg)}</b></div>
          </div>

          {data.tujuan_missing && <div className="alert warn">Field <code>{data.tujuan_field}</code> tidak terbaca di Stock Entry, jadi semua dokumen masuk “(Tanpa tujuan)”. Cek fieldname di Pengaturan.</div>}
          {data.no_weight.length > 0 && (
            <div className="alert warn">
              {data.no_weight.length} item belum punya berat di master Item (dihitung 0): {data.no_weight.slice(0, 8).map((x) => x.item_code).join(", ")}{data.no_weight.length > 8 ? ", …" : ""}. Isi <b>Weight Per Unit</b> dan <b>Weight UOM</b> di Item agar total akurat.
            </div>
          )}
          {data.assumed_uom.length > 0 && <div className="alert warn">Satuan berat tidak dikenali ({data.assumed_uom.join(", ")}), dihitung sebagai kg.</div>}

          <div className="card">
            <h2 className="card-title">Rekap per tujuan <small>Klik baris untuk melihat dokumennya</small></h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Tujuan</th><th className="n">Dokumen</th><th className="n">Item</th><th className="n">Berat (kg)</th><th className="n">Berat (ton)</th><th>Proporsi</th></tr></thead>
                <tbody>
                  {data.groups.map((g) => (
                    <Fragment key={g.tujuan}>
                      <tr onClick={() => setOpen({ ...open, [g.tujuan]: !open[g.tujuan] })} style={{ cursor: "pointer" }}>
                        <td><b>{open[g.tujuan] ? "▾" : "▸"} {g.tujuan}</b></td>
                        <td className="n">{g.docs_count}</td>
                        <td className="n">{g.items_count}</td>
                        <td className="n"><b>{kg(g.kg)}</b></td>
                        <td className="n">{ton(g.kg)}</td>
                        <td><div className="bar"><i className="m" style={{ width: `${(g.kg / maxKg) * 100}%` }} /></div></td>
                      </tr>
                      {open[g.tujuan] && g.docs.map((d) => (
                        <tr key={d.name} style={{ background: "#fafbfc" }}>
                          <td style={{ paddingLeft: 36 }}>
                            <a href={d.url} target="_blank" rel="noreferrer">{d.name}</a>
                            <div className="hint" style={{ margin: 0 }}>{d.posting_date} · {d.from_warehouse} → {d.to_warehouse}</div>
                          </td>
                          <td className="n">1</td>
                          <td className="n">{d.items}{d.noWeight > 0 && <span className="badge err" style={{ marginLeft: 6 }}>{d.noWeight} tanpa berat</span>}</td>
                          <td className="n">{kg(d.kg)}</td>
                          <td className="n">{ton(d.kg)}</td>
                          <td />
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                {data.groups.length > 0 && (
                  <tfoot>
                    <tr style={{ background: "#f8f9fb", fontWeight: 600 }}>
                      <td>Total</td><td className="n">{data.total.docs}</td><td className="n">{num(data.groups.reduce((a, g) => a + g.items_count, 0))}</td>
                      <td className="n">{kg(data.total.kg)}</td><td className="n">{ton(data.total.kg)}</td><td />
                    </tr>
                  </tfoot>
                )}
              </table>
              {!data.groups.length && <div className="empty">Tidak ada Stock Entry Material Transfer berstatus draft.</div>}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
