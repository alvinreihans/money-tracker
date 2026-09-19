# Money Tracker — Setup Blueprint

Arsitektur serverless gratis: **Vercel + Supabase (Postgres) + Tesseract + Groq**,
dengan **Gemini Vision** sebagai jaring pengaman.

Alur ekstraksi lengkap beserta strategi fallback-nya ada di [FALLBACK.md](FALLBACK.md).

## Struktur file

```
supabase/migrations/20260716000000_init_transactions.sql   # tabel + RLS + RPC
supabase/migrations/20260722000000_telegram_profiles.sql   # profiles + telegram_links
supabase/migrations/20260919000000_fallback_pipeline.sql   # status draft + dedupe
supabase/migrations/20260919120000_statements_and_transfers.sql # rekening koran

src/types/transaction.ts            # tipe domain bersama
src/lib/supabase/client.ts          # client (browser)
src/lib/supabase/server.ts          # client (server/route)
src/lib/supabase/admin.ts           # client service-role (webhook Telegram)

src/lib/ocr.ts                      # sharp + Tesseract -> teks + confidence
src/lib/groq.ts                     # client Groq + rantai model + throttle
src/lib/gemini.ts                   # client Gemini (fallback vision)
src/lib/extract.ts                  # prompt, normalisasi, validasi, rantai LLM
src/lib/receipt.ts                  # orkestrasi pipeline gambar
src/lib/pdf.ts                      # PDF -> teks per halaman
src/lib/statement.ts                # teks PDF -> daftar transaksi
src/lib/statement-import.ts         # dedup + simpan ke database
src/lib/telegram.ts                 # helper Telegram Bot API

src/app/api/upload-receipt/route.ts   # jalur web (gambar)
src/app/api/upload-statement/route.ts # jalur rekening koran (PDF)
src/app/api/telegram/webhook/route.ts # jalur Telegram
src/components/SpendingByCategoryChart.tsx
src/components/UploadReceiptForm.tsx
src/components/UploadStatementForm.tsx
src/components/UserAccountsCard.tsx
src/proxy.ts                        # refresh session Supabase (dulu middleware.ts)
scripts/migrate.mjs                 # runner migrasi
scripts/test-receipt.mts            # diagnostik jalur gambar
scripts/test-statement.mts          # diagnostik jalur rekening koran
tessdata/                           # traineddata Tesseract (ind + eng)
.env.example                        # template env
```

## 1. Dependencies

```bash
npm install @supabase/ssr @supabase/supabase-js recharts \
            tesseract.js sharp groq-sdk @google/generative-ai unpdf
```

## 2. Environment

Salin `.env.example` -> `.env.local`, isi kredensial Supabase, `GROQ_API_KEY`,
dan `GEMINI_API_KEY`.

## 3. tsconfig — path alias `@/`

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

> Catatan: `baseUrl` sudah dihapus di TypeScript 7 dan tidak lagi dipakai.
> Project ini di-pin ke TypeScript 5 karena type-check Next 16 belum mendukung
> port native TypeScript 7.

## 4. Migrasi database

Isi `SUPABASE_DB_URL` di `.env.local` dari Dashboard -> **Connect** -> **Session pooler**.

> **Jangan pakai Direct connection.** Host `db.<ref>.supabase.co` hanya
> beralamat IPv6, dan kebanyakan ISP rumah di Indonesia belum memberi IPv6 —
> hasilnya `getaddrinfo ENOTFOUND`. Session pooler punya alamat IPv4.
>
> Tiga hal yang berubah dibanding Direct:
> - username jadi `postgres.<project-ref>`, bukan `postgres`
> - host jadi `aws-0-<region>.pooler.supabase.com`
> - perlu `?sslmode=no-verify` — pooler memakai sertifikat CA sendiri,
>   sementara `pg` v8.23+ memperlakukan `sslmode=require` sebagai `verify-full`.
>   Koneksi tetap terenkripsi; hanya identitas server yang tidak diverifikasi.
>
> Tetap port **5432** (session mode, mendukung DDL), bukan 6543.

```bash
npm run db:status     # lihat migrasi mana yang belum jalan (read-only, aman)
npm run db:migrate    # terapkan yang belum jalan
```

Runner mencatat migrasi yang sudah diterapkan di tabel `public._migrations`, dan
membungkus tiap file dalam transaksi sendiri — kalau satu gagal di tengah, tidak
ada perubahan separuh jadi yang tertinggal di database.

Seluruh migrasi ditulis idempoten (`if not exists` / `or replace`), jadi aman
dijalankan pada database yang sebagian migrasinya sudah pernah dijalankan manual
lewat SQL Editor. Kalau lebih suka menandainya sebagai sudah-diterapkan tanpa
menjalankan ulang SQL-nya:

```bash
npm run db:baseline
```
## Pipeline ekstraksi

