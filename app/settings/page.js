"use client";
import { useEffect, useState } from "react";
import { call, loadCfg, saveCfg, clearCfg } from "@/lib/client";

export default function Settings() {
  const [f, setF] = useState({ api_key: "", api_secret: "", default_company: "", selling_price_list: "Grosir", selling_field: "price_list_rate_selling", pr_submit: false });
  const [secretSet, setSecretSet] = useState(false);
  const [server, setServer] = useState("");
  const [companies, setCompanies] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    const c = loadCfg();
    setF((p) => ({ ...p, ...c, api_secret: "" }));
    setSecretSet(!!c.api_secret);
    call("server_info").then((s) => setServer(s.erpnext_url || "")).catch(() => {});
  }, []);

  const run = (fn) => async () => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ err: e.message }); }
    setBusy(false);
  };

  const save = () => {
    const old = loadCfg();
    saveCfg({ ...f, api_key: f.api_key.trim(), api_secret: f.api_secret.trim() || old.api_secret || "" });
    setSecretSet(!!(f.api_secret.trim() || old.api_secret));
    setF((p) => ({ ...p, api_secret: "" }));
  };
  const saveOnly = () => { save(); setMsg({ ok: "Tersimpan di browser PC ini." }); };
  const test = async () => {
    save();
    const r = await call("test_connection");
    setMsg({ ok: `Terhubung sebagai ${r.user}.` });
    call("companies").then(setCompanies).catch(() => {});
  };
  const wipe = () => {
    if (!confirm("Hapus API Key/Secret dari browser ini?")) return;
    clearCfg();
    setF({ api_key: "", api_secret: "", default_company: "", selling_price_list: "Grosir", selling_field: "price_list_rate_selling", pr_submit: false });
    setSecretSet(false);
    setMsg({ ok: "Kredensial dihapus dari browser ini." });
  };

  return (
    <main>
      <h1>Pengaturan</h1>
      <p className="sub"><a href="/">← Purchase Import</a> · <a href="/receipt">Purchase Receipt</a></p>
      <p className="sub">API Key/Secret disimpan hanya di browser PC ini (bukan di server). Tiap purchasing mengisi API miliknya sendiri.{server && <> Server ERPNext: <code>{server}</code></>}</p>
      <section>
        <div className="grid">
          <div>
            <label htmlFor="k">API Key</label>
            <input id="k" value={f.api_key} onChange={set("api_key")} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="s">API Secret</label>
            <input id="s" type="password" value={f.api_secret} onChange={set("api_secret")} autoComplete="new-password" placeholder={secretSet ? "Tersimpan (kosongkan jika tidak diubah)" : ""} />
          </div>
        </div>
        <div className="grid" style={{ marginTop: 16 }}>
          <div>
            <label htmlFor="c">Company default (opsional)</label>
            <input id="c" list="cl" value={f.default_company} onChange={set("default_company")} />
            <datalist id="cl">{companies.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label htmlFor="p">Price List jual (price_list_rate_selling)</label>
            <input id="p" value={f.selling_price_list} onChange={set("selling_price_list")} />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label htmlFor="sf">Fieldname kolom harga jual di item PO</label>
          <input id="sf" value={f.selling_field} onChange={set("selling_field")} />
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "inherit" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={f.pr_submit} onChange={set("pr_submit")} />
            Purchase Receipt langsung di-submit (jika tidak dicentang = draft)
          </label>
        </div>
        <div className="row">
          <button className="ghost" disabled={busy} onClick={run(saveOnly)}>Simpan</button>
          <button disabled={busy || !f.api_key} onClick={run(test)}>Simpan &amp; Tes Koneksi</button>
          <button className="ghost" disabled={busy} onClick={wipe}>Hapus kredensial</button>
        </div>
        {msg?.err && <div className="msg err" role="alert">{msg.err}</div>}
        {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      </section>
    </main>
  );
}
