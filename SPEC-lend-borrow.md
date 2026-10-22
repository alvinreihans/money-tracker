# Spec: Lend & Borrow, cicilan paylater & kartu kredit

Status: **draf, menunggu persetujuan** · 22 Oktober 2026 · Fase 4 dari rencana di CHANGELOG.

## Tujuan

Mencatat uang yang **dipinjamkan ke** / **dipinjam dari** orang lain, dan **cicilan** (paylater, kartu kredit) — tanpa merusak hitungan yang sudah ada: pinjaman bukan pemasukan maupun pengeluaran, dan total aset tetap berarti "uang yang ada di kantongku".

Pengguna: pemilik akun (aplikasi pribadi).

### Istilah di aplikasi

Memakai istilah Inggris yang pendek dan tidak tertukar (keputusan 22 Okt 2026):

| Di aplikasi | Artinya | Dulu disebut |
|---|---|---|
| **Lend** | Uang yang **kupinjamkan** ke orang lain — mereka berutang ke aku | piutang |
| **Borrow** | Uang yang **kupinjam** dari orang lain/kartu kredit — aku berutang | utang |
| **Cicilan** | Paylater & cicilan kartu kredit | — |

Teks lain di aplikasi tetap bahasa Indonesia (mis. tombol "Terima bayaran", "Bayar").

### Keputusan yang sudah diambil (22 Okt 2026)

| Pertanyaan | Keputusan |
|---|---|
| Kapan belanja paylater/cicilan dihitung pengeluaran? | **Saat cicilan dibayar** (per bulan), bukan saat belanja |
| Cakupan | Pinjam-meminjam ke orang, paylater dengan cicilan, kartu kredit, dan dikenali dari ketikan AI |
| Total aset di Beranda | **Terpisah**: Total aset = uang di kantong; Lend & Borrow di kartu sendiri |
| Jatuh tempo pinjaman ke orang | **Opsional** (paylater selalu punya jatuh tempo per cicilan) |

## Rancangan

### 1. Pinjam-meminjam ke orang → "kantong orang"

Setiap orang yang terlibat pinjaman adalah kantong berjenis **`orang`** (tabel `user_accounts`, sudah ada). Saldonya = posisi Lend/Borrow dengan orang itu, dihitung oleh rumus saldo yang sudah ada:

| Kejadian | Dicatat sebagai | Saldo "Budi" | Saldo BCA |
|---|---|---|---|
| Minjemin Budi 500 rb dari BCA | Pindah kantong BCA → Budi | +500 rb (Budi utang ke aku) | −500 rb |
| Budi bayar 200 rb ke BCA | Pindah kantong Budi → BCA | +300 rb | +200 rb |
| Pinjam dari Ibu 1 jt masuk BRI | Pindah kantong Ibu → BRI | −1 jt (aku utang ke Ibu) | — |
| Bayar Ibu 500 rb dari BRI | Pindah kantong BRI → Ibu | −500 rb | — |

- Karena berupa **pindah kantong**, tidak masuk pemasukan/pengeluaran, budget, maupun grafik — sesuai kenyataannya.
- Saldo positif = **Lend** (orang itu utang ke aku), negatif = **Borrow** (aku utang ke dia). Lunas = saldo 0.
- **Jatuh tempo** opsional per orang (`user_accounts.jatuh_tempo`), dipakai kartu Beranda dan notifikasi fase 5.
- Kantong `orang` **tidak** muncul di pilihan "Bayar pakai"/"Masuk ke" dan **tidak** dihitung di Total aset.

### 2. Cicilan (paylater & cicilan kartu kredit) → "rencana cicilan"

Tabel baru **`cicilan`**: nama barang ("HP Samsung"), penyedia ("Shopee PayLater", "Kartu kredit BCA"), kategori pengeluaran, nominal per bulan, tenor (jumlah bulan), jatuh tempo pertama, kantong pembayar bawaan, catatan.

- **Belanja dengan cicilan tidak dicatat sebagai pengeluaran** saat belanja (keputusan di atas) — cukup membuat rencana cicilan.
- **Membayar cicilan ke-n** = transaksi **pengeluaran** biasa (kategori dari rencana, mis. Belanja; kantong pembayar; merchant = nama barang) yang menempel ke rencananya (`transactions.cicilan_id`, `cicilan_ke`). Jadi budget & laporan bulan itu ikut menghitungnya.
- **Jadwal dihitung, tidak disimpan**: jatuh tempo ke-n = jatuh tempo pertama + (n−1) bulan; sudah dibayar = ada transaksi dengan `cicilan_ke = n`. Lunas = semua n terbayar.
- Bunga/biaya sudah termasuk dalam "nominal per bulan" (yang memang ditagihkan penyedia).

### 3. Kartu kredit → kantong berjenis `kredit`

- Kartu kredit adalah kantong berjenis **`kredit`**; saldonya negatif = tagihan berjalan.
- **Belanja biasa pakai kartu** = pengeluaran dari kantong kartu (dicatat saat belanja, karena barang & kategorinya jelas saat itu). Tagihan naik.
- **Bayar tagihan** = pindah kantong BCA → Kartu kredit. Tagihan turun; bukan pengeluaran lagi.
- **Cicilan lewat kartu** (mis. cicilan 0% 6 bulan) = rencana cicilan dengan kantong pembayar = kartu itu. Tiap bulan cicilannya menjadi pengeluaran dari kantong kartu (masuk tagihan), lalu dibayar bersama tagihan.
- Kantong `kredit` **muncul** di pilihan "Bayar pakai" dan **tidak** dihitung di Total aset (ditampilkan di kartu Lend & Borrow, bagian Borrow).

