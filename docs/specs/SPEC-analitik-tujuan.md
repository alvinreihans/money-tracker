# Spec: Pembelian dari tujuan tabungan dipisah di Analitik

Status: **diterapkan** · rilis 2.8.0 · disetujui 28 Oktober 2026 · branch `feat/analitik-tujuan` · disinkronkan dengan kode 1 Nov 2026

## Masalah

HP Rp 10 jt yang dibayar dari tujuan tabungan "Tabungan HP" (SPEC-tujuan-tabungan) masih dihitung sebagai pengeluaran bulan ini di Analitik, Beranda, dan Tanya AI:
- "Kalau begini terus, bulan ini keluar ± …" melonjak;
- "Paling boros" jatuh ke hari beli HP;
- "Belanja naik Rp 10 jt";
- "Keluar ↑ naik 240% dari September".

Padahal uangnya ditabung berbulan-bulan, bukan dari penghasilan bulan ini. Metode budgeting sudah memisahkannya ("Dibayar dari tujuan: Tabungan HP"); bagian lain belum.

## Keputusan user (28 Okt 2026)

**Dipisah sepenuhnya.** Pengeluaran dari kantong tujuan tabungan tidak dihitung di angka bulanan mana pun, dan ditampilkan di baris sendiri. Aturannya sama dengan metode budgeting.

## Rancangan

**Yang dipisah:** pengeluaran (`type = 'expense'`) yang `kantong_id`-nya kantong berjenis `tujuan`. Ini termasuk yang dipindah lewat "Dibayar dari tujuan tabungan". Setoran ke tujuan sudah berupa pindah kantong, jadi memang tidak pernah dihitung. Pemasukan ke kantong tujuan tidak dipisah.

| Tempat | Sesudah |
|---|---|
| **Analitik:** Keluar, Selisih, perubahan dari bulan lalu | tanpa pembelian dari tujuan, di bulan ini maupun bulan lalu |
| **Analitik:** Sorotan (proyeksi, paling boros, paling sering, kategori naik), Kategori, Merchant teratas, Tren 6 bulan | tanpa pembelian dari tujuan |
| **Analitik:** Budget per kategori (dan total budget di sorotan proyeksi) | tanpa pembelian dari tujuan (metode budgeting sudah begitu) |
| **Analitik:** baris baru di Ringkasan, di bawah Keluar | **"Dari tujuan tabungan · Rp 10,3 jt"**: satu baris untuk semua tujuan bulan itu, total digabung, keterangan nama tujuannya dipisah koma ("HP baru"). Mengetuknya membuka Riwayat: pengeluaran bulan itu dari kantong-kantong tujuan tersebut. Hanya muncul kalau ada. |
| **Beranda:** pengeluaran bulan ini & perubahan dari bulan lalu; budget per kategori | tanpa pembelian dari tujuan. Tidak ada baris tambahan; rinciannya di Analitik. |
| **Tanya AI** (ringkasan bulan) | semua angka di atas (termasuk `pengeluaran_terbesar` dan `budget`) tanpa pembelian dari tujuan, ditambah isian `dibayar_dari_tujuan_tabungan`: per tujuan `tujuan` (nama), `total`, dan `transaksi` (tanggal, merchant, nominal, kategori, keterangan). Supaya "kenapa tabunganku berkurang?" dan "HP-ku berapa?" tetap bisa dijawab. Prompt: jangan menyebutnya pemborosan; saat menjawab total/kenapa boros, sebut terpisah sebagai dibayar dari tabungan. |
| **Riwayat** | tidak berubah: tetap menampilkan semua transaksi, termasuk HP. |

**Kode:** satu fungsi murni di `src/lib/analitik.ts`, `pisahTujuan(baris, tujuan)`. Ia mengembalikan `{ biasa, dariTujuan: { id, nama, total }[] }`, lalu dipakai halaman Analitik, Beranda, dan `tanya-server`. Daftar kantong tujuan diambil `ambilPengaturanMetode` (`pengaturan.tujuan`). `tanya-server` menyusun `dibayar_dari_tujuan_tabungan` sendiri (dengan daftar transaksinya). `hitungMetode` tetap menerima semua baris, karena ia sendiri yang memisahkan dan menampilkan "Dibayar dari tujuan".

## Pengujian

- **`uji:analitik`:** `pisahTujuan` memisahkan pengeluaran dari kantong tujuan, membiarkan pemasukan & pengeluaran kantong lain (termasuk tanpa kantong), dan menjumlah per tujuan; tanpa tujuan, semua baris tetap.
- **`eval:tanya`:** kasus "kenapa bulan ini boros?" dengan data HP Laku6 Rp 10,3 jt dibayar dari tujuan. Jawabannya harus menyebut 10.300.000 dan HP sebagai dibayar dari tabungan, bukan pemborosan.
- **E2E (suite `tujuan`):**
  - pembelian dari tujuan tidak mengubah Keluar di Analitik & Beranda, dan tidak memunculkan "Budget hampir habis";
  - baris "Dari tujuan tabungan" muncul dan membuka Riwayat yang benar.
- **Regresi:** semua `uji:*`, semua E2E, typecheck, `next build`.

## Boundaries

- **Jangan:** mengubah cara metode budgeting menghitung; mengubah Riwayat; migrasi database (tidak perlu).
- **Tanya dulu:** memisahkan pengeluaran besar lain yang **bukan** dari tujuan (mis. sekali-sekali beli laptop dari saldo biasa). Itu keputusan lain.
