import { getSettings } from "./settings";

function errMsg(j) {
  try {
    return JSON.parse(j._server_messages)
      .map((x) => JSON.parse(x).message)
      .join("; ")
      .replace(/<[^>]+>/g, "");
  } catch {
    return (j.exception || j.message || "Error ERPNext").toString().slice(0, 300);
  }
}

export async function erp(method, args = {}) {
  const { erpnext_url: ERPNEXT_URL, api_key: ERPNEXT_API_KEY, api_secret: ERPNEXT_API_SECRET } = getSettings();
  if (!ERPNEXT_URL) throw new Error("ERPNEXT_URL belum diset di server (Vercel > Settings > Environment Variables).");
  if (!ERPNEXT_API_KEY || !ERPNEXT_API_SECRET) throw new Error("API Key/Secret belum diisi. Buka menu Pengaturan.");
  let r;
  try {
    r = await fetch(`${ERPNEXT_URL.replace(/\/+$/, "")}/api/method/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
  } catch (e) {
    const why = e.cause?.code || e.cause?.message || e.message;
    throw new Error(`Tidak bisa terhubung ke ${ERPNEXT_URL} (${why})`);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = errMsg(j);
    if (r.status === 401 || r.status === 403) throw new Error(`API Key/Secret salah atau user API tidak punya akses (HTTP ${r.status})`);
    throw new Error(m === "Error ERPNext" ? `Error ERPNext (HTTP ${r.status})` : m);
  }
  return j.message;
}

export const getList = (doctype, args) =>
  erp("frappe.client.get_list", { doctype, limit_page_length: 0, ...args });
