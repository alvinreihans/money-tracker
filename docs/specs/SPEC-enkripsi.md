# Spec: Enkripsi merchant, keterangan & teks OCR

Status: **diterapkan** (cara 1, termasuk teks OCR) · rilis 2.0.0 · migrasi `20261027000000_enkripsi.sql` · 22 Oktober 2026 · Pilihan **B** dari kajian keamanan data (dokumen kajian terpisah, tidak disimpan di repo) · disinkronkan dengan kode 1 Nov 2026

## Tujuan

Kolom teks yang paling pribadi di tabel transaksi — **merchant**, **keterangan**, dan **teks OCR/asli** draft (bisa memuat nama, nomor rekening) — tersimpan **terenkripsi** di database, supaya dump atau backup database yang bocor tidak bisa dibaca. Nominal, tanggal, kategori, dan kantong tetap polos supaya ringkasan, budget, saldo, dan grafik tetap dihitung di database.

**Bukan tujuan:** melindungi dari pemilik akses database/dashboard Supabase (itu pilihan C, end-to-end, yang dikesampingkan).

## Dua cara yang mungkin

| | **1. Di database (disarankan)** | 2. Di server aplikasi |
|---|---|---|
| Kunci disimpan di | **Supabase Vault** (terenkripsi dengan kunci induk Supabase, tidak ikut dump) | Variabel lingkungan Vercel |
| Enkripsi/dekripsi | Fungsi Postgres (`pgcrypto`, AES-256) | Kode Node (AES-256-GCM) |
| Perubahan kode aplikasi | **Hampir tidak ada** — aplikasi tetap membaca/menulis `transactions` | Besar: semua baca/tulis browser ke `transactions` (edit, "Muat lagi", Lend & Borrow, dll.) harus pindah lewat server |
| Cari di Riwayat | **Tetap jalan** (didekripsi di database lalu dicari) | Tidak bisa lewat database; harus memuat semua lalu disaring di server |
| Melindungi dari dump/backup bocor | ✅ | ✅ |
| Melindungi dari orang yang memegang database | ❌ (kunci di Vault bisa dibaca postgres) | ✅ selama kunci Vercel aman |

**Disarankan cara 1**: perlindungan yang sama untuk skenario yang dipilih (dump bocor), tanpa merombak aplikasi dan tanpa kehilangan pencarian.

## Rancangan (cara 1)

```
Aplikasi  ──baca/tulis──▶  VIEW public.transactions  (sama seperti sekarang)
                              │  dekripsi saat dibaca, enkripsi saat ditulis
                              ▼
                           TABEL public.transaksi_data  (merchant_enc, description_enc, raw_ocr_text_enc: bytea)
                              ▲ kunci dari Vault ("kunci_transaksi")
```

1. Kunci 256 bit acak dibuat sekali di Vault (`vault.create_secret`, nama `kunci_transaksi`); migrasi ulang tidak menggantinya. Dibaca lewat `private.kunci_transaksi()` (security definer), yang **gagal keras** bila kuncinya hilang (lebih baik error daripada teks tersimpan NULL).
2. Tabel `transactions` diganti nama menjadi **`transaksi_data`** dan dipindah ke skema **`private`** (tidak diekspos API; `revoke all on schema private` dari public/anon/authenticated); kolom `merchant`, `description`, `raw_ocr_text` diganti `*_enc bytea` berisi `pgp_sym_encrypt(teks, kunci, 'cipher-algo=aes256, s2k-mode=1')` (AES-256 dengan IV acak + pemeriksaan integritas; tanpa iterasi S2K karena kuncinya sudah 256 bit acak — 17× lebih cepat).
3. Dibuat **view `public.transactions`** dengan kolom persis seperti tabel lama (teks didekripsi), jadi semua kode, RPC, dan filter (termasuk `ilike` pencarian) tetap jalan. Nilai bawaan kolom (id, type, status, dll.) dipasang di view. Kunci dibaca lewat `(select private.kunci_transaksi())` (InitPlan): sekali per query, hanya bila kolom teksnya diminta.
4. Menulis lewat view memakai trigger `transactions_tulis` (`INSTEAD OF INSERT/UPDATE/DELETE`, `private.transactions_tulis()`) yang mengenkripsi lalu menulis ke `transaksi_data`. Saat UPDATE, teks yang tidak berubah tidak dienkripsi ulang (`is not distinct from`).
5. **Keamanan per user tetap rapat**:
   - View berjalan sebagai pemiliknya (supaya kunci tidak perlu dibuka ke user), dengan **`where user_id = auth.uid()`** di dalam view (`security_barrier`).
   - Trigger tulis memeriksa `user_id = auth.uid()` (pengganti policy RLS), galat `42501` "Transaksi ini bukan milikmu". Sejak `20261109000000_isolasi_rujukan.sql` juga menolak rujukan (`induk_id`, `pecahan_dari`, `pelengkap_tujuan`, `duplikat_dari`, kantong, cicilan) ke data akun lain.
   - Tabel `transaksi_data` tetap ber-RLS (policy ikut pindah) dan **tidak bisa diakses langsung** oleh anon/authenticated/service_role.
   - Fungsi pengambil kunci: EXECUTE memang di-grant ke `authenticated` (dibutuhkan view), tetapi user tidak punya USAGE skema `private`, jadi tidak bisa memanggilnya sendiri. Fungsi trigger tidak di-grant sama sekali.