```
gambar -> sharp (grayscale, kontras, resize)
       -> Tesseract (ind+eng)  -> teks + confidence
       -> gerbang kualitas     -> kalau lolos: Groq (rantai 3 model)
                               -> kalau tidak: langsung Gemini Vision
       -> validasi             -> simpan sebagai confirmed / needs_review
```

Poin penting:

- **traineddata di-vendor** di `tessdata/`, bukan diunduh dari CDN saat runtime.
  `next.config.ts` menyebutnya di `outputFileTracingIncludes` — tanpa itu OCR
  mati di produksi meski jalan di lokal.
- **`serverExternalPackages`** wajib memuat `tesseract.js` dan `sharp`: keduanya
  memuat binary/WASM lewat path runtime dan rusak kalau ikut di-bundle.
- **Struk gagal baca tidak dibuang.** Disimpan dengan `status = 'needs_review'`
  beserta `raw_ocr_text` agar user bisa mengoreksi manual.
- **RLS aktif**: RPC memakai `security invoker` + `auth.uid()`.
- **RPC** mengabaikan bulan berjalan dan baris `needs_review` agar rata-rata
  tidak bias.

## Rekening koran (PDF)

Jalur terpisah dari gambar, dengan tiga persoalan yang tidak ada di jalur struk.

**1. Satu file = puluhan transaksi.** Diproses per halaman, bukan sekaligus:
batas Groq 8K token/menit, dan model lebih jarang melewatkan baris di tengah
daftar panjang. Ada jeda 2,5 detik antar halaman plus retry yang menghormati
saran tunggu dari pesan 429 Groq — tanpa itu statement panjang gagal di tengah.

**2. Transfer bukan pengeluaran.** Topup ShopeePay dari bank hanya memindahkan
uang antar kantong sendiri. Tabel `user_accounts` memberi tahu sistem mana
rekening milik user; tanpa itu topup salah tercatat sebagai pengeluaran dan
laporan membengkak palsu.

Pembedanya halus dan mudah terbalik: baris **"ShopeePay / Pembayaran"** di
rekening bank justru PENGELUARAN — itu fitur bayar instan, ShopeePay cuma
jalurnya dan uangnya langsung ditarik bank untuk membayar merchant. Sedangkan
**"Top Up Shopee"** adalah transfer.

**3. Satu transaksi bisa muncul dua kali.** Dedup dua lapis di
`statement-import.ts`: `external_id` mencegah impor ulang file yang sama, dan
baris yang sudah punya bukti pembayaran (nominal sama, selisih <=2 hari)
dilewati. Bukti bayar yang menang karena memuat nama merchant, sementara baris
statement cuma tertulis "Pembayaran".

Struktur tabel tiap bank berbeda (SeaBank, BRImo, Jago yang bahkan punya konsep
"kantong"), jadi pembacaan strukturnya diserahkan ke LLM alih-alih parser per
bank — bank keempat tidak butuh kode baru.

## Diagnostik

```bash
npm run test:receipt   -- <file/folder> [--limit=N] [--no-vision] [--compare]
npm run test:statement -- <file.pdf atau folder>
```

Keduanya menjalankan kode produksi, bukan salinan, lalu membongkar tiap tahap
supaya hasilnya bisa diperiksa mata sebelum dipercaya. `--no-vision` menguji
mutu Tesseract+Groq telanjang tanpa memakai kuota Gemini.

## Catatan best practice

- **Stateless**: client Supabase dibuat per-request; worker Tesseract dan client
  LLM di-cache per cold-start.
- Ganti daftar model Groq di `src/lib/groq.ts` bila dashboard berubah — model
  yang tidak dikenal menghasilkan 404 dan otomatis dilewati rantai.

## Bot Telegram (multi-user)

Alur: user daftar di web app dengan nomor telepon -> sekali bagikan kontak ke bot ->
`telegram_links` menyimpan chat_id -> user_id -> kirim foto/teks langsung tersimpan.

Webhook membalas 200 lebih dulu lalu memproses lewat `after()`, dan melakukan
dedupe berdasarkan `update_id` supaya retry Telegram tidak membuat transaksi ganda.

### Langkah

1. Jalankan ketiga migration di Supabase SQL Editor.
2. Buat bot di Telegram via **@BotFather** -> `/newbot` -> salin token -> isi `TELEGRAM_BOT_TOKEN`.
3. Buat string acak untuk `TELEGRAM_WEBHOOK_SECRET` (mis. `openssl rand -hex 16`).
4. Isi `SUPABASE_SERVICE_ROLE_KEY` dengan secret key Supabase (server-only, bypass RLS).
5. Deploy ke Vercel (webhook butuh URL publik). Masukkan semua env di Vercel.
6. Daftarkan webhook (ganti TOKEN, URL, SECRET):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<app>.vercel.app/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

7. Buka bot -> bagikan nomor -> mulai kirim struk/teks.

Catatan keamanan: webhook memverifikasi header `x-telegram-bot-api-secret-token`
agar hanya request dari Telegram (dengan secret yang benar) yang diproses.
