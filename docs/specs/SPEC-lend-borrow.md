# Spec: Lend & Borrow (Utang & Piutang), cicilan paylater & kartu kredit

Status: **diterapkan** · rilis 2.0.0 (22 Oktober 2026; nama Utang & Piutang sejak 2.5.0) · disinkronkan dengan kode 1 Nov 2026

## Tujuan

Mencatat uang yang **dipinjamkan ke** / **dipinjam dari** orang lain, dan **cicilan** (paylater, kartu kredit) — tanpa merusak hitungan yang sudah ada: pinjaman bukan pemasukan maupun pengeluaran, dan total aset tetap berarti "uang yang ada di kantongku".

Pengguna: pemilik akun (aplikasi pribadi).

### Istilah di aplikasi

Semula istilah Inggris (keputusan 22 Okt 2026); sejak 2.5.0 semua teks aplikasi memakai **Utang & Piutang**. Alamat `/pinjaman` dan nama di kode (`lend`, `borrow`, `ringkasanPinjaman`, …) tetap.

| Di aplikasi | Di kode | Artinya |
|---|---|---|
| **Piutang** | lend | Uang yang **kupinjamkan** ke orang lain — mereka berutang ke aku |
| **Utang** | borrow | Uang yang **kupinjam** dari orang lain/kartu kredit — aku berutang |
| **Cicilan** | cicilan | Paylater & cicilan kartu kredit |

### Keputusan yang sudah diambil (22 Okt 2026)

| Pertanyaan | Keputusan |
|---|---|
| Kapan belanja paylater/cicilan dihitung pengeluaran? | **Saat cicilan dibayar** (per bulan), bukan saat belanja |
| Cakupan | Pinjam-meminjam ke orang, paylater dengan cicilan, kartu kredit, dan dikenali dari ketikan AI |
| Total aset di Beranda | **Terpisah**: Total aset = uang di kantong; Utang & Piutang di kartu sendiri |
| Jatuh tempo pinjaman ke orang | **Opsional** (paylater selalu punya jatuh tempo per cicilan) |
| Belanja kartu kredit *biasa* | **Dihitung saat belanja** (barang & kategorinya jelas saat itu); yang dihitung "saat dibayar" hanya **cicilan** |

## Rancangan

### 1. Pinjam-meminjam ke orang → "kantong orang"

Setiap orang yang terlibat pinjaman adalah kantong berjenis **`orang`** (tabel `user_accounts`), dibuat dengan `saldo_awal` 0 per `2000-01-01` (`SALDO_PER_PINJAMAN`) supaya pinjaman bertanggal mundur tetap terhitung. Saldonya = posisi utang/piutang dengan orang itu, dihitung oleh rumus saldo yang sama (`saldo_kantong()`):

| Kejadian | Dicatat sebagai | Saldo "Budi" | Saldo BCA |
|---|---|---|---|
| Minjemin Budi 500 rb dari BCA | Pindah kantong BCA → Budi | +500 rb (Budi utang ke aku) | −500 rb |
| Budi bayar 200 rb ke BCA | Pindah kantong Budi → BCA | +300 rb | +200 rb |
| Pinjam dari Ibu 1 jt masuk BRI | Pindah kantong Ibu → BRI | −1 jt (aku utang ke Ibu) | — |
| Bayar Ibu 500 rb dari BRI | Pindah kantong BRI → Ibu | −500 rb | — |

- Karena berupa **pindah kantong** (`type = 'transfer'`, kategori `other`, merchant = nama orang), tidak masuk pemasukan/pengeluaran, budget, maupun grafik.
- Saldo positif = **Piutang**, negatif = **Utang**. Lunas = saldo 0.
- **Jatuh tempo** opsional per orang (`user_accounts.jatuh_tempo`), diisi saat meminjam/meminjamkan; otomatis dikosongkan begitu dibayar lunas. Dipakai kartu Beranda dan notifikasi.
- Orang yang sudah ada dipakai lagi (nama tanpa beda huruf besar-kecil); yang baru dibuatkan kantongnya.
- Kantong `orang` **tidak** muncul di pilihan kantong pengeluaran/pemasukan (hanya di pindah kantong) dan **tidak** dihitung di Total aset.