6. **Data lama**: dienkripsi sekali di migrasi, lalu kolom teks polosnya dihapus — **mengubah data yang ada** (disetujui).

**Mengubah kolom transaksi sejak itu** = `alter table private.transaksi_data`, lalu `create or replace view public.transactions` dan `private.transactions_tulis()` ditulis ulang utuh di migrasi baru. Definisi terakhir: view di `20261108000000_fase4.sql`, trigger di `20261109000000_isolasi_rujukan.sql`.

### Perluasan sesudahnya

Pola yang sama (bytea `pgp_sym_encrypt` dengan `kunci_transaksi`, didekripsi di view) dipakai untuk:
- `bukti_transfer_enc` (`20261104000000_arah_transfer.sql`): nama & rekening di bukti transfer;
- `usulan_pecah_enc` (`20261108000000_fase4.sql`, SPEC-tawar-pecah): nama barang;
- `private.draft_catat.foto_enc` (`20261030000000_draft_catat.sql`): foto struk draft, `pgp_sym_encrypt_bytea`, lewat RPC.

## Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Hanya ada database produksi (tidak ada staging) | Migrasi dalam satu transaksi (gagal = batal semua). Disiapkan **skrip balik** (`supabase/rollback/20261027000000_enkripsi_rollback.sql`) yang mengembalikan teks polos dari data terenkripsi — **hanya berlaku untuk skema tepat sesudah migrasi ini**; lihat "Belum diterapkan". Langsung setelah migrasi: uji end-to-end otomatis dengan akunmu (catat, edit, hapus, cari, Lend & Borrow, cicilan, budget) seperti uji Fase 4. |
| Kunci Vault hilang = teks tidak bisa dibaca lagi | Kunci dibuat & disimpan di Vault (ikut backup project Supabase). Disarankan kamu juga menyimpan salinan kunci di password manager: `select decrypted_secret from vault.decrypted_secrets where name = 'kunci_transaksi';` (catatan di kepala migrasi). |
| Lebih lambat | Dekripsi per baris: daftar 100 transaksi ≈ puluhan ms. Pencarian mendekripsi semua baris yang cocok filter lain — untuk ribuan transaksi ±1 detik. Dicatat sebagai `ponytail:` dengan jalan keluarnya (indeks pencarian ter-hash) kalau terasa. |
| Policy RLS di tabel tidak lagi jadi penjaga utama untuk transaksi | Diganti filter `auth.uid()` di view & trigger, **diuji** dengan dua sesi: akunmu tidak bisa membaca/mengubah transaksi akun lain (dicoba lewat API). |

## Pengujian

- **Sebelum migrasi:** fungsi enkripsi/dekripsi & trigger dicoba di skema sementara dalam transaksi yang dibatalkan (tanpa menyentuh data).
- **Sesudah migrasi:**
  - `transaksi_data` hanya berisi bytea untuk tiga kolom itu;
  - view menampilkan teks yang sama dengan sebelum migrasi (dibandingkan jumlah & sampel `md5`);
  - uji end-to-end lengkap;
  - uji isolasi antar-user (insert/update/select dengan `user_id` orang lain ditolak). Kini permanen: `npm run uji:isolasi` (`scripts/uji-isolasi.mjs`; baca, ubah, hapus, tulis atas nama orang lain, fungsi, kolom rujukan).
- `tsc`, `next build`, semua `uji:*`.

## Boundaries

- **Disetujui lewat spec ini (setelah di-approve):** migrasi di atas, termasuk mengenkripsi & menghapus kolom teks polos data lama.
- **Jangan:** mengenkripsi nominal/tanggal/kategori/kantong (merusak ringkasan, budget, saldo).

## Belum diterapkan

- **Skrip balik yang sesuai skema sekarang.** `supabase/rollback/20261027000000_enkripsi_rollback.sql` hanya mengembalikan `merchant`, `description`, `raw_ocr_text`, lalu `drop schema private`. Sejak itu `private` juga berisi `draft_catat`, beberapa fungsi trigger/RPC yang merujuk `private.transaksi_data`, serta kolom `bukti_transfer_enc` & `usulan_pecah_enc`; skripnya akan gagal atau meninggalkan kolom terenkripsi. Perlu ditulis ulang sebelum dipakai.
- **Indeks pencarian ter-hash** (`ponytail:` di migrasi): belum perlu; pencarian Riwayat masih mendekripsi tiap baris yang lolos filter lain.