> ⚠️ Catatan konsistensi: belanja kartu kredit *biasa* tetap dihitung saat belanja (bukan saat tagihan dibayar), karena kalau tidak, semua belanja sebulan baru muncul sekaligus tanpa kategori saat tagihan dibayar. Yang dihitung "saat dibayar" hanya **cicilan** — sesuai keputusan. **Mohon konfirmasi.**

### 4. Tampilan

- **Halaman "Lend & Borrow"** (dari kartu Beranda dan Pengaturan):
  - *Lend* — orang yang utang ke aku, sisa & jatuh tempo; aksi **Pinjamkan** / **Terima bayaran**.
  - *Borrow* — ke orang & kartu kredit; aksi **Pinjam** / **Bayar**.
  - *Cicilan* — tiap rencana: "3 dari 6 terbayar", jatuh tempo berikutnya, tombol **Bayar cicilan ke-4** (pilih kantong, nominal bisa diubah); tambah rencana baru.
  - Riwayat transaksi per orang/rencana.
- **Beranda**: kartu **"Lend & Borrow"** — total Lend, total Borrow, cicilan yang jatuh tempo bulan ini, dan yang paling dekat jatuh temponya. Total aset tetap hanya kantong uang.
- **Pengaturan → Kantong**: kantong `orang` dan `kredit` tidak dicampur dengan kantong uang (dikelola dari halaman Lend & Borrow).

### 5. Dari ketikan AI

| Ketikan | Hasil |
|---|---|
| "minjemin budi 200rb dari bca" | Pindah kantong BCA → Budi (kantong orang "Budi" dibuat bila belum ada) |
| "budi balikin 100rb ke bca" | Pindah kantong Budi → BCA |
| "pinjem uang ibu 1jt masuk bri" | Pindah kantong Ibu → BRI |
| "bayar utang ke ibu 500rb pake bri" | Pindah kantong BRI → Ibu |
| "bayar cicilan spaylater 150rb pake bca" | Pembayaran cicilan berikutnya dari rencana yang cocok (penyedia/nama) |
| "bayar tagihan kartu kredit bca 2jt dari bca" | Pindah kantong BCA → Kartu kredit BCA |

- Prompt ditambah dua field: `pinjaman` (`beri` / `terima_bayar` / `pinjam` / `bayar`, dengan `pihak`) dan `cicilan` (penyedia/nama yang disebut). Daftar orang & rencana cicilan milik user ikut dikirim, seperti daftar kategori.
- Tidak yakin / tidak cocok → **Perlu dibenerin** (aturan yang sama dengan kantong).

## Data (migrasi)

```sql
-- jenis kantong baru
alter table user_accounts drop constraint ...kind_check;
alter table user_accounts add constraint user_accounts_kind_check
  check (kind in ('bank', 'ewallet', 'cash', 'orang', 'kredit'));
alter table user_accounts add column jatuh_tempo date;            -- opsional, untuk orang

create table cicilan (
  id uuid pk, user_id uuid fk auth.users,
  nama text, penyedia text, category text,
  nominal numeric(14,2) > 0, tenor int > 0, jatuh_tempo_awal date,
  kantong_id uuid fk user_accounts on delete set null,   -- pembayar bawaan
  catatan text, created_at timestamptz
);  -- RLS: milik sendiri

alter table transactions
  add column cicilan_id uuid references cicilan on delete set null,
  add column cicilan_ke int;
```

Tidak ada data lama yang diubah.

## Di luar cakupan

- Bunga yang dihitung otomatis, denda keterlambatan, dan minimum payment kartu kredit (cukup catat nominal yang dibayar).
- Pinjaman dengan banyak orang sekaligus (patungan) — bisa dicatat per orang.
- Pengingat jatuh tempo → **fase 5 (push notifikasi)**; fase ini hanya menyiapkan datanya.

## Pengujian

- Fungsi murni + `assert` (`scripts/uji-pinjaman.mts`): ringkasan Lend/Borrow dari saldo kantong orang, jadwal cicilan (jatuh tempo per bulan termasuk akhir bulan & ganti tahun, status terbayar, lunas), dan pemilihan cicilan berikutnya.
- Saldo kantong yang sudah ada tetap lolos `uji:kantong` (kantong orang/kredit memakai rumus yang sama).
- Total aset & pilihan kantong di form mengecualikan `orang` (dan `kredit` dari Total aset).
- `npm run test:teks` untuk kalimat-kalimat di tabel bagian 5.
- Cek visual 375px: halaman Lend & Borrow, sheet aksi, kartu Beranda.

## Urutan kerja (tiap langkah satu commit, bisa diuji sendiri)

1. Migrasi + tipe + fungsi murni (`lib/pinjaman.ts`) + uji.
2. Kantong orang & kredit: dikecualikan dari Total aset/pilihan; halaman Lend & Borrow bagian Lend/Borrow + aksinya.
3. Rencana cicilan: tambah, jadwal, bayar cicilan.
4. Kartu Beranda "Lend & Borrow".
5. AI: field `pinjaman` & `cicilan`, pencocokan, kalimat uji.

## Boundaries

- **Sudah disetujui lewat spec ini (setelah di-approve):** migrasi di atas.
- **Tetap tanya dulu:** mengubah atau menghapus data lama.
- **Jangan:** mengubah cara hitung pemasukan/pengeluaran untuk transaksi biasa.
