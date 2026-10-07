import { AsyncLocalStorage } from "node:async_hooks";

// Kredensial ikut tiap request dari browser (disimpan di PC user), dipakai hanya selama request, TIDAK disimpan di server.
const als = new AsyncLocalStorage();
export const withSettings = (cfg, fn) => als.run(cfg || {}, fn);

function serverUrl() {
  let s = String(process.env.ERPNEXT_URL || "").trim().replace(/^(https?:)+(?=https?:\/\/)/i, "").replace(/\/+$/, "");
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

export function getSettings() {
  const c = als.getStore() || {};
  return {
    erpnext_url: serverUrl(), // URL ERPNext tetap dari server (anti-SSRF), bukan dari browser
    api_key: c.api_key || "",
    api_secret: c.api_secret || "",
    default_company: c.default_company || process.env.DEFAULT_COMPANY || "",
    selling_price_list: c.selling_price_list || "Grosir",
    selling_field: c.selling_field || "price_list_rate_selling",
    pr_submit: !!c.pr_submit,
    se_dn_field: c.se_dn_field || "dn_reference",
  };
}
