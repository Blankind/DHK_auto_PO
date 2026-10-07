// Format "DN reference": DN-<nomor urut> + nama customer (tanpa nomor telepon).
// DN-DHK-LT-26-06-10-0015 + "ASKA BIMA 0878-8870-7282" -> "DN-0015 ASKA BIMA"
export function shortDn(name) {
  const n = String(name || "").trim();
  const m = n.match(/-(\d+)$/);
  return m ? `DN-${m[1]}` : n; // format lain: pakai nomor asli
}

// Ambil nama customer saja (biasanya 1-2 kata): buang nomor telepon, alamat, keterangan.
const STOP = new Set(["JL", "JLN", "JALAN", "DS", "DSN", "DESA", "DUSUN", "RT", "RW", "GG", "GANG", "KEC", "KAB", "KEL", "BLOK", "NO", "PERUM", "PERUMAHAN", "KOMP", "KOMPLEK", "KP", "KAMPUNG", "TELP", "TLP", "HP", "WA"]);
// awalan gelar/badan usaha: tidak dihitung ke batas 2 kata (maks 3 kata total)
const TITLE = new Set(["PT", "CV", "UD", "TB", "TK", "TOKO", "BPK", "BAPAK", "IBU", "BU", "PAK", "H", "HJ"]);
export function shortCustomer(name) {
  const base = String(name || "").split(/[\/,;(]/)[0];
  const out = [];
  let core = 0;
  for (const w of base.split(/\s+/).filter(Boolean)) {
    const u = w.toUpperCase().replace(/\./g, "");
    if (STOP.has(u) || /\d/.test(u)) break;
    if (TITLE.has(u) && !core) { out.push(w); continue; }
    if (core >= 2) break;
    out.push(w); core++;
  }
  return (out.length ? out : base.trim().split(/\s+/).slice(0, 2)).join(" ").trim();
}

export const dnRef = (dn) => `${shortDn(dn.name)} ${shortCustomer(dn.customer_name || dn.customer)}`.trim();
export const dnRefs = (dns) => dns.map(dnRef).join(", ");
