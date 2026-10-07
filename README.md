# Dehikas Purchase Import

Program di-host di Vercel. API Key/Secret TIDAK disimpan di server/GitHub: tiap purchasing mengisinya sendiri di menu **Pengaturan** (disimpan di browser PC masing-masing).

## Setup (admin, sekali)
1. Vercel: import repo, isi env dari `.env.example` (`ERPNEXT_URL`; opsional Upstash).
2. Tiap purchasing dibuatkan user API di ERPNext (role Purchase User/Manager) lalu generate API Key/Secret sendiri.

## Setup (tiap purchasing)
Buka alamat Vercel → Pengaturan → isi API Key & Secret → Simpan & Tes Koneksi. Pakai browser/profil pribadi, jangan di PC bersama.

## Halaman
- `/` Purchase Import (Excel: Item Code, Qty, Rate, Description)
- `/receipt` Purchase Receipt (nomor PO + Excel: Item Code, Qty)
- `/settings` Pengaturan
- `/stock` Stock Entry (Material Transfer dari Delivery Note, item diakumulasikan, DN reference otomatis)
