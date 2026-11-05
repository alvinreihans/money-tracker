# Spec: Perbaikan semua temuan 2.9.0

Status: **disetujui** (K3 tawarkan catat selisih, K4/K5 longgar + peringatan, lainnya usulan) · 5 November 2026 · branch `fix/temuan-2.9.0` (satu PR bersama [SPEC-tagihan-cicilan](SPEC-tagihan-cicilan.md))

Semua butir yang tersisa di bagian **Temuan** CHANGELOG (dari sinkronisasi spec dan uji langsung di produksi, 1 Nov 2026), kecuali tiga yang sudah ditangani SPEC-tagihan-cicilan. Tiap butir: masalah singkat → perilaku yang diharapkan. Butir yang butuh keputusan ditandai **K** dan dirangkum di tabel Keputusan. Spec fitur yang terdampak diperbarui di commit yang sama dengan kodenya (kolom "Spec").

Satu PR untuk semua (hemat build Vercel); dikerjakan per kelompok, satu commit lokal per kelompok, di-push sekali di akhir.

## A. Riwayat & transaksi pecahan

| # | Masalah | Perilaku yang diharapkan | Spec |
|---|---|---|---|
| A1 | Filter yang hanya cocok dengan baris asli transaksi pecahan: kartu tampil total penuh, total hari hanya bagiannya. | Kartu menampilkan **bagian yang cocok saja**, sama seperti bagian lain: "Bagian dari Rp 15.000 · Rp 10.000". Bila beberapa bagian dari satu transaksi cocok, tetap satu kartu dengan jumlah bagian yang cocok. Total hari/bulan = jumlah kartu yang tampil. | riwayat-filter, metode-budget |
| A2 | "N transaksi", "N hasil", "Muat lagi · N" menghitung baris bagian; Beranda hanya 4 kartu. | Semua hitungan memakai **jumlah transaksi** (bagian dari transaksi yang sama dihitung satu). Beranda selalu menampilkan 5 transaksi terakhir. Halaman "Muat lagi" tidak pernah memisahkan bagian dari transaksi aslinya. | riwayat-filter, navigasi |
| A3 | Pecah & gabung = beberapa request terpisah; gagal di tengah → jumlah bagian ≠ total, saldo bergeser. | Simpan pecahan dan gabung masing-masing **satu RPC Postgres** (`simpan_pecahan`, `gabung_pecahan`): semua berhasil atau tidak ada yang berubah. Migrasi baru. | metode-budget |
| A4 | Kartu bagian pecahan yang dibuka di dua panel tidak ditandai terpilih. | Kartu yang detailnya terbuka selalu ber-`aria-current`, termasuk kartu bagian. | layar-lebar |
| A5 | Header "Hari ini" di Beranda hanya menjumlah 5 kartu yang tampil. | Total di header kelompok Beranda = **pengeluaran sebenarnya** hari/kelompok itu (dihitung server), sama dengan Riwayat. | navigasi |
| A6 | Riwayat dua panel sesak saat panel Tanya AI terbuka (900 & 1300 px). | Bila lebar yang tersisa untuk Riwayat < 840 px, Riwayat memakai **satu panel** (daftar; detail membuka halaman), seperti kartu Analitik yang turun ke satu kolom. | layar-lebar |

## B. Analitik, metode & Tanya AI

