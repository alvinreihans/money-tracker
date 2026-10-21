# Spec: Analitik di Beranda + Pengaturan

Status: **disetujui, sedang dikerjakan** (22 Okt 2026). Branch: `feat/analitik`, dibuat dari `feat/ui-oneui`.

## Objective

Beranda jadi pusat analitik, terinspirasi spreadsheet keuangan per kantong milik teman pemakai. Ada empat kemampuan:

1. **Ringkasan bulanan & tren**: masuk, keluar, dan sisa uang beberapa bulan terakhir.
2. **Streak**: hari berturut-turut mencatat, sebagai penyemangat ("reward karena rajin isi").
3. **Budget per kategori**: target bulanan vs aktual vs sisa.
4. **Saldo per kantong**: saldo tiap kantong (BCA, GoPay, Tunai…) dan total aset.

Daftar transaksi di Beranda hanya menampilkan **hari ini dan kemarin**. Riwayat lengkap tetap di tab Riwayat.

Halaman **Pengaturan** (dibuka dari menu ⋮) menjadi tempat mengatur budget dan kantong.

## Peta kemampuan

| Modul | Isi | Butuh |
|---|---|---|
| `ringkasan` | Beranda baru: transaksi hari ini & kemarin, tren bulanan, streak | — |
| `pengaturan` | Halaman Pengaturan (dari ⋮): email, Keluar, versi; wadah modul di bawah | — |
| `budget` | Target per kategori, kartu Budget di Beranda | `pengaturan`, **tabel baru** |
| `kantong` | Daftar kantong + saldo awal, transaksi tertaut ke kantong, kartu Saldo & Total aset | `pengaturan`, **ubah tabel** |

Urutan kerja: `ringkasan` → `pengaturan` → `budget` → `kantong`. Tiap modul satu commit dan bisa diuji sendiri.

## Rancangan

### `ringkasan` (tanpa ubah database)
- **Tren:** batang pemasukan & pengeluaran untuk 6 bulan terakhir, dan sisa (masuk − keluar) per bulan. Grafiknya dibuat dengan SVG sendiri, tanpa pustaka chart.
- **Streak:** jumlah hari berturut-turut (WIB) yang punya minimal satu transaksi yang **dicatat** pada hari itu (`created_at`, bukan tanggal transaksi, supaya mengisi tanggal mundur tidak dihitung). Streak tetap hidup selama kemarin masih tercatat; hari ini belum mencatat tidak langsung memutusnya.
- **Transaksi Beranda:** hanya hari ini dan kemarin. Kalau kosong, tampil ajakan mencatat dan tautan ke Riwayat.

### `budget` — tabel baru `budgets`
```sql
budgets (user_id uuid, category text, amount numeric(14,2) > 0, primary key (user_id, category))  -- RLS: milik sendiri
```
- Target berlaku sama setiap bulan. Belum ada target khusus per bulan.
- Kartu Budget di Beranda: per kategori yang punya target, ditampilkan aktual/target bulan ini, bar progres, dan sisa. Bar berwarna peringatan di atas 80% dan merah kalau lewat 100%.
- Diatur di Pengaturan → Budget: nominal per kategori, dan dikosongkan untuk menghapus target.

### `kantong` — memakai ulang tabel `user_accounts`
```sql
alter table user_accounts add column saldo_awal numeric(14,2) not null default 0,
                          add column saldo_per date not null default current_date;
alter table transactions  add column kantong_id uuid references user_accounts on delete set null,
                          add column kantong_tujuan_id uuid references user_accounts on delete set null;
```
- **Saldo kantong** = `saldo_awal` + masuk − keluar − pindah keluar + pindah masuk, untuk transaksi **setelah** `saldo_per`. Tanggal itu mencegah transaksi lama terhitung dua kali kalau saldo awal diisi dengan saldo hari ini.
- **Total aset** = jumlah saldo semua kantong.
- Form transaksi: field **Kantong** (pilihan) menggantikan **Metode bayar** yang berupa teks bebas. Untuk Pindah kantong ada dua field: **Dari** dan **Ke**.
- Teks dan struk yang dibaca AI ("kopi 25rb gopay"): `payment_method` hasil AI dicocokkan otomatis ke kantong bernama atau beralias sama, tanpa membedakan huruf besar-kecil. Untuk pindah kantong, `payment_target` dicocokkan ke kantong tujuan.
- Transaksi lama: dicocokkan dengan aturan yang sama saat migrasi (backfill sekali). Yang tidak cocok tetap tanpa kantong dan tidak ikut hitungan saldo.
- Diatur di Pengaturan → Kantong: tambah, ubah, atau hapus kantong, beserta nama, jenis, saldo awal, dan tanggal saldo.

## Testing

- Fungsi murni + skrip `assert`: tren bulanan, streak (batas tengah malam WIB dan putus/sambung), progres budget, saldo kantong (termasuk pindah kantong dan batas `saldo_per`), dan pencocokan metode bayar ke kantong.
- Migrasi diuji dengan `npm run db:status` sebelum `db:migrate`, dan bersifat idempoten.
- Cek visual di 375px: Beranda, Pengaturan, form dengan field kantong.

## Boundaries

- **Sudah disetujui lewat spec ini (setelah di-approve):** tabel `budgets`, kolom baru di `user_accounts` dan `transactions`, serta backfill kantong.
- **Tetap tanya dulu:** menghapus data apa pun, dan perubahan prompt AI di luar `payment_target`.
- **Jangan:** menghapus kolom `payment_method`. Kolom itu tetap disimpan sebagai teks asli.

## Keputusan (22 Okt 2026)

- Spec dan perubahan database **disetujui**. Migrasi ditulis dan diuji di sini, dan pemakai yang menjalankan `npm run db:migrate` ke produksi.
- **Metode bayar diganti Kantong** di form. Kolom `payment_method` tetap diisi teks asli di belakang layar.
- **Pindah kantong dari teks: AI mengisi asal dan tujuan.** Prompt ekstraksi ditambah satu field `payment_target` (kantong tujuan, hanya untuk transfer). Field lain dan alur fallback tidak berubah.
