# Money Tracker

Pencatat keuangan pribadi. Ketik seperti chat ("beli makan di warteg 20k shopeepay"), foto
struk atau bukti bayar e-wallet, atau isi form sendiri — isinya dibaca otomatis
lalu tersimpan sebagai transaksi.

## Cara kerja

**Gambar** → preprocessing [sharp] → OCR [Tesseract] → gerbang kualitas →
ekstraksi JSON [Groq] → validasi → simpan. Kalau OCR-nya jelek atau semua model
Groq gagal, gambar aslinya dilempar ke Gemini Vision sebagai jaring pengaman.
Kalau itu pun gagal, transaksi tetap disimpan sebagai draft beserta teks OCR
mentahnya supaya datanya tidak hilang.

**Teks** ("kopi 25rb gopay") → ekstraksi JSON [Groq] → validasi → simpan. Teks
yang gagal dibaca disimpan sebagai draft beserta teks aslinya.

Rancangan lengkap beserta alasan tiap keputusan fallback ada di
[FALLBACK.md](FALLBACK.md).

## Stack

Next.js 16 · Supabase (Postgres + Auth + RLS) · Tesseract.js · Groq ·
Gemini (fallback vision) · UI mengikuti [One UI](https://developer.samsung.com/one-ui) (dibangun sendiri, ikon lucide)

Deploy ke Vercel. Semua layanan dipakai di tier gratisnya.

## Mulai

```bash
npm install
cp .env.example .env.local   # isi kredensialnya
npm run db:migrate           # jalankan migrasi database
npm run dev
```

Langkah lengkap, termasuk jebakan koneksi Supabase dan setup bot Telegram, ada
di [SETUP.md](SETUP.md).

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Jalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run db:status` | Lihat migrasi mana yang belum jalan (read-only) |
| `npm run db:migrate` | Terapkan migrasi yang belum jalan |
| `npm run test:receipt -- <file/folder>` | Diagnostik jalur gambar |
| `npm run uji:validasi` | Uji validasi isian transaksi |
| `npm run uji:tanggal` | Uji hitungan tanggal WIB |

Perintah diagnostik menjalankan kode produksi yang sama, lalu membongkar tiap
tahapnya supaya hasilnya bisa diperiksa sebelum dipercaya.

## Catatan

Folder `archive/` berisi struk pribadi untuk pengujian.
Folder itu sengaja masuk `.gitignore` dan tidak boleh ikut ter-commit.
