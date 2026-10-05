// Dipakai di browser: kredensial disimpan di localStorage PC ini, dikirim lewat header ke server hanya saat request.
const KEY = "dhk_cfg";
export const loadCfg = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
};
export const saveCfg = (c) => localStorage.setItem(KEY, JSON.stringify(c));
export const clearCfg = () => localStorage.removeItem(KEY);

export async function call(action, body) {
  const r = await fetch(`/api/erp/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dhk-cfg": encodeURIComponent(JSON.stringify(loadCfg())) },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Permintaan gagal");
  return j;
}
