# Spec: Enkripsi merchant, keterangan & teks OCR

Status: **draf, menunggu persetujuan** · 22 Oktober 2026 · Pilihan **B** dari `KAJIAN-KEAMANAN-DATA.md`.

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

1. Tabel `transactions` diganti nama menjadi **`transaksi_data`**; kolom `merchant`, `description`, `raw_ocr_text` diganti `*_enc bytea` berisi `pgp_sym_encrypt(teks, kunci, 'cipher-algo=aes256')` (AES-256 dengan IV acak + pemeriksaan integritas).
2. Dibuat **view `public.transactions`** dengan kolom persis seperti tabel lama (teks didekripsi), jadi semua kode, RPC, dan filter (termasuk `ilike` pencarian) tetap jalan.
3. Menulis lewat view memakai trigger `INSTEAD OF INSERT/UPDATE/DELETE` yang mengenkripsi lalu menulis ke `transaksi_data`.
4. **Keamanan per user tetap rapat**:
   - View berjalan sebagai pemiliknya (supaya kunci tidak perlu dibuka ke user), dengan **`where user_id = auth.uid()`** di dalam view (`security_barrier`).
   - Trigger tulis memeriksa `user_id = auth.uid()` (pengganti policy RLS).
   - Tabel `transaksi_data` tetap ber-RLS dan **tidak bisa diakses langsung** oleh anon/authenticated.
   - Fungsi pengambil kunci tidak bisa dipanggil user (tidak di-grant).
5. **Data lama**: dienkripsi sekali di migrasi, lalu kolom teks polosnya dihapus — **mengubah data yang ada** (perlu persetujuanmu).

## Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Hanya ada database produksi (tidak ada staging) | Migrasi dalam satu transaksi (gagal = batal semua). Disiapkan **skrip balik** (`*_rollback.sql`) yang mengembalikan teks polos dari data terenkripsi. Langsung setelah migrasi: uji end-to-end otomatis dengan akunmu (catat, edit, hapus, cari, Lend & Borrow, cicilan, budget) seperti uji Fase 4. |
| Kunci Vault hilang = teks tidak bisa dibaca lagi | Kunci dibuat & disimpan di Vault (ikut backup project Supabase). Disarankan kamu juga menyimpan salinan kunci di password manager (cara mengambilnya ada di catatan migrasi). |
| Lebih lambat | Dekripsi per baris: daftar 100 transaksi ≈ puluhan ms. Pencarian mendekripsi semua baris yang cocok filter lain — untuk ribuan transaksi ±1 detik. Dicatat sebagai `ponytail:` dengan jalan keluarnya (indeks pencarian ter-hash) kalau terasa. |
| Policy RLS di tabel tidak lagi jadi penjaga utama untuk transaksi | Diganti filter `auth.uid()` di view & trigger, **diuji** dengan dua sesi: akunmu tidak bisa membaca/mengubah transaksi akun lain (dicoba lewat API). |

## Pengujian

- **Sebelum migrasi:** fungsi enkripsi/dekripsi & trigger dicoba di skema sementara dalam transaksi yang dibatalkan (tanpa menyentuh data).
- **Sesudah migrasi:**
  - `transaksi_data` hanya berisi bytea untuk tiga kolom itu;
  - view menampilkan teks yang sama dengan sebelum migrasi (dibandingkan jumlah & sampel `md5`);
  - uji end-to-end lengkap;
  - uji isolasi antar-user (insert/update/select dengan `user_id` orang lain ditolak).
- `tsc`, `next build`, semua `uji:*`.

## Boundaries

- **Disetujui lewat spec ini (setelah di-approve):** migrasi di atas, termasuk mengenkripsi & menghapus kolom teks polos data lama.
- **Jangan:** mengenkripsi nominal/tanggal/kategori/kantong (merusak ringkasan, budget, saldo).
