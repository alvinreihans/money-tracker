# Spec: Normalisasi database

Status: **diterapkan** (menunggu `db:migrate`) (#1–#5, #7; tanpa soft delete) · 27 Oktober 2026 · branch `feat/normalisasi` · rilis 2.7.0

Audit memakai skill `designing-database-schemas` terhadap 8 tabel di skema `public` & `private`, dengan data sungguhan. Yang sudah sesuai (tidak diubah):
- UUID sebagai kunci utama;
- uang `NUMERIC(14,2)`, waktu `TIMESTAMPTZ`;
- status memakai CHECK;
- relasi utama ber-FK;
- salinan kolom di bagian pecahan (denormalisasi yang disengaja, SPEC-metode-budget).

## Keputusan user

- **Dikerjakan:** #1 FK kategori, #2 indeks FK, #3 `payment_method` tidak menyalin nama kantong, #4 buang kolom lama, #5 `updated_at`, #7 CHECK `jatuh_tempo`.
- **Tidak:** soft delete (`deleted_at`). Hapus permanen lebih tepat untuk data keuangan pribadi; salah hapus sudah ditangani Urungkan.
- **`updated_at` hanya dicatat.** Ingat kategori (SPEC-ingat-kategori) tetap "transaksi terakhir menurut tanggal adalah contoh untuk berikutnya", bukan "keputusan terbaru menang".

## Prinsip: aplikasi tidak perlu tahu

View `public.transactions` tetap mengembalikan kolom yang sama, jadi kode aplikasi (84 tempat membaca `payment_method`, semua filter kategori) tidak berubah:

| Kolom view | Disimpan | Ditampilkan view |
|---|---|---|
| `category` | **NULL** untuk pindah kantong | `'other'` untuk pindah kantong, selain itu apa adanya |
| `payment_method` | **NULL** bila ada `kantong_id` (teks hanya untuk draft tanpa kantong) | nama kantong **saat ini**, atau teks tersimpan |

Trigger tulis view yang mengubah isian ke bentuk tersimpannya; aplikasi tetap boleh mengirim `'other'` dan nama kantong seperti sekarang.

## #1 FK kategori

- **`transaksi_data (user_id, type, category)` → `categories (user_id, type, slug)`:**
  - `ON UPDATE CASCADE`;
  - `ON DELETE NO ACTION`: dicek di akhir pernyataan, jadi menghapus akun (cascade ke kategori & transaksi sekaligus) tetap jalan;
  - pindah kantong ber-`category` NULL tidak dicek.
- **`budgets` & `cicilan`:** belum punya kolom jenis.
  - Ditambah `type text not null default 'expense'` dengan `check (type = 'expense')`.
  - FK ke `categories` yang sama; budget ikut terhapus bersama kategorinya (`ON DELETE CASCADE`), cicilan `NO ACTION`.
- **`hapus_kategori`** (RPC hapus kategori) juga memindahkan rencana cicilan ke Lainnya. Sebelumnya terlewat; dengan FK, menghapus kategori yang dipakai cicilan akan gagal.
- **Hasilnya:** transaksi, budget, dan cicilan tidak bisa lagi menunjuk kategori yang tidak ada. Database yang menolak, bukan hanya kode aplikasi.

## Ditemukan saat uji kering

- **Bug yang sudah ada di produksi:** kantong yang punya pindah kantong tidak bisa dihapus user biasa ("permission denied for schema private").
  - **Penyebab:** lima fungsi trigger di `transaksi_data` (`ikutan_ikut_induk`, `ikutan_salin_induk`, `ikutan_sesuai_jenis`, `pecahan_ikut_asli`, `pecahan_salin_asli`) berjalan sebagai pemanggil. Lewat view itu aman, tapi saat database sendiri mengubah baris transaksi atas nama user (`kantong_tujuan_id` di-NULL-kan karena kantongnya dihapus), user tidak punya akses ke skema `private`.
  - **Perbaikan:** kelimanya jadi `security definer`; isinya tidak berubah dan `search_path` sudah terkunci.
- **Nama kantong yang dihapus:** transaksinya lepas dari kantong seperti dulu. Trigger `kantong_dihapus` menyalin namanya ke `payment_method` sebelum kantong hilang, jadi detailnya tetap menyebut "BCA".
- **Nilai bawaan kategori di view:** dulu `'uncategorized'`, yang tidak ada di `categories` dan akan ditolak FK. Kini `'other'` (tidak ada baris yang memakai `'uncategorized'`).
- **Kode mati ikut dibuang:** pencarian baris rekening koran di `simpanTransaksi` dan isian `supersededStatement` di balasan `/api/upload-receipt`.

## #2 Indeks FK

`transaksi_data(kantong_id)`, `transaksi_data(kantong_tujuan_id)`, `transaksi_data(duplikat_dari)`, `cicilan(user_id)`, `cicilan(kantong_id)`, `draft_catat(user_id)`.

## #3 `payment_method`

- **Disimpan hanya bila tidak ada kantong** (draft yang kantongnya belum cocok, "Nggak ada kantong yang cocok dengan …").
- **Dengan kantong:** nama dibaca dari `user_accounts`, jadi mengganti nama kantong langsung terlihat di semua transaksi lama.
- **Isian awal:** `payment_method = NULL` untuk semua baris berkantong (hari ini 0 baris yang namanya berbeda).

## #4 Kolom lama

- **Dibuang:** `account`, `counterparty`, `external_id` (beserta indeks unik `idx_transactions_external`). Semuanya kosong, sisa impor rekening koran yang sudah dihapus.
- **View:** dibuat ulang (`DROP` + `CREATE`), karena Postgres tidak bisa membuang kolom dari view. Trigger tulis dan hak `authenticated` dipasang lagi; tidak ada view atau fungsi lain yang bergantung padanya (sudah dicek).
- **Kode:**
  - baris "Rekening" & "Lawan transaksi" di detail transaksi dihapus;
  - tipe `Transaction` dirapikan;
  - pencarian baris rekening koran di `simpanTransaksi` (selalu kosong) dihapus.

## #5 `updated_at`

- **Tabel:** `transaksi_data`, `categories`, `user_accounts`, `cicilan`, masing-masing `timestamptz not null default now()`.
- **Trigger:** `before update` mengisinya. Fungsi trigger `security definer` (pelajaran 20261105000001: fungsi di skema `private` yang dipanggil user biasa harus `security definer`).
- **View** `transactions` ikut menampilkannya. Belum dipakai aplikasi.

## #7 CHECK `jatuh_tempo`

`jatuh_tempo` hanya untuk kantong `orang` dan `kredit` (notifikasi tagihan kartu kredit memakainya). Hari ini tidak ada baris yang melanggar.

## Pengujian

- **Uji kering migrasi** (transaksi di-rollback, termasuk sebagai role `authenticated` dengan akun sementara):
  - jumlah baris & saldo semua kantong identik sebelum/sesudah;
  - view mengembalikan `'other'` untuk pindah kantong dan nama kantong untuk `payment_method`;
  - kategori tak dikenal ditolak; ganti nama kantong terlihat di transaksi lama;
  - hapus kategori yang dipakai cicilan berhasil (cicilan pindah ke Lainnya);
  - `updated_at` berubah saat diubah;
  - `jatuh_tempo` di kantong bank ditolak;
  - **menghapus akun** (cascade) tetap berhasil.
- **Sesudah migrasi:** cek lewat API sebagai user biasa, semua `uji:*`, semua E2E (15 suite), `eval:tanya`, typecheck, `next build`.

## Boundaries

- **Jangan:** mengubah logika ingat kategori; mengubah tampilan atau perilaku aplikasi.
- **Tanya dulu:** mengganti slug kategori jadi `category_id` (perubahan kode jauh lebih besar, manfaatnya kecil karena slug kategori buatan user sudah acak & tetap).
