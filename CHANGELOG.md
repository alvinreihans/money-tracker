# Changelog

Semua perubahan yang terasa oleh pemakai dicatat di sini. Formatnya mengikuti
[Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan penomoran
versinya mengikuti [Semantic Versioning](https://semver.org/lang/id/):
**mayor** naik kalau ada fitur yang dihapus atau berubah tidak kompatibel,
**minor** untuk fitur baru, **patch** untuk perbaikan.

Versi yang tampil di aplikasi (menu ⋮ di Beranda dan halaman masuk) dibaca dari
`version` di `package.json`. Saat merilis, naikkan angka itu dan tambahkan
bagiannya di sini.

## Rencana

Belum dikerjakan; dicatat supaya tidak lupa.

- **Caching data & halaman terasa ringan**, supaya Beranda dan Riwayat tidak
  menunggu database setiap dibuka. Termasuk tampilan sementara (skeleton)
  saat pindah halaman, supaya ketukan langsung terasa ditanggapi.
- **Animasi transisi** sesuai panduan One UI (kurva `0.22, 0.25, 0, 1`,
  100–500 ms): dialog & sheet naik dari bawah, pindah halaman dengan gerak
  halus, tetap menghormati "kurangi gerakan".
- **Kaji pengamanan data user.** Catatan: SHA-256 adalah *hash* (satu arah),
  bukan enkripsi — nominal yang di-hash tidak bisa dijumlah atau ditampilkan
  lagi. Pilihan yang perlu ditimbang:
  - yang sudah ada: enkripsi disk bawaan Supabase + RLS (data hanya bisa
    dibaca pemiliknya lewat aplikasi);
  - enkripsi kolom di database (Supabase Vault/pgsodium) untuk data sensitif
    seperti merchant & keterangan — melindungi dari bocornya dump database;
  - enkripsi di perangkat (end-to-end) — paling aman, tapi ringkasan, budget,
    saldo, dan AI tidak bisa lagi dihitung di server.
- **Onboarding pengguna baru**: kenalan singkat cara mencatat, lalu pasang
  kantong & saldo awal.
- **Terima "Bagikan" dari aplikasi lain di Android** (Web Share Target), mis.
  membagikan bukti bayar dari aplikasi bank/e-wallet langsung ke Money Tracker.
  Referensi:
  - [MDN: Share data between apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Share_data_between_apps)
  - [Share data natively from mobile to PWA app](https://dev.to/sefatanam/share-data-natively-from-mobile-to-pwa-app-4o7c)
- **Pinjam-meminjam & cicilan paylater**: catat uang yang dipinjamkan /
  dipinjam dan cicilan berjalan.
- **Push notifikasi**.

## [Unreleased]

### Ditambahkan
- **Analitik di Beranda:** tren pemasukan & pengeluaran 6 bulan, streak hari
  mencatat, dan transaksi hari ini & kemarin.
- **Kantong** (Pengaturan → Kantong): rekening, e-wallet, dan tunai beserta
  saldo awalnya. Saldo tiap kantong dan **Total aset** tampil di Beranda.
- **Budget** per kategori (Pengaturan → Budget), dengan kartu di Beranda yang
  menguning di atas 80% dan memerah kalau lewat.
- **Kategori sendiri** (Pengaturan → Kategori): tambah, ubah, dan hapus
  kategori, lengkap dengan ikon dan warna. Kategori bawaan boleh dihapus
  kecuali "Lainnya"; transaksinya pindah ke "Lainnya". AI memilih dari
  kategori milikmu.
- **Form sesuai jenis:** pemasukan punya kategori sendiri (Gaji, Bonus/THR,
  Usaha/Jualan, …) dan isian "Dari siapa"; pengeluaran bisa dicatat dengan
  **cashback**; pindah kantong bisa dicatat dengan **biaya admin**.
- Halaman **Pengaturan** dari menu ⋮.
- **Cari** di Riwayat, dan tombol **kembali ke atas** yang muncul sebentar
  saat menggulir.
- Halaman 404 sendiri.
- Bisa **dipasang sebagai aplikasi** (Install app) dengan ikon dan warna gelap.

### Diubah
- Kantong ditandai **emoji** pilihan sendiri, bukan jenis Bank/E-wallet.
  Setiap akun punya kantong **Tunai** bawaan yang tidak bisa dihapus.
- Konfirmasi hapus (transaksi, kantong, kategori) berupa dialog di bawah
  layar: pertanyaan, lalu "Batal | Hapus".
- Tiap transaksi wajib punya kantong. Teks atau struk yang kantongnya tidak
  cocok (mis. kantongnya sudah dihapus) masuk ke **Perlu dibenerin**, dengan
  alasan yang jelas.
- Pilihan kategori dan kantong berupa daftar dari bawah layar, bukan dropdown.
- AI lebih paham pemasukan ("dikasih duit ibu 500k ke bri" kini tercatat
  sebagai pemasukan ke BRI) dan memakai nama bank yang disebut, bukan
  "Transfer".
- Tab "Perlu dibenerin" diberi keterangan singkat.

### Diperbaiki
- Setelah menghapus transaksi, dan saat menekan tombol kembali, aplikasi
  kembali ke halaman asal (Beranda, atau Riwayat lengkap dengan filternya),
  bukan selalu ke Beranda/Riwayat.
- Bilah navigasi Android tidak lagi putih di aplikasi yang terpasang.
- Tidak ada lagi ruang kosong di bawah daftar transaksi.

## [1.0.0] — 2026-10-21

Tampilan baru mengikuti [One UI](https://developer.samsung.com/one-ui) dari
Samsung, dan semua cara mencatat kini ada di aplikasi.

### Ditambahkan
- **Catat dengan mengetik.** Tombol **+** langsung membuka kolom ketik yang
  siap diisi, misalnya "beli makan di warteg 20k shopeepay". Nominal, tempat,
  dan cara bayarnya dibaca otomatis. Kalau tidak terbaca, transaksi disimpan
  sebagai draft beserta teks aslinya.
- **Catat manual** lewat form, termasuk untuk pemasukan dan pindah kantong.
- **Saran transaksi terakhir** di atas kolom ketik. Satu ketukan mengisi
  kolomnya, cocok untuk pembelian yang berulang.
- Riwayat dikelompokkan per hari ("Hari ini", "Kemarin"), lengkap dengan total
  pengeluaran harian.
- Ikon kategori berwarna, dengan warna yang sama di daftar, porsi kategori,
  dan halaman detail.
- Logo baru: dompet dan koin di atas kotak biru.
- Nomor versi tampil di aplikasi.

### Diubah
- Seluruh tampilan dirombak: judul besar di bagian atas, semua tombol di bagian
  bawah dalam jangkauan jempol, navigasi bawah, form dan konfirmasi berupa
  dialog dari bawah layar, serta kabar sukses berupa snackbar.
- Foto struk langsung diproses begitu diambil. Dialognya boleh ditutup, karena
  prosesnya tetap jalan dan statusnya tampil di snackbar.
- Grafik pengeluaran diganti bar porsi per kategori yang terbaca utuh di HP.
- Tombol Keluar pindah ke menu ⋮ di Beranda.

### Dihapus
- **Impor rekening koran (PDF)** beserta halaman **Rekening**. Transaksi lama
  hasil impor tetap tersimpan dan tampil.
- **Bot Telegram.** Mencatat lewat teks dan foto kini ada di aplikasi.
- Kolom nomor HP saat mendaftar, karena hanya dipakai untuk bot Telegram.

### Diperbaiki
- "Hari ini" dan batas bulan kini dihitung dalam WIB. Sebelumnya, dari pukul
  00.00 sampai 07.00 WIB aplikasi mengira masih kemarin, dan transaksi dini hari
  tanggal 1 masuk ke bulan sebelumnya.

## [0.1.2] — 2026-10-21

### Diperbaiki
- Tautan reset password kini bisa dibuka di perangkat atau browser lain,
  misalnya minta di laptop lalu buka di HP. Sebelumnya selalu dianggap
  kedaluwarsa.
- Daftar dengan nomor HP yang sudah dipakai akun lain kini memberi pesan yang
  jelas, bukan "server lagi ngadat".

## [0.1.1] — 2026-09-20

### Diubah
- Pesan tunggu saat membaca struk berganti tiap 25 detik dan terus berulang,
  supaya jelas prosesnya masih jalan.

### Diperbaiki
- Membaca struk (OCR) di server produksi yang sebelumnya gagal atau menggantung
  tanpa pesan.
- Bot Telegram: struk yang gagal dibaca kini menyertakan alasannya, dan foto
  dari Telegram terbaca dengan benar.

## [0.1.0] — 2026-09-19

Rilis pertama.

### Ditambahkan
- Foto struk atau screenshot bukti bayar, lalu isinya dibaca otomatis (OCR dan
  AI, dengan Gemini sebagai cadangan). Struk yang gagal dibaca tetap disimpan
  sebagai draft.
- Impor rekening koran PDF, dengan pengenalan transfer antar kantong sendiri
  dan pencegahan transaksi dobel.
- Bot Telegram untuk mencatat lewat foto atau teks.
- Beranda dengan ringkasan bulan berjalan, riwayat dengan filter, dan grafik
  rata-rata pengeluaran per kategori.
- Edit dan hapus transaksi, termasuk membetulkan draft.
- Akun: daftar, masuk, dan lupa password, dengan syarat password yang kuat.

[Unreleased]: https://github.com/alvinreihans/money-tracker/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/alvinreihans/money-tracker/compare/v0.1.2...v1.0.0
[0.1.2]: https://github.com/alvinreihans/money-tracker/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/alvinreihans/money-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/alvinreihans/money-tracker/releases/tag/v0.1.0
