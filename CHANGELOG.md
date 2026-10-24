# Changelog

Semua perubahan yang terasa oleh pemakai dicatat di sini. Formatnya mengikuti
[Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan penomoran
versinya mengikuti [Semantic Versioning](https://semver.org/lang/id/):
**mayor** naik kalau ada fitur yang dihapus atau berubah tidak kompatibel,
**minor** untuk fitur baru, **patch** untuk perbaikan.

Versi yang tampil di aplikasi (halaman Profil dan halaman masuk) dibaca dari
`version` di `package.json`. Saat merilis, naikkan angka itu dan tambahkan
bagiannya di sini.

## Rencana

Belum dikerjakan; dicatat supaya tidak lupa.

- **Caching data di server** (lanjutan), kalau setelah diukur di produksi
  halaman masih terasa lambat atau kuota Supabase/Vercel menipis: mis. data
  yang jarang berubah (kategori, kantong) disimpan sementara di server.

## [Unreleased]

## [2.1.0] — 2026-10-24

### Ditambahkan
- **Tanya AI** di Analitik: tanya soal keuanganmu dengan bahasa sehari-hari ("Kenapa bulan ini boros?", "Total kopi bulan ini?", "Utangku ke siapa aja?"). Angkanya diambil langsung dari catatanmu (AI tidak menghitung sendiri, dan nominal di jawaban diperiksa), dengan tombol untuk membuka Riwayat/Analitik yang sesuai. Obrolan tidak disimpan.
- **Analitik per bulan**: pilih bulan (‹ Oktober 2026 ›), ringkasan dibanding bulan lalu, **sorotan** (proyeksi akhir bulan, hari paling boros, paling sering, kategori yang paling naik), pengeluaran per kategori bulan itu (bukan lagi rata-rata 3 bulan), dan **merchant teratas**. Hampir semua baris bisa diketuk untuk membuka Riwayat yang sudah tersaring.
- **Filter Riwayat**: chip **Tanggal** (Hari ini, 7 hari, Bulan ini, Bulan lalu, atau pilih rentang), **Kantong** (asal atau tujuan), dan **Kategori**, bisa digabung dan tersimpan di alamat halaman. Riwayat kini dikelompokkan **per bulan** dengan total keluar & masuk untuk seluruh hasil filter; jumlah dan totalnya juga tampil di bawah judul.
- **Navigasi 5 tab**: Beranda · Riwayat · + · Analitik · Profil.
  - **Analitik** berisi ringkasan bulan, tren, komposisi kategori, budget, dan streak (dulu di Beranda).
  - **Profil** (dulu Pengaturan dari menu ⋮) ada di `/profil`, dengan kartu akun di atasnya.
  - Beranda kini fokus ke 5 transaksi terakhir & yang perlu perhatian, termasuk kartu **Budget hampir habis**.
  - Judul besar Beranda bisa diketuk untuk membuka Analitik.
- **Pintasan aplikasi**: tekan lama ikon aplikasi untuk langsung ke Catat, Riwayat, atau Analitik.
- Ekspor CSV memberi umpan balik: "Menyiapkan file…", lalu snackbar dengan tombol Bagikan.
- Cashback & biaya admin selalu tepat di bawah transaksi induknya.
- **Deteksi duplikat**: transaksi dari foto/teks yang sama persis dengan yang sudah tercatat (nominal, jenis, tanggal, jam, kantong) ditanya dulu "Catat lagi?". Pilih **Ya, catat lagi** atau **Bukan, buang**.
- **Struk dibaca Gemini Flash-Lite** dari gambar yang dikompres (1080px). Lebih tepat (diskon, paylater, nominal besar di atas) dan lebih cepat; OCR + Groq tetap jadi cadangan. Foto kamera dikecilkan sebelum diunggah.
- **Catat sebagai obrolan.** Kalau AI kurang yakin, ia langsung bertanya di
  lembar Catat — kantong lewat pilihan, nominal lewat kolom ketik, atau minta
  diceritakan — lalu transaksinya tersimpan. Lembar Catat membesar sendiri
  saat ada pertanyaan atau foto, dan bisa ditarik kecil/besar.
- **Belum selesai**: catatan yang belum dijawab menunggu di sini (titik
  oranye di tombol +, kartu di Beranda), lengkap dengan foto struknya supaya
  ingat itu transaksi apa. Diingatkan lewat notifikasi sehari dan seminggu
  kemudian; lewat 30 hari dihapus otomatis. Begitu dilengkapi, foto dan
  obrolannya ikut dihapus.
- **Koreksi dengan mengetik** setelah transaksi tersimpan: "eh yang tadi
  pakai BCA", "nominalnya 25rb" — yang berubah diperlihatkan dan bisa
  dibatalkan.
- Foto bisa diberi **keterangan** (mis. "pakai BCA") sebelum dikirim.
- **Bagikan** dari aplikasi lain tetap diproses walau aplikasinya langsung
  ditutup dan HP dikunci; struk yang belum lengkap dikabari lewat notifikasi.
- **Saldo per jam.** Saldo kantong berlaku sejak jam diisi, bukan sejak awal
  hari: transaksi tadi pagi tidak lagi memotong saldo yang diisi siang ini.
  Transaksi punya kolom **Jam** (terisi otomatis; AI membacanya dari struk
  atau "tadi jam 10"). Kalau jamnya belum jelas dan berpengaruh ke saldo,
  ditanya "Tadi itu jam berapa?". Jam tampil di detail dan ikut di ekspor CSV.
- Di obrolan Catat, ketik **"hapus aja"** / **"ga jadi"** untuk membuang
  catatannya, dan jawaban bebas (mis. "nominalnya 40rb" saat ditanya kantong)
  dibaca ulang oleh AI.
- **Paylater = cicilan.** Belanja pakai SPayLater, GoPayLater, Kredivo, dll.
  langsung jadi rencana cicilan (bukan pengeluaran, saldo tidak berubah).
  Kalau berapa kali cicilannya tidak tertera, ditanya "Dicicil berapa kali?".
- **Bayar beberapa cicilan sekaligus**: 1, 2, atau semua sisa (seperti di
  aplikasi paylater); tiap cicilan tercatat sebagai pengeluaran sendiri.

### Diubah
- Satu foto = satu transaksi: kamera sekali jepret, galeri satu gambar.
  Selesai dilengkapi, lembar menutup sendiri setelah hitung mundur (bisa
  langsung "Selesai" atau "Ubah").
- Riwayat dan Beranda hanya menampilkan transaksi yang sudah lengkap.

### Dihapus
- Menu ⋮ di Beranda & Riwayat (isinya pindah ke tab Profil).
- Tab "Perlu dibenerin" di Riwayat (diganti "Belum selesai" di lembar Catat).

### Diperbaiki
- Biaya admin/cashback ikut terhapus saat jenis transaksinya berubah (dulu tertinggal dan memotong saldo).
- Transaksi yang dicatat sebelum jam 07.00 tidak lagi bertanggal kemarin
  (AI dulu memakai tanggal UTC).

## [2.0.0] — 2026-10-22

Lend & Borrow, notifikasi, kantong & budget, dan data transaksi yang
tersimpan terenkripsi. Mayor karena pendaftaran akun sendiri dihapus.

### Keamanan
- Hak akses database diperketat: tidak ada lagi hak TRUNCATE/TRIGGER untuk
  pengguna aplikasi, catatan migrasi tertutup, dan fungsi database hanya bisa
  dipanggil oleh yang memang memakainya.
- Sisa data fitur Telegram (nomor HP, chat_id) dihapus.
- Merchant, keterangan, dan teks asli struk/ketikan disimpan terenkripsi
  (AES-256) di database; kuncinya di Supabase Vault. Backup database yang
  bocor tidak memperlihatkan isinya. Tampilan dan pencarian tetap sama.
- Header keamanan: halaman tidak bisa dibingkai situs lain, skrip hanya dari
  aplikasi sendiri, kamera hanya untuk aplikasi ini.

### Ditambahkan
- **Ekspor data** (Pengaturan → Ekspor data): semua transaksi diunduh sebagai
  file CSV untuk cadangan atau diolah di spreadsheet.
- **Notifikasi** (Pengaturan → Pengingat harian), tiap jam 19.00: cicilan dan
  Lend & Borrow yang jatuh tempo 3 hari lagi atau besok (dan cicilan yang
  kemarin terlewat), serta pengingat kalau hari ini belum mencatat apa pun.
  Di iPhone hanya jalan kalau aplikasi dipasang ke Home Screen.
- **Lend & Borrow** (dari Pengaturan atau kartu di Beranda): catat uang yang
  dipinjamkan ke dan dipinjam dari orang lain, bayar sebagian atau lunas,
  dengan jatuh tempo opsional. Tidak dihitung sebagai pemasukan atau
  pengeluaran, dan tidak mengubah Total aset.
- **Kartu kredit:** belanja dicatat seperti biasa dengan kartunya; tagihan
  terlihat di Lend & Borrow dan dibayar dari sana.
- **Cicilan paylater & kartu kredit:** rencana cicilan dengan jadwal per
  bulan; tiap cicilan yang dibayar masuk sebagai pengeluaran bulan itu.
- AI mengenali pinjaman ("minjemin budi 200rb dari bca", "budi balikin 100rb
  ke bca"), tagihan kartu kredit, dan pembayaran cicilan
  ("bayar cicilan spaylater 150rb").
- **Bagikan ke Money Tracker** dari aplikasi lain di Android (setelah
  aplikasi dipasang): screenshot bukti bayar langsung dibaca seperti foto
  struk, dan teks (mis. notifikasi bank) mengisi kolom Catat untuk dicek dulu.
- **Kenalan untuk pengguna baru:** empat langkah singkat setelah masuk —
  cara mencatat, pilih rekening & e-wallet yang dipakai, isi saldonya, lalu
  siap. Bisa dilewati kapan saja.
- **Terasa lebih cepat:** tampilan sementara saat pindah halaman, halaman
  yang baru dibuka tampil seketika saat dibuka lagi (30 detik), dan
  pengecekan sesi tanpa bolak-balik ke server login.
- **Animasi transisi** sesuai panduan One UI: dialog naik dari bawah, halaman
  penuh bergeser, isi halaman muncul halus. Mengikuti setelan "kurangi
  gerakan" di HP.
- Isian nominal memakai **pemisah ribuan** saat diketik (1.500.000).
- Riwayat bisa **memuat transaksi lama** ("Muat lagi") dan menampilkan jumlah
  transaksi yang sebenarnya.
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
- Saldo kantong dihitung di database: Beranda, Lend & Borrow, dan Kantong
  tidak lagi mengunduh seluruh riwayat transaksi setiap dibuka.
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

### Dihapus
- Pendaftaran akun sendiri: halaman masuk tidak lagi punya pilihan "Daftar";
  akun baru dibuat lewat undangan.

### Diperbaiki
- Membuka halaman masuk saat sudah masuk kini langsung ke Beranda. Sebaliknya,
  membuka halaman aplikasi saat belum masuk meminta masuk dulu, lalu kembali
  ke halaman yang tadi dibuka (mis. Riwayat dengan filternya).
- Tautan email (konfirmasi, reset password) tidak bisa lagi dipakai untuk
  mengalihkan ke situs lain.
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

[Unreleased]: https://github.com/alvinreihans/money-tracker/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/alvinreihans/money-tracker/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/alvinreihans/money-tracker/compare/v0.1.2...v1.0.0
[0.1.2]: https://github.com/alvinreihans/money-tracker/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/alvinreihans/money-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/alvinreihans/money-tracker/releases/tag/v0.1.0
