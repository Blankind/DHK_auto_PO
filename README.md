# Dehikas Purchase Import (full Vercel)

Tanpa custom app Frappe. Hanya memakai REST standar ERPNext.

1. ERPNext: buat user API (role Purchase User/Manager + akses Read Material Request, Create/Submit Purchase Order). Generate API key/secret.
2. Vercel: import repo ini, set env dari `.env.example`, tambah Upstash Redis dari Marketplace.
3. Lokal: `npm i && cp .env.example .env.local && npm run dev`

## Env
- Salin `.env.example` ke `.env.local`, isi nilai asli. File `.env*` di-ignore git (kecuali `.env.example`).
- Di Vercel: isi via Settings > Environment Variables.
- Jangan pernah commit key/secret.
