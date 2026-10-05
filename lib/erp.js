const { ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET } = process.env;

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
  if (!ERPNEXT_URL || !ERPNEXT_API_KEY || !ERPNEXT_API_SECRET)
    throw new Error("Env ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET belum diisi");
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
  if (!r.ok) throw new Error(errMsg(j));
  return j.message;
}

export const getList = (doctype, args) =>
  erp("frappe.client.get_list", { doctype, limit_page_length: 0, ...args });
