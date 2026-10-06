"use client";
import { useEffect, useMemo, useState } from "react";
import { clearLogs, fmtTime, getLogs, toCsv } from "@/lib/log";
import { fmt } from "@/lib/excel";

const TYPE = { PO: "Purchase Order", PR: "Purchase Receipt" };
const ACT = { cek: "Cek alokasi", buat: "Buat dokumen" };

export default function LogPage() {
  const [logs, setLogs] = useState(null);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => setLogs(getLogs()), []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (logs || []).filter(
      (l) =>
        (!type || l.type === type) &&
        (!status || l.status === status) &&
        (!action || l.action === action) &&
        (!t || [l.ref, l.po, l.supplier, l.company, l.series, l.file, l.message, l.user].some((v) => String(v || "").toLowerCase().includes(t)))
    );
  }, [logs, type, status, action, q]);

  const made = (t) => (logs || []).filter((l) => l.type === t && l.action === "buat" && l.status === "ok").length;
  const failed = (logs || []).filter((l) => l.status === "gagal").length;

  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + toCsv(shown)], { type: "text/csv;charset=utf-8" }));
    a.download = `log_purchasing_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const wipe = () => {
    if (!confirm("Hapus semua log di browser ini?")) return;
    clearLogs();
    setLogs([]);
  };

  return (
    <main>
      <div className="page-head">
        <h1>Log Pemakaian</h1>
        <p>Riwayat cek dan pembuatan dokumen dari PC ini (maks. 500 terakhir). Tersimpan di browser, tidak di server.</p>
      </div>

      <div className="stats">
        <div className="stat"><span>PO dibuat</span><b>{made("PO")}</b></div>
        <div className="stat"><span>Receipt dibuat</span><b>{made("PR")}</b></div>
        <div className="stat"><span>Gagal</span><b style={{ color: failed ? "var(--err)" : undefined }}>{failed}</b></div>
        <div className="stat"><span>Total entri</span><b>{logs?.length ?? 0}</b></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="grow"><label htmlFor="q">Cari</label><input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="No. dokumen, supplier, file, pesan…" /></div>
          <div><label htmlFor="t">Jenis</label><select id="t" value={type} onChange={(e) => setType(e.target.value)}><option value="">Semua</option><option value="PO">Purchase Order</option><option value="PR">Purchase Receipt</option></select></div>
          <div><label htmlFor="a">Aksi</label><select id="a" value={action} onChange={(e) => setAction(e.target.value)}><option value="">Semua</option><option value="buat">Buat dokumen</option><option value="cek">Cek alokasi</option></select></div>
          <div><label htmlFor="s">Status</label><select id="s" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Semua</option><option value="ok">Berhasil</option><option value="gagal">Gagal</option></select></div>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Waktu</th><th>Jenis</th><th>Aksi</th><th>Status</th><th>Dokumen</th><th>Supplier / PO</th><th>Series</th><th className="n">Item</th><th className="n">Qty</th><th>File</th><th>Pesan</th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id}>
                  <td>{fmtTime(l.time)}</td>
                  <td>{TYPE[l.type] || l.type}</td>
                  <td>{ACT[l.action] || l.action}</td>
                  <td><span className={`badge ${l.status === "ok" ? "ok" : "err"}`}>{l.status === "ok" ? "Berhasil" : "Gagal"}</span></td>
                  <td>{l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.ref}</a> : "-"}</td>
                  <td>{l.type === "PR" ? l.po || "-" : l.supplier || "-"}</td>
                  <td>{l.series || "-"}</td>
                  <td className="n">{l.items ?? "-"}</td>
                  <td className="n">{l.qty != null ? fmt(l.qty) : "-"}</td>
                  <td>{l.file || "-"}</td>
                  <td className="wrap">{l.message || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs && !shown.length && <div className="empty">{logs.length ? "Tidak ada entri yang cocok dengan filter." : "Belum ada aktivitas."}</div>}
        </div>

        <div className="actions">
          <button className="btn sec" disabled={!shown.length} onClick={exportCsv}>Ekspor CSV ({shown.length})</button>
          <button className="btn danger" disabled={!logs?.length} onClick={wipe}>Hapus semua log</button>
        </div>
      </div>
    </main>
  );
}