| # | Masalah | Perilaku yang diharapkan | Spec |
|---|---|---|---|
| B1 | Tautan merchant Analitik membuka `q=` (cari substring) → jumlah berbeda. | Tautan merchant memakai filter Riwayat baru **`merchant=`** (nama merchant persis, tanpa beda huruf/spasi; chip "Merchant: X" yang bisa dilepas). Jumlah & totalnya sama dengan Analitik. | riwayat-filter, analitik-insight |
| B2 | Analitik mengecualikan pembelian dari tujuan tabungan, Riwayat tidak → angka telusur berbeda. **K1** | Tautan telusur Analitik membawa **`tujuan=tanpa`**: Riwayat menyembunyikan pengeluaran yang dibayar dari tujuan tabungan, dengan chip "Tanpa dari tujuan tabungan" yang bisa dilepas. | riwayat-filter, analitik-tujuan |
| B3 | Proyeksi dibandingkan dengan budget per kategori walau metode persen aktif. | Metode aktif → pembandingnya **total jatah pengeluaran metode** (penghasilan − jatah tabungan/setoran). Tanpa metode → total budget per kategori seperti sekarang. Tanpa keduanya → proyeksi tanpa pembanding. | analitik-insight |
| B4 | Ambang "hampir habis": >80% di kartu budget, ≥80% di kartu metode. | Keduanya **≥ 80%**. | analitik, metode-budget |
| B5 | Bulan lampau memakai penghasilan bulan ini. **K2** | Penghasilan yang **diatur sendiri** tetap satu angka untuk semua bulan (tidak ada riwayatnya). Penghasilan **saran** dihitung untuk bulan yang dilihat: rerata 3 bulan penuh sebelum bulan itu, lalu pemasukan bulan itu, lalu 0. Berlaku di Analitik, Tanya AI, dan refleksi Kakeibo. | metode-budget, tujuan-tabungan |
| B6 | Zero-Based dengan penghasilan 0: kartu Analitik "Target melebihi penghasilan", pratinjau Profil menyembunyikannya. | Keduanya sama: penghasilan 0 → tidak ada baris "Belum dialokasikan"; kartu menulis "Atur penghasilan dulu" dengan tautan ke Budget. | metode-lanjutan |
| B7 | Status "hampir" di kartu metode hanya dibedakan warna; progressbar `aria-valuenow` 131 > `aria-valuemax` 100. | Teks status ikut berubah: "Hampir habis · sisa Rp X" (dengan ikon peringatan). `aria-valuenow` dibatasi 0–100, persen asli tetap di `aria-valuetext`. | metode-budget |
| B8 | Tanya AI: jawaban dari ringkasan bulan tanpa tautan "Buka Analitik". | Ringkasan yang dihitung di depan menambah tautan **"Buka Analitik [bulan]"**, seperti saat model memanggil `ringkasan_bulan`. | analitik-ai |
| B9 | Tanya AI menyebut "Dana darurat Rp 3.479.999" yang sebenarnya total dua tujuan. | Data tujuan di `saldo_kantong` diberi nama yang tidak ambigu (`total_semua_tujuan` terpisah dari daftar per tujuan), dan kasus eval baru: "berapa isi dana darurat?" menjawab saldo tujuan itu saja. | analitik-ai |

## C. Utang & Piutang, kantong, tujuan

