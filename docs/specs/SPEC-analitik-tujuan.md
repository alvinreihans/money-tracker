# Spec: Pembelian dari tujuan tabungan dipisah di Analitik

Status: **disetujui & dikerjakan** · 28 Oktober 2026 · branch `feat/analitik-tujuan`

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

**Yang dipisah:** pengeluaran (`type = 'expense'`) yang `kantong_id`-nya kantong berjenis `tujuan`. Ini termasuk yang dipindah lewat "Dibayar dari tujuan tabungan". Setoran ke tujuan sudah berupa pindah kantong, jadi memang tidak pernah dihitung.

| Tempat | Sesudah |
|---|---|
| **Analitik:** Keluar, Selisih, perubahan dari bulan lalu | tanpa pembelian dari tujuan, di bulan ini maupun bulan lalu |
| **Analitik:** Sorotan (proyeksi, paling boros, paling sering, kategori naik), Kategori, Merchant teratas, Tren 6 bulan | tanpa pembelian dari tujuan |
| **Analitik:** Budget per kategori | tanpa pembelian dari tujuan (metode budgeting sudah begitu) |
| **Analitik:** baris baru di Ringkasan | **"Dari tujuan tabungan · Rp 10 jt"**, keterangan nama tujuannya ("Tabungan HP"). Mengetuknya membuka Riwayat: pengeluaran bulan itu dari kantong tujuan tersebut. Hanya muncul kalau ada. |
| **Beranda:** pengeluaran bulan ini & perubahan dari bulan lalu; budget per kategori | tanpa pembelian dari tujuan. Tidak ada baris tambahan; rinciannya di Analitik. |
| **Tanya AI** (data bulan) | semua angka di atas tanpa pembelian dari tujuan, ditambah isian `dibayar_dari_tujuan` (per tujuan: nama, total, transaksinya), supaya "kenapa tabunganku berkurang?" dan "HP-ku berapa?" tetap bisa dijawab. |
| **Riwayat** | tidak berubah: tetap menampilkan semua transaksi, termasuk HP. |

**Kode:** satu fungsi murni di `src/lib/analitik.ts`, `pisahTujuan(baris, tujuan)`. Ia mengembalikan baris biasa dan ringkasan per tujuan, lalu dipakai halaman Analitik, Beranda, dan `tanya-server`. Daftar kantong tujuan sudah diambil `ambilPengaturanMetode`. `hitungMetode` tetap menerima semua baris, karena ia sendiri yang memisahkan dan menampilkan "Dibayar dari tujuan".

## Pengujian

- **`uji:analitik`:** `pisahTujuan` memisahkan pengeluaran dari kantong tujuan, membiarkan pemasukan & pengeluaran kantong lain, dan menjumlah per tujuan.
- **`eval:tanya`:** satu kasus baru, "kenapa pengeluaranku bulan ini besar?" dengan data pembelian HP dari tujuan. Jawabannya tidak boleh menyebut HP sebagai pemborosan.
- **E2E (suite `tujuan`):**
  - pembelian dari tujuan tidak mengubah Keluar di Analitik & Beranda;
  - baris "Dari tujuan tabungan" muncul dan membuka Riwayat yang benar.
- **Regresi:** semua `uji:*`, semua E2E, typecheck, `next build`.

## Boundaries

- **Jangan:** mengubah cara metode budgeting menghitung; mengubah Riwayat; migrasi database (tidak perlu).
- **Tanya dulu:** memisahkan pengeluaran besar lain yang **bukan** dari tujuan (mis. sekali-sekali beli laptop dari saldo biasa). Itu keputusan lain.
