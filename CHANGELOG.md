# Changelog

Semua perubahan yang terasa oleh pemakai dicatat di sini. Formatnya mengikuti
[Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan penomoran
versinya mengikuti [Semantic Versioning](https://semver.org/lang/id/):
**mayor** naik kalau ada fitur yang dihapus atau berubah tidak kompatibel,
**minor** untuk fitur baru, **patch** untuk perbaikan.

Versi yang tampil di aplikasi (menu ⋮ di Beranda dan halaman masuk) dibaca dari
`version` di `package.json`. Saat merilis, naikkan angka itu dan tambahkan
bagiannya di sini.

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

[1.0.0]: https://github.com/alvinreihans/money-tracker/compare/v0.1.2...v1.0.0
[0.1.2]: https://github.com/alvinreihans/money-tracker/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/alvinreihans/money-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/alvinreihans/money-tracker/releases/tag/v0.1.0