| # | Masalah | Perilaku yang diharapkan | Spec |
|---|---|---|---|
| C1 | Kelebihan bayar kartu kredit hilang dari semua angka. **K3** | Nominal Bayar tagihan > tagihan di aplikasi → form menulis "Lebih Rp X dari tagihan di aplikasi. Biasanya ada bunga, iuran, atau belanja kartu yang belum dicatat." dengan dua tombol: **"Catat selisihnya sebagai biaya kartu"** (simpan pembayaran + pengeluaran kategori Biaya Rp X dari kartu itu bertanggal sama, keterangan "Selisih tagihan kartu"; tagihan jadi Rp 0) dan **"Simpan saja"**. Kartu bersaldo positif tampil **"Kelebihan bayar Rp X"** (bukan Rp 0), di bagian Utang tapi tidak menambah total Utang. | lend-borrow |
| C2 | Kantong orang & kartu kredit tidak bisa dihapus. **K4** | Lembar aksi orang/kartu punya **Hapus**. Konfirmasi menyebut dampaknya: "n transaksi dengan X tetap tercatat, tanpa kantong X." dan, bila saldonya ≠ 0, "Piutang/Utang/Tagihan Rp Y ikut hilang dari Utang & Piutang." Transaksinya tidak dihapus; saldo kantong lain tidak berubah (pindah kantong kehilangan sisi orang/kartunya, seperti menghapus kantong biasa). Rencana cicilan yang dibayar pakai kartu itu kehilangan kantong pembayar bawaannya. | lend-borrow |
| C3 | Nama kantong boleh kembar beda huruf. | Database menolak nama kembar tanpa beda huruf/spasi tepi (unique index `(user_id, lower(btrim(name)))`; sudah dicek: tidak ada data kembar di produksi). Form menolak dengan pesan biasa. | analitik (kantong) |
| C4 | Pesan nama kembar menyebut kantong orang yang tidak tampil di daftar Kantong. | Pesan menyebut di mana nama itu dipakai: "Nama ini sudah dipakai untuk Teman (contoh) di Utang & Piutang." | analitik (kantong) |
| C5 | Tujuan bersaldo bisa dihapus tanpa peringatan; saldonya lenyap dari Total aset. **K5** | Tujuan bisa dihapus kapan saja (juga yang punya riwayat). Konfirmasi menyebut dampaknya: "Rp X di tujuan ini ikut hilang dari Total aset. Kalau uangnya masih ada, pakai Pakai dulu untuk memindahkannya." dan, bila ada riwayat, "n transaksi tetap tercatat, tanpa tujuan ini." | tujuan-tabungan |
| C6 | Tujuan tabungan muncul sebagai sumber uang di Pinjamkan, Bayar tagihan, Bayar cicilan, dan "Dari kantong" Sisihkan (termasuk tujuan itu sendiri). | Sumber uang di form-form itu = kantong uang **tanpa tujuan tabungan** (uang tujuan dipakai lewat "Pakai" / "Dibayar dari tujuan"). Sisihkan tidak menawarkan tujuan itu sendiri. Total aset tetap menghitung tujuan. | lend-borrow, tujuan-tabungan |
| C7 | Tenggat tujuan baru boleh di masa lalu. | Ditolak: "Tenggatnya paling cepat hari ini." Mengubah tujuan lama yang tenggatnya sudah lewat tetap boleh. | tujuan-tabungan |
| C8 | Jatuh tempo pinjaman boleh sebelum tanggal pinjam. | Ditolak: "Jatuh tempo tidak boleh sebelum tanggal pinjam." Isian tanggal diberi `min`. | lend-borrow |
| C9 | Kartu kredit baru: saldo berlaku sejak 00.00. | Seperti kantong lain: tanggal hari ini → **jam sekarang**, tanggal lain → 00.00 (`saldo_sejak`). | lend-borrow, saldo-waktu |
| C10 | Kartu kredit tidak punya isian jatuh tempo; pengingat "Tagihan … besok" tidak pernah terkirim. **K6** | Form kartu (tambah & ubah) punya **"Jatuh tempo tiap tanggal"** (1–31, opsional), disimpan di kolom baru `jatuh_tempo_hari`. Pengingat H-1 dihitung dari tanggal itu tiap bulan (akhir bulan mundur ke hari terakhir), hanya bila ada tagihan. | lend-borrow, notifikasi |
| C11 | Profil: subjudul "Budget — Batas pengeluaran per kategori" walau metode persen aktif; "Disisihkan ke tuj…" terpotong di 900 px. | Subjudul mengikuti metode ("Metode 50/30/20", "Zero-Based", …). Baris tujuan di Kantong membungkus teks, tidak memotong. | navigasi |
| C12 | Ekspor CSV: kategori pindah kantong ditulis `other`. | Ditulis **"Pindah kantong"**. | (ekspor, di analitik) |

## D. Catat & AI

| # | Masalah | Perilaku yang diharapkan | Spec |
|---|---|---|---|
| D1 | "↩ Batalkan perubahan" masih aktif setelah transaksinya dibatalkan (406). | Tombol hilang begitu kartu transaksinya berstatus Dibatalkan; bila transaksinya sudah tidak ada, pesannya "Transaksinya sudah dihapus." (tanpa galat 406). | catat-chat |
| D2 | Label timer "Kembali ke Beranda dalam 8 detik" padahal lembar hanya ditutup. | "Menutup dalam 8 detik" (atau "Membuka catatan berikutnya dalam 8 detik" bila masih ada draft). | catat-chat |
| D3 | Tanggal hapus otomatis di daftar Belum selesai memakai tanggal lokal browser. | Dihitung dalam **WIB**, sama dengan cron. | catat-chat |
| D4 | Ingat kategori bisa belajar dari pembayaran cicilan. | Pembayaran cicilan (`cicilan_id` terisi) bukan sumber ingatan, sama dengan `cariSerupa`. | ingat-kategori |
| D5 | Hasil Groq yang tidak sah langsung jadi draft tanpa mencoba Gemini. **K7** | Hasil Groq tidak sah (mis. nominal 0) → coba **Gemini sekali**; hasil Gemini yang sah dipakai, kalau tidak tetap draft. | ai-kantong, catat-andal |
| D6 | Push draft menampilkan nama merchant, padahal batasan notifikasi harian melarangnya. **K8** | Push draft **tetap** menampilkan merchant (dikirim tepat setelah user mencatat sendiri, di perangkatnya sendiri); batasan "tanpa merchant" di SPEC-notifikasi ditulis khusus untuk pengingat harian. | notifikasi |

