// Format "DN reference": DN-DHK-LT-26-06-10-0015 + "ASKA BIMA 0878-8870-7282" -> "DN-LT-0015 ASKA BIMA"
export function shortDn(name) {
  const m = String(name || "").trim().match(/^([A-Za-z]+)-[A-Za-z0-9]+-([A-Za-z0-9]+)-\d{2}-\d{2}-\d{2}-(\d+)$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(name || "").trim(); // format lain: pakai nomor asli
}

// buang nomor telepon di belakang nama customer
export function shortCustomer(name) {
  return String(name || "").replace(/[\s,;(-]*\+?\(?\d[\d\s().-]{6,}$/, "").replace(/\s+/g, " ").trim();
}

export const dnRef = (dn) => `${shortDn(dn.name)} ${shortCustomer(dn.customer_name || dn.customer)}`.trim();
export const dnRefs = (dns) => dns.map(dnRef).join(", ");