### 2. Cicilan (paylater & cicilan kartu kredit) → "rencana cicilan"

Tabel **`cicilan`**: nama barang ("HP Samsung"), penyedia ("Shopee PayLater", "Kartu kredit BCA"), kategori pengeluaran, nominal per bulan, tenor (1–120 bulan), jatuh tempo pertama, kantong pembayar bawaan, catatan, bunga per bulan opsional (SPEC-pelunasan).

- **Belanja dengan cicilan tidak dicatat sebagai pengeluaran** saat belanja — cukup membuat rencana cicilan (lewat **Cicilan baru**, atau otomatis dari belanja paylater: SPEC-paylater).
- **Membayar cicilan ke-n** = transaksi **pengeluaran** biasa (kategori rencana — jatuh ke Lainnya bila kategorinya sudah dihapus; kantong pembayar; merchant = nama barang; keterangan "Cicilan n/tenor · penyedia") yang menempel ke rencananya (`cicilan_id`, `cicilan_ke`). Budget & laporan bulan itu ikut menghitungnya.
- **Jadwal dihitung, tidak disimpan**: jatuh tempo ke-n = jatuh tempo pertama + (n−1) bulan, tanggal yang sama; bulan yang lebih pendek mundur ke hari terakhirnya (31 → 30 Apr, 28/29 Feb). Sudah dibayar = ada transaksi dengan `cicilan_ke = n`. Lunas = semua n terbayar. Cicilan berikutnya = nomor terkecil yang belum dibayar (bayar loncat tetap menyisakan yang terkecil).
- Bunga/biaya sudah termasuk dalam "nominal per bulan" (yang memang ditagihkan penyedia).
- Bisa dibayar beberapa sekaligus (SPEC-paylater).
- **Hapus rencana**: cicilan yang sudah dibayar tetap tercatat sebagai pengeluaran (`cicilan_id` jadi null).

### 3. Kartu kredit → kantong berjenis `kredit`

- Kartu kredit adalah kantong berjenis **`kredit`**; saldonya negatif = tagihan berjalan. Dibuat lewat **Tambah kartu kredit**: nama (bawaan "Kartu kredit"), tagihan sekarang (→ `saldo_awal` negatif), per tanggal, bunga per bulan opsional.
- **Belanja biasa pakai kartu** = pengeluaran dari kantong kartu (dicatat saat belanja). Tagihan naik.
- **Bayar tagihan** = pindah kantong BCA → Kartu kredit. Tagihan turun; bukan pengeluaran lagi.
- **Cicilan lewat kartu** (mis. cicilan 0% 6 bulan) = rencana cicilan dengan kantong pembayar = kartu itu. Saat cicilannya dibayar (tombol Bayar, tidak otomatis), pengeluarannya dari kantong kartu (masuk tagihan), lalu dibayar bersama tagihan.
- Kantong `kredit` **muncul** di pilihan kantong pengeluaran dan pindah kantong (tidak di pemasukan), **tidak** dihitung di Total aset, dan tampil di bagian Utang.

### 4. Tampilan

- **Halaman "Utang & Piutang"** (`/pinjaman`; dari kartu Beranda, Profil, dan item sidebar di layar ≥ 1200px). App bar: "Utang Rp … · Piutang Rp …". Pintasan: **Pinjamkan**, **Pinjam**, **Kartu**, **Cicilan**.
  - *Piutang · total* — orang yang utang ke aku, sisa & jatuh tempo ("Jatuh tempo …" / merah "Telat sejak …"). Aksi: **Terima bayaran**, **Pinjamkan lagi**, **Lihat riwayat**.
  - *Utang · total* — orang yang kuutangi (aksi **Bayar**, **Pinjam lagi**, **Atur bunga**, **Lihat riwayat**) dan kartu kredit ("Tagihan kartu kredit" / "Tidak ada tagihan"; aksi **Bayar tagihan**, **Atur bunga**, **Lihat riwayat**).
  - *Cicilan · sisa Rp …* — tiap rencana: "3/6 · berikutnya 23 Nov" (merah "telat sejak" bila ada yang lewat), nominal per bulan. Aksi: **Bayar cicilan ke-4 · Rp …**, **Lunasi n cicilan sisa · Rp …** (bila sisa > 1), **Lihat jadwal**, **Atur bunga**, **Hapus rencana**. Rencana lunas di *Cicilan lunas*.
  - *Strategi pelunasan* (SPEC-pelunasan), lalu *Sudah lunas* — orang bersaldo 0 (aksi **Pinjamkan**, **Pinjam**, **Lihat riwayat**).
  - **Lihat riwayat** membuka Riwayat tersaring ke kantong orang/kartu itu.
