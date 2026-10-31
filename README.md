# Money Tracker

Pencatat keuangan pribadi berbasis AI. Ketik seperti chat ("beli makan di warteg 20k shopeepay"),
foto struk atau bukti bayar e-wallet, atau isi form sendiri. Isinya dibaca otomatis lalu
tersimpan sebagai transaksi, lengkap dengan analitik, budget, tabungan tujuan, dan pinjaman.

Aplikasi berjalan sebagai PWA di Vercel.

## Fitur

**Mencatat**
- Teks bebas, foto struk atau bukti bayar e-wallet (kamera atau unggah), dan form manual.
- Bagikan struk atau teks langsung dari aplikasi lain (share target Android); gambarnya diunggah di latar.
- Catat bergaya chat: draft, pertanyaan lanjutan, dan deteksi transaksi ganda.
- Draft tetap tersimpan beserta teks mentahnya saat pembacaan gagal, jadi data tidak hilang.
- Ingatan kategori per merchant, pencocokan nama yang toleran salah ketik, tawaran "ubah semua yang serupa", dan batalkan.

**Memahami uang**
- Analitik: ringkasan bulan, tren 6 bulan, komposisi kategori, merchant teratas, dan proyeksi.
- **Tanya AI**: tanya jawab atas data sendiri; setiap perubahan butuh konfirmasi dulu.
- Metode budget: per kategori, 50/30/20, 80/20, 70/20/10, dan persentase kustom, termasuk memecah satu transaksi ke beberapa kelompok.
- Tabungan tujuan, pinjaman dan piutang, cicilan, PayLater, transfer antar kantong, dan saldo dari waktu ke waktu.
- Ekspor data.

**Platform**
- PWA dengan notifikasi push (Web Push, VAPID) dan pekerjaan terjadwal harian lewat Vercel Cron.
- Login email dan password lewat Supabase Auth, termasuk reset password.
- Data sensitif (merchant, deskripsi, teks OCR mentah) dienkripsi di database.

Fitur Telegram dan impor rekening koran PDF pernah ada, tetapi sudah dihapus
(lihat CHANGELOG).

## Cara kerja pembacaan struk

**Gambar** → dikompres [sharp] → ekstraksi JSON [Gemini Vision] → validasi → simpan.
Gemini membaca tata letak bukti bayar (nominal besar, diskon, PayLater) jauh lebih
andal daripada OCR. Kalau Gemini gagal atau hasilnya tidak valid, jalur cadangan
dipakai: preprocessing [sharp] → OCR [Tesseract] → gerbang kualitas → ekstraksi
JSON [Groq] → validasi. Kalau itu pun gagal, transaksi tetap disimpan sebagai
draft beserta teks OCR mentahnya supaya datanya tidak hilang.
`DISABLE_VISION_FALLBACK=1` mematikan Gemini dan langsung memakai OCR + Groq,
misalnya saat kuota Gemini habis.

**Teks** ("kopi 25rb gopay") → ekstraksi JSON [Groq] → validasi → simpan. Teks
yang gagal dibaca disimpan sebagai draft beserta teks aslinya.

[FALLBACK.md](FALLBACK.md) menjelaskan rancangan awal, dengan Gemini sebagai
jaring pengaman terakhir. Urutannya dibalik di [SPEC-catat-andal.md](SPEC-catat-andal.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL, Auth, Row Level Security) ·
Tesseract.js · sharp · Groq · Gemini (membaca gambar & Tanya AI) · web-push · Vercel (termasuk Cron).
UI mengikuti [One UI](https://developer.samsung.com/one-ui) dan dibangun sendiri (CSS sendiri,
ikon lucide-react), tanpa pustaka UI atau pustaka grafik.

## Struktur

| Lokasi | Isi |
|---|---|
| `src/app/` | Halaman (`(app)/` untuk yang butuh login) dan API route |
| `src/components/` | Komponen UI |
| `src/lib/` | Logika: pipeline gambar dan OCR, ekstraksi, analitik, budget, pinjaman, notifikasi, validasi |
| `src/proxy.ts` | Penyegaran sesi Supabase dan perlindungan `/api/*` |
| `supabase/migrations/` | Migrasi database berversi, dijalankan berurutan oleh `npm run db:migrate` |
| `scripts/` | Runner migrasi dan skrip uji/diagnostik |
| `e2e/` | Uji end-to-end di browser (Edge/Chrome headless lewat DevTools Protocol), satu file per suite |
| `SPEC-*.md` | Spesifikasi tiap fitur, dengan keputusan dan pertanyaan terbuka |

## Mulai

```bash
npm install
cp .env.example .env.local   # isi kredensialnya
npm run db:migrate           # jalankan migrasi database
npm run dev
```

Variabel lingkungan yang dibutuhkan (nama saja; lihat `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `CRON_SECRET`. Opsional: `DISABLE_VISION_FALLBACK=1` (lihat di atas).

Langkah lengkap, termasuk jebakan koneksi Supabase, ada di [SETUP.md](SETUP.md).

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` / `build` / `start` | Pengembangan, build produksi, jalankan hasil build |
| `npm run lint` | ESLint dengan aturan resmi Next.js |
| `npm run db:status` | Lihat migrasi mana yang belum jalan (read-only) |
| `npm run db:migrate` | Terapkan migrasi yang belum jalan |
| `npm run db:baseline` | Tandai migrasi lama sebagai sudah berjalan |
| `npm run test:receipt -- <file/folder>` | Diagnostik jalur gambar |
| `npm run test:teks` | Diagnostik jalur teks |
| `npm run ukur:ocr` | Ukur kualitas OCR |
| `npm run ukur:teks` | Ukur ketepatan AI membaca teks ketikan (18 kalimat, Groq sungguhan) |
| `npm run uji:<nama>` | Skrip uji per area: `validasi`, `tanggal`, `saran`, `analitik`, `kantong`, `kategori`, `pinjaman`, `notifikasi`, `ekspor`, `draft`, `waktu`, `riwayat`, `tanya`, `arah`, `metode`, `ingat`, `bundle` |
| `npm run uji:isolasi` | Akun lain tidak bisa membaca, mengubah, atau merujuk data akun ini (lewat API sungguhan) |
| `npm run eval:tanya` | Evaluasi jawaban Tanya AI |
| `npm run e2e [-- suite …]` | Semua suite E2E, atau yang disebut; butuh `npm run dev` jalan |

`uji:isolasi`, `eval:tanya`, dan `e2e` memakai akun sementara (`*-sementara@example.com`)
yang dihapus di akhir, jadi aman dijalankan terhadap database sungguhan. Suite
`arah` membaca bukti transfer asli dari `archive/e2e-arah.json` (tidak ikut
di-commit); tanpa file itu suitenya dilewati.

Skrip diagnostik menjalankan kode produksi yang sama, lalu membongkar tiap
tahapnya supaya hasilnya bisa diperiksa sebelum dipercaya. Skrip uji ditulis
sebagai skrip `tsx` biasa, bukan kerangka uji seperti Jest.

## Versi

Riwayat perubahan ada di [CHANGELOG.md](CHANGELOG.md) (Keep a Changelog dan Semantic Versioning).
Nomor versi yang tampil di aplikasi dibaca dari `version` di `package.json`.

## Catatan

Folder `archive/` dan `.receipt-test/` berisi struk pribadi untuk pengujian.
Keduanya sengaja masuk `.gitignore` dan tidak boleh ikut ter-commit.
