import * as XLSX from "xlsx";

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
export const fmt = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

export function num(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "");
  return parseFloat(s) || 0;
}

// Baca sheet pertama; kembalikan { raw, keys, pick(aliasList) }
export async function readSheet(file) {
  const wb = XLSX.read(await file.arrayBuffer());
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const keys = Object.keys(raw[0] || {});
  return { raw, pick: (aliases) => keys.find((k) => aliases.includes(norm(k))) };
}