- **Form pinjaman** (Pinjamkan uang / Pinjam uang / Terima bayaran dari … / Bayar ke … / Bayar tagihan …): nama (chip orang yang sudah ada) bila belum dipilih, nominal (terisi sisa untuk bayar/terima bayaran), "Dari kantong"/"Masuk ke" (kantong uang; bawaan Tunai), tanggal, jatuh tempo (hanya pinjamkan/pinjam ke orang), keterangan. Disimpan lewat `/api/catat-manual`.
- **Cicilan baru**: nama barang, penyedia (chip Shopee PayLater, GoPayLater, Kredivo, Akulaku, Atome + nama kartu kredit), kategori (bawaan Belanja), cicilan per bulan, tenor, bunga per bulan, jatuh tempo pertama, "Biasanya dibayar pakai" (kantong uang & kartu), catatan.
- **Bayar cicilan**: berapa cicilan, nominal (bisa diubah), "Bayar pakai" (bawaan kantong pembayar rencana), tanggal bayar.
- **Beranda**: kartu **"Utang & Piutang"** — tenggat terdekat ("Terdekat: …" atau merah "… telat sejak …", dari jatuh tempo orang & cicilan berikutnya), Piutang (n orang utang ke kamu), Utang (ke orang & kartu kredit), Cicilan bulan ini (jumlah & total yang jatuh tempo sampai akhir bulan, termasuk yang telat), tautan "Lihat Utang & Piutang". Tidak tampil kalau tidak ada apa pun. Total aset tetap hanya kantong uang (termasuk tujuan tabungan).
- **Profil → Kantong**: kantong `orang` dan `kredit` tidak dicampur dengan kantong uang (dikelola dari halaman Utang & Piutang).

### 5. Dari ketikan AI

| Ketikan | Hasil |
|---|---|
| "minjemin budi 200rb dari bca" | Pindah kantong BCA → Budi (kantong orang "Budi" dibuat bila belum ada) |
| "budi balikin 100rb ke bca" | Pindah kantong Budi → BCA |
| "pinjem uang ibu 1jt masuk bri" | Pindah kantong Ibu → BRI |
| "bayar utang ke ibu 500rb pake bri" | Pindah kantong BRI → Ibu |
| "bayar cicilan spaylater 150rb pake bca" | Pembayaran cicilan berikutnya dari rencana yang cocok (penyedia/nama) |
| "bayar tagihan kartu kredit bca 2jt dari bca" | Pindah kantong BCA → Kartu kredit BCA |

- Isian AI: `pinjaman` { `arah`: `beri` / `terima_bayar` / `pinjam` / `bayar`, `pihak` } dan `cicilan` (nama barang/penyedia yang disebut, hanya untuk pengeluaran). Nama orang & kartu kredit user dan daftar rencana cicilan (nama — penyedia) ikut dikirim di prompt, seperti daftar kategori. Ada `pinjaman` → selalu pindah kantong, apa pun `type` tebakan model.
- `pihak` dicocokkan ke kantong orang & kartu; tidak ketemu → kantong orang baru. Kantong uang dicocokkan dari `payment_method`.
- Kantong uang tidak cocok → draft **"Belum selesai"** yang menanyakan kantongnya (aturan yang sama dengan kantong).
- Rencana cicilan dicocokkan persis (tanpa beda huruf/spasi) dengan nama barang atau penyedia; dari yang cocok & belum lunas, jatuh tempo berikutnya paling awal. Tidak ketemu → tetap dicatat sebagai pengeluaran biasa (uangnya memang keluar) dengan keterangan "Rencana cicilan “…” belum dicatat", bukan draft.
- "kopi 25rb budi" bukan pinjaman: pengeluaran/pemasukan tidak pernah memakai kantong orang.

