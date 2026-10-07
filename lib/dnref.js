// Format "DN reference": DN-<nomor urut> + nama customer (tanpa nomor telepon).
// DN-DHK-LT-26-06-10-0015 + "ASKA BIMA 0878-8870-7282" -> "DN-0015 ASKA BIMA"
export function shortDn(name) {
  const n = String(name || "").trim();
  const m = n.match(/-(\d+)$/);
  return m ? `DN-${m[1]}` : n; // format lain: pakai nomor asli
}

// buang nomor telepon di belakang nama customer
export function shortCustomer(name) {
  return String(name || "").replace(/[\s,;(-]*\+?\(?\d[\d\s().-]{6,}$/, "").replace(/\s+/g, " ").trim();
}

export const dnRef = (dn) => `${shortDn(dn.name)} ${shortCustomer(dn.customer_name || dn.customer)}`.trim();
export const dnRefs = (dns) => dns.map(dnRef).join(", ");
