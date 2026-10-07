"use client";
import { useEffect, useState } from "react";
import { call, loadCfg, saveCfg, clearCfg } from "@/lib/client";

const EMPTY = { api_key: "", api_secret: "", default_company: "", selling_price_list: "Grosir", selling_field: "price_list_rate_selling", pr_submit: false, se_dn_field: "custom_dn_reference", se_tujuan_field: "custom_tujuan" };

export default function Settings() {
  const [f, setF] = useState(EMPTY);
  const [secretSet, setSecretSet] = useState(false);
  const [server, setServer] = useState("");
  const [companies, setCompanies] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    const c = loadCfg();
    setF((p) => ({ ...p, ...c, api_secret: "", se_dn_field: !c.se_dn_field || c.se_dn_field === "dn_reference" ? "custom_dn_reference" : c.se_dn_field }));
    setSecretSet(!!c.api_secret);
    call("server_info").then((s) => setServer(s.erpnext_url || "")).catch(() => {});
  }, []);

  const run = (fn) => async () => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg({ err: e.message }); }
    setBusy(false);
  };

  const save = (extra = {}) => {
    const old = loadCfg();
    const secret = f.api_secret.trim() || old.api_secret || "";
    saveCfg({ ...old, ...f, api_key: f.api_key.trim(), api_secret: secret, ...extra });
    setSecretSet(!!secret);
    setF((p) => ({ ...p, api_secret: "" }));
  };
  const saveOnly = () => { save(); setMsg({ ok: "Tersimpan di browser PC ini." }); };
  const test = async () => {
    save();
    const r = await call("test_connection");
    save({ user: r.user });
    setMsg({ ok: `Terhubung sebagai ${r.user}.` });
    call("companies").then(setCompanies).catch(() => {});
  };
  const wipe = () => {
    if (!confirm("Hapus API Key/Secret dari browser ini?")) return;
    clearCfg();
    setF(EMPTY);
    setSecretSet(false);
    setMsg({ ok: "Kredensial dihapus dari browser ini." });
  };

  return (
    <main>
      <div className="page-head">
        <h1>Pengaturan</h1>
        <p>API Key/Secret disimpan hanya di browser PC ini, bukan di server. Tiap purchasing mengisi API miliknya sendiri.</p>
      </div>

      <div className="card">
        <h2 className="card-title">Koneksi ERPNext {server && <small>Server: <code>{server}</code></small>}</h2>
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
        <div className="actions">
          <button className="btn" disabled={busy || !f.api_key} onClick={run(test)}>{busy && <i className="spin" />}Simpan &amp; Tes Koneksi</button>
          <button className="btn danger" disabled={busy} onClick={wipe}>Hapus kredensial</button>
        </div>
        {msg?.err && <div className="alert err" role="alert">{msg.err}</div>}
        {msg?.ok && <div className="alert ok">{msg.ok}</div>}
      </div>

      <div className="card">
        <h2 className="card-title">Preferensi</h2>
        <div className="grid">
          <div>
            <label htmlFor="c">Company default (opsional)</label>
            <input id="c" list="cl" value={f.default_company} onChange={set("default_company")} />
            <datalist id="cl">{companies.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label htmlFor="p">Price List jual (price_list_rate_selling)</label>
            <input id="p" value={f.selling_price_list} onChange={set("selling_price_list")} />
          </div>
          <div>
            <label htmlFor="sf">Fieldname harga jual di item PO</label>
            <input id="sf" value={f.selling_field} onChange={set("selling_field")} />
          </div>
          <div>
            <label htmlFor="dnf">Fieldname DN reference di Stock Entry</label>
            <input id="dnf" value={f.se_dn_field || ""} onChange={set("se_dn_field")} placeholder="custom_dn_reference" />
          </div>
          <div>
            <label htmlFor="tjf">Fieldname Tujuan di Stock Entry</label>
            <input id="tjf" value={f.se_tujuan_field || ""} onChange={set("se_tujuan_field")} placeholder="custom_tujuan" />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label className="check">
            <input type="checkbox" checked={f.pr_submit} onChange={set("pr_submit")} />
            Purchase Receipt langsung di-submit (jika tidak dicentang = draft)
          </label>
        </div>
        <div className="actions">
          <button className="btn sec" disabled={busy} onClick={run(saveOnly)}>Simpan preferensi</button>
        </div>
      </div>
    </main>
  );
}