## Data (migrasi)

`20261025000000_lend_borrow.sql`, ditambah perubahan sesudahnya:

```sql
-- jenis kantong baru ('tujuan' ditambah 20261106000000)
alter table user_accounts add constraint user_accounts_kind_check
  check (kind in ('bank', 'ewallet', 'cash', 'orang', 'kredit'));
alter table user_accounts add column jatuh_tempo date;            -- opsional
-- 20261107000000: check (jatuh_tempo is null or kind in ('orang','kredit'))
grant insert (kind, jatuh_tempo), update (jatuh_tempo) on user_accounts to authenticated;

create table cicilan (
  id uuid pk, user_id uuid fk auth.users on delete cascade default auth.uid(),
  nama text not null (1–60), penyedia text (≤ 60), category text not null default 'other',
  nominal numeric(14,2) > 0, tenor int 1–120, jatuh_tempo_awal date not null,
  kantong_id uuid fk user_accounts on delete set null,   -- pembayar bawaan
  catatan text (≤ 500), created_at timestamptz
);  -- RLS "cicilan_own": milik sendiri
-- 20261107000000: type text = 'expense' + FK (user_id, type, category) ke kategori; updated_at; indeks
-- 20261108000000: bunga_persen numeric(4,2) 0–10 (SPEC-pelunasan)
-- 20261109000000: RLS juga mewajibkan kantong_id milik sendiri

-- transaksi (kini private.transaksi_data di balik view transactions)
add column cicilan_id uuid references cicilan on delete set null,
add column cicilan_ke int check (cicilan_ke is null or cicilan_ke >= 1);
-- 20261109000000: trigger tulis menolak cicilan_id milik akun lain
```

Tidak ada data lama yang diubah.

## Di luar cakupan

- Bunga yang dihitung otomatis, denda keterlambatan, dan minimum payment kartu kredit (cukup catat nominal yang dibayar).
- Pinjaman dengan banyak orang sekaligus (patungan) — bisa dicatat per orang.
- Pengingat jatuh tempo → sudah ada sejak 2.0.0 (notifikasi harian 19.00: cicilan & pinjaman yang jatuh tempo 3 hari lagi atau besok, cicilan yang kemarin terlewat).

## Pengujian

- Fungsi murni + `assert` (`scripts/uji-pinjaman.mts`, `npm run uji:pinjaman`): jatuh tempo per bulan (akhir bulan & ganti tahun), jadwal & status (terbayar, telat, lunas, bayar loncat), arah pindah, saldo kantong orang lewat rumus saldo yang sama + ringkasan Utang/Piutang, Total aset hanya kantong uang, ringkasan kartu Beranda, pencocokan sebutan cicilan.
- Saldo kantong tetap lolos `uji:kantong`.
- `npm run test:teks -- "<kalimat>"` (AI sungguhan, kalimat sebagai argumen) untuk kalimat-kalimat di tabel bagian 5; contoh yang sama ada di prompt.
- E2E: `e2e/galat.mjs` & `e2e/perbaikan.mjs` (form Pinjamkan, Kartu, Cicilan baru), `e2e/pelunasan.mjs`.

## Boundaries

- **Jangan:** mengubah cara hitung pemasukan/pengeluaran untuk transaksi biasa.
- **Tetap tanya dulu:** mengubah atau menghapus data lama.

## Belum diterapkan

- Riwayat transaksi per **rencana cicilan** (yang ada: "Lihat jadwal"; riwayat tersaring hanya untuk orang/kartu).
- Mengubah rencana cicilan atau kartu kredit (hanya **Atur bunga** dan **Hapus rencana**); jatuh tempo kartu kredit boleh di database tapi tidak bisa diisi dari aplikasi.
