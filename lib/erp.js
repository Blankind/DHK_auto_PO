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
  const r = await fetch(`${ERPNEXT_URL}/api/method/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(errMsg(j));
  return j.message;
}

export const getList = (doctype, args) =>
  erp("frappe.client.get_list", { doctype, limit_page_length: 0, ...args });
