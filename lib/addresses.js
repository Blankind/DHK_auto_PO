// Alamat pengiriman per gudang. Dicocokkan lewat kata kunci di nama warehouse (tanpa peduli huruf besar/kecil).
export const ADDRESSES = [
  { id: "krembung", label: "Krembung", text: "PT. DEHIKAS SINERGI SEMESTA, Jl. Raya Pakem Rejeni No. 2 Krembung", keys: ["krembung"] },
  { id: "sidoarjo", label: "Sidoarjo - Jl. Kombes Pol. M Duryat", text: "PT. DEHIKAS SINERGI SEMESTA, Jl. Kombes Pol. M Duryat No 07 - 09 Sidoarjo", keys: ["duryat", "sidoarjo"] },
  { id: "lingkar", label: "Sidoarjo - Jl. Lingkar Timur", text: "PT. DEHIKAS SINERGI SEMESTA, Jl. Lingkar Timur KM 2.5 Sidoarjo", keys: ["lingkar"] },
  { id: "bangil", label: "Bangil, Pasuruan", text: "PT. DEHIKAS SINERGI SEMESTA, Jl. Raya Krikilan RT.03 RW.01 Latek, Bangil, Pasuruan", keys: ["bangil", "pasuruan"] },
  { id: "lamongan", label: "Lamongan", text: "PT. DEHIKAS SINERGI SEMESTA, Jl. Raya Tikung Mantup No 88 Lamongan", keys: ["lamongan"] },
];

// Urutan cek: yang spesifik dulu, "sidoarjo" paling akhir (ada 2 alamat Sidoarjo)
const ORDER = ["krembung", "lingkar", "bangil", "lamongan", "sidoarjo"];

export function addressFor(warehouse) {
  const w = String(warehouse || "").toLowerCase();
  for (const id of ORDER) {
    const a = ADDRESSES.find((x) => x.id === id);
    if (a.keys.some((k) => w.includes(k))) return a;
  }
  return null;
}
