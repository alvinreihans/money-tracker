# Money Tracker

Pencatat keuangan pribadi. Foto struk atau bukti bayar e-wallet, isinya dibaca
otomatis, lalu tersimpan sebagai transaksi. Rekening koran PDF bisa diimpor
sekaligus sebulan.

## Cara kerja

**Gambar** → preprocessing [sharp] → OCR [Tesseract] → gerbang kualitas →
ekstraksi JSON [Groq] → validasi → simpan. Kalau OCR-nya jelek atau semua model
Groq gagal, gambar aslinya dilempar ke Gemini Vision sebagai jaring pengaman.
Kalau itu pun gagal, transaksi tetap disimpan sebagai draft beserta teks OCR
mentahnya supaya datanya tidak hilang.

**PDF rekening koran** → ekstraksi teks [unpdf] → per halaman ke Groq →
deteksi transfer antar rekening sendiri → deduplikasi terhadap bukti bayar yang
sudah ada.

Rancangan lengkap beserta alasan tiap keputusan fallback ada di
[FALLBACK.md](FALLBACK.md).

## Stack

Next.js 16 · Supabase (Postgres + Auth + RLS) · Tesseract.js · Groq ·
Gemini (fallback vision) · Tailwind CSS v4 · Recharts

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
| `npm run test:statement -- <file.pdf>` | Diagnostik jalur rekening koran |

Kedua perintah diagnostik menjalankan kode produksi yang sama, lalu membongkar
tiap tahapnya supaya hasilnya bisa diperiksa sebelum dipercaya.

## Catatan

Folder `archive/` berisi struk dan rekening koran pribadi untuk pengujian.
Folder itu sengaja masuk `.gitignore` dan tidak boleh ikut ter-commit.
