import { loadCfg } from "./client";

// Log pemakaian disimpan di browser PC ini (maks 500 entri terakhir).
const KEY = "dhk_log";
export const getLogs = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};
export function addLog(e) {
  try {
    const id = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const logs = [{ id, time: new Date().toISOString(), user: loadCfg().user || "", ...e }, ...getLogs()];
    localStorage.setItem(KEY, JSON.stringify(logs.slice(0, 500)));
  } catch {}
}
export const clearLogs = () => localStorage.removeItem(KEY);

export const fmtTime = (iso) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function toCsv(logs) {
  const cols = ["time", "user", "type", "action", "status", "ref", "po", "supplier", "company", "series", "items", "qty", "file", "message", "url"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...logs.map((l) => cols.map((c) => q(l[c])).join(","))].join("\r\n");
}