## E. Rapikan

| # | Masalah | Perilaku yang diharapkan | Spec |
|---|---|---|---|
| E1 | Script rollback enkripsi tidak cocok dengan skema sekarang. **K9** | Script **dihapus**; SPEC-enkripsi menulis bahwa pemulihan memakai backup Supabase (Point-in-Time/backup harian), bukan script balikan. | enkripsi |
| E2 | Komentar urutan pipeline usang (`upload-receipt/route.ts`, `receipt.ts`); `MenuLainnya` tidak dipakai. | Komentar mengikuti urutan sekarang (Gemini dulu); `MenuLainnya` dihapus. | — |

## Keputusan (5 Nov 2026)

K1, K2, K6, K7, K8, K9 memakai usulan.

| K | Butir | Usulan | Alternatif |
|---|---|---|---|
| K1 | B2 tautan Analitik vs tujuan | Filter `tujuan=tanpa` di Riwayat | Analitik ikut menghitung pembelian dari tujuan (membatalkan SPEC-analitik-tujuan) |
| K2 | B5 penghasilan bulan lampau | Saran dihitung per bulan; angka yang diatur sendiri tetap | Simpan riwayat penghasilan per bulan (migrasi + UI baru) |
| K3 | C1 kelebihan bayar | **Dipilih:** tawarkan catat selisih sebagai biaya kartu, atau simpan saja | Ditolak; boleh + peringatan saja |
| K4 | C2 hapus orang/kartu | **Dipilih:** boleh kapan saja, konfirmasi menyebut dampaknya | Hanya bila tanpa transaksi |
| K5 | C5 hapus tujuan bersaldo | **Dipilih:** boleh, konfirmasi menyebut jumlah yang hilang | Ditolak sampai saldo 0 |
| K6 | C10 jatuh tempo kartu | Tanggal tiap bulan (kolom baru) | Tanggal sekali (kolom `jatuh_tempo` yang ada; user memperbarui tiap bulan) |
| K7 | D5 Groq tidak sah | Coba Gemini sekali | Tetap langsung draft (hemat kuota Gemini) |
| K8 | D6 merchant di push draft | Tetap ditampilkan | Disembunyikan ("1 catatan belum selesai") |
| K9 | E1 rollback enkripsi | Hapus script, pakai backup | Perbarui script (tidak bisa diuji tanpa database cadangan) |

## Migrasi

Satu migrasi `20261110000000_perbaikan_temuan.sql`:
- RPC `simpan_pecahan`, `gabung_pecahan` (A3), `security invoker`, memeriksa milik user;
- unique index `user_accounts (user_id, lower(btrim(name)))` (C3);
- kolom `user_accounts.jatuh_tempo_hari int check (1–31)`, hanya untuk `kredit` (C10), dan `data_notifikasi()` ikut mengembalikannya.

## Pengujian

- **Unit**: tiap fungsi murni yang berubah mendapat kasus baru (`uji:riwayat` A1/A2, `uji:metode` B3–B7, `uji:pinjaman` C1/C6/C10, `uji:notifikasi` C10, `uji:ingat` D4, `uji:validasi` C7/C8, `uji:ekspor` C12, `uji:tanya` B8/B9, `uji:draft` D3).
- **E2E**: suite yang ada tetap lulus; suite baru `perbaikan-temuan` untuk A1–A3, B1/B2, C1, C2, C5, C6.
- **Eval** (`eval:tanya`, AI sungguhan): kasus B9.
- Sebelum PR: `npm run e2e` (semua suite), `tsc`, `eslint`, semua `uji:*`.

## Boundaries

- Tidak mengubah data lama selain yang perlu untuk migrasi di atas.
- Butir yang ternyata butuh perubahan lebih besar dari yang tertulis di sini dibahas dulu, tidak dikerjakan diam-diam.

## Belum diterapkan

Seluruh spec ini (sedang dikerjakan).
