# UAT: Perbaikan temuan 2.9.0

Uji penerimaan (User Acceptance Test) untuk PR `fix/temuan-2.9.0` (SPEC-tagihan-cicilan, SPEC-perbaikan-temuan). Tiap skenario adalah **perjalanan pengguna yang utuh**, bukan uji satu fungsi: dijalankan lewat tampilan aplikasi seperti pengguna sungguhan (mengetik di Catat, mengetuk tombol, membaca layar), di akun baru yang bersih.

- **Pengguna:** karyawan yang mencatat keuangan dari HP; sesekali membuka di laptop.
- **Data awal tiap skenario:** akun baru dengan kantong Tunai (bawaan), SeaBank (bank, Rp 5.000.000), ShopeePay (e-wallet, Rp 500.000). Data lain disebut di skenarionya.
- **Lebar layar:** HP 390 px, kecuali disebut lain.
- **Lulus** bila semua "Diharapkan" terpenuhi dan tidak ada galat di layar maupun di console.

## UAT-01 · Mencatat hari biasa (HP)
1. Catat lewat ketikan: `kopi 25rb pakai shopeepay`, `makan siang 40rb seabank`, `topup shopeepay 100rb dari seabank`.
2. Buka Beranda.
3. Buka Riwayat.

**Diharapkan:** ketiganya tersimpan tanpa pertanyaan tambahan (atau pertanyaan yang dijawab wajar). Beranda menampilkan transaksi terbaru dengan total "Hari ini" = Rp 65.000 (pindah kantong tidak dihitung). Saldo ShopeePay Rp 575.000, SeaBank Rp 4.860.000. Riwayat menulis "3 transaksi".

## UAT-02 · Belanja paylater sampai lunas (HP)
1. Ketik `beli sepatu 300rb pakai spaylater 3x`.
2. Ketik `bayar cicilan spaylater 100rb pakai seabank`.
3. Ketik `bayar cicilan spaylater 100rb` dan tutup lembarnya tanpa menjawab.
4. Ketik `bayar cicilan spaylater 100rb pakai seabank` (jawab "Ya, catat lagi" bila ditanya duplikat).
5. Buka draft dari "Belum selesai", pilih SeaBank.
6. Buka Utang & Piutang.

**Diharapkan:** rencana cicilan bernama **"Sepatu"**, 3× Rp 100.000; langkah 2 = Cicilan 1/3; langkah 4 = **Cicilan 2/3**; langkah 5 = **Cicilan 3/3**; rencana pindah ke "Cicilan lunas". Setelah langkah 3, Utang & Piutang menulis 1/3 (draft tidak dihitung); setelah langkah 4, 2/3 — tidak pernah Lunas sebelum langkah 5.

## UAT-03 · Kartu kredit baru dari Catat sampai dihapus (HP)
1. Ketik `bayar tagihan cc Mandiri 200rb pakai seabank`.
2. Pilih **+ Tambah Kartu kredit Mandiri**.
3. Di Utang & Piutang, Ubah kartu: jatuh tempo tiap tanggal 25.
4. Ketik `belanja di ace hardware 300rb pakai cc mandiri`.
5. Bayar tagihan kartu itu dari form sebesar Rp 350.000 → pilih **Catat selisihnya sebagai biaya kartu**.
6. Hapus kartunya.

**Diharapkan:** langkah 1 bertanya "Kartu kredit Mandiri belum terdaftar. Bayar ke kartu yang mana?" tanpa menawarkan SeaBank/ShopeePay; tidak ada piutang. Setelah langkah 2 kartunya "Tidak ada tagihan · jatuh tempo …" (setelah langkah 3). Langkah 4 menaikkan tagihan jadi Rp 300.000. Langkah 5 memperingatkan "Lebih Rp 50.000…", lalu tercatat biaya Rp 50.000 dan kartu "Tidak ada tagihan". Konfirmasi hapus menyebut jumlah transaksi yang tetap tercatat; saldo SeaBank tidak berubah oleh penghapusan.

## UAT-04 · Membagi tagihan makan & membaca laporannya (HP)
1. Catat manual: pengeluaran Rp 150.000 "Resto Uji", kategori Makan, SeaBank.
2. Pecah: Rp 100.000 Makan + Rp 50.000 Hiburan.
3. Riwayat → filter kategori Makan; lalu Hiburan; lalu tanpa filter.
4. Analitik bulan ini → ketuk kategori Hiburan.
5. Tanya AI: "berapa pengeluaran hiburan bulan ini?"
6. Gabung lagi transaksinya.

**Diharapkan:** filter Makan menampilkan "Bagian dari Rp 150.000 · Rp 100.000" dan total sesuai kartu yang tampil; Hiburan "… Rp 50.000"; tanpa filter satu kartu "2 bagian · Rp 150.000" dan hitungan transaksi bertambah 1. Riwayat dari Analitik menunjukkan angka yang sama dengan Analitik. Tanya AI menyebut Rp 50.000. Gabung → satu transaksi Rp 150.000.

## UAT-05 · Mengatur budget bulanan & memantaunya (HP)
1. Profil → Budget → pilih 50/30/20, penghasilan per bulan Rp 1.000.000.
2. Catat pengeluaran kebutuhan sampai ±85% jatah Kebutuhan (mis. `belanja bulanan indomaret 430rb seabank`).
3. Buka Beranda, lalu Analitik.

**Diharapkan:** kartu metode di Beranda menulis "Hampir habis · sisa Rp …" dengan ikon (bukan warna saja). Analitik memakai metode itu; proyeksi (bila tampil) dibandingkan dengan jatah pengeluaran metode, bukan budget per kategori. Kembalikan pengaturan tidak perlu (akun uji).

## UAT-06 · Menabung dana darurat & memakainya (HP)
1. Profil → Tujuan tabungan → buat "Dana darurat" target Rp 10.000.000.
2. Sisihkan Rp 1.000.000 dari SeaBank.
3. Catat pengeluaran Rp 400.000 "Klinik Uji" (Kesehatan, SeaBank), lalu di detailnya "Dibayar dari tujuan tabungan" → Dana darurat.
4. Catat juga pengeluaran biasa Rp 100.000 "Apotek Uji" (Kesehatan, SeaBank), lalu Analitik → ketuk kategori Kesehatan, dan ketuk baris "Dari tujuan tabungan".
5. Tanya AI: "berapa isi dana darurat?"
6. Coba buat tujuan baru dengan tenggat kemarin.
7. Hapus tujuan "Dana darurat".

**Diharapkan:** tujuan menunjukkan Rp 600.000 terkumpul. Analitik memisahkan pembelian dari tujuan (Klinik Uji di baris "Dari tujuan tabungan", bukan di Kesehatan); Riwayat dari kategori Kesehatan memakai chip "Tanpa dari tujuan tabungan" dan hanya berisi Apotek Uji Rp 100.000; Riwayat dari "Dari tujuan tabungan" berisi Klinik Uji Rp 400.000. Tanya AI menyebut Rp 600.000 saja. Tenggat kemarin ditolak "Tenggatnya paling cepat hari ini." Konfirmasi hapus menyebut "Rp 600.000 … ikut hilang dari Total aset".

## UAT-07 · Meminjamkan uang ke teman (HP)
1. Utang & Piutang → Pinjamkan Rp 200.000 ke "Budi Uji" dari SeaBank, jatuh tempo kemarin.
2. Ubah jatuh tempo ke minggu depan, simpan.
3. Terima bayaran Rp 200.000 dari Budi Uji ke SeaBank.
4. Hapus kontak Budi Uji.
5. Profil → Kantong: ganti nama ShopeePay jadi "seabank".

**Diharapkan:** langkah 1 ditolak "Jatuh tempo tidak boleh sebelum tanggal pinjam."; langkah 2 tersimpan, Piutang Rp 200.000. Setelah dibayar Budi pindah ke "Sudah lunas". Konfirmasi hapus menyebut transaksi yang tetap tercatat. Langkah 5 ditolak dengan pesan yang menyebut nama itu sudah dipakai untuk SeaBank. "Dari kantong" tidak pernah menawarkan tujuan tabungan.

## UAT-08 · Memakai di laptop (1300 px, lalu 900 px)
1. Buka halaman masuk sebelum login.
2. Login, buka Analitik, ketuk merchant teratas.
3. Buka Tanya AI (panel samping), tanya "berapa belanja di <merchant teratas> bulan ini?", ketuk "Lihat di Riwayat".
4. Ulangi langkah 3 di 900 px.
5. Profil → Ekspor CSV.

**Diharapkan:** form masuk tepat di tengah. Riwayat dari Analitik memakai chip "Merchant: …" dengan total sama. Jawaban Tanya AI memakai saringan merchant (tautan `merchant=`), angkanya sama dengan Riwayat. Dengan panel terbuka, Riwayat satu panel, nama merchant terbaca, chip filter membungkus (tidak terpotong). Baris pindah kantong di CSV berkategori "Pindah kantong".

## Hasil

Dijalankan 6 Nov 2026 lewat browser otomatis (Edge headless, `e2e/kepala.mjs`) di dev server lokal, branch `fix/temuan-2.9.0` (`7c19079`), dengan AI sungguhan dan akun uji baru per skenario (semua dihapus sesudahnya). Tidak ada galat di console di skenario mana pun.

| Skenario | Hasil | Catatan |
|---|---|---|
| UAT-01 | **Lulus** | Hari ini −Rp 65.000; SeaBank Rp 4.860.000, ShopeePay Rp 575.000; "3 transaksi". |
| UAT-02 | **Lulus** | Rencana "Sepatu"; 1/3 → (draft) 1/3 → 2/3 → 3/3 → Cicilan lunas. |
| UAT-03 | **Lulus** | Pertanyaan kartu tanpa kantong uang; tagihan Rp 300.000; selisih Rp 50.000 dicatat; saldo SeaBank tetap setelah kartu dihapus. AI meminta memilih kantong untuk "pakai cc mandiri" (lihat temuan). |
| UAT-04 | **Lulus** | Bagian Rp 100.000 / Rp 50.000 di filter; Analitik = Riwayat; Tanya AI Rp 50.000; gabung kembali Rp 150.000. |
| UAT-05 | **Lulus** | "Hampir habis · sisa Rp 70.000" dengan ikon (86%); proyeksi dibandingkan "jatah pengeluaran 50/30/20 Rp 800.000". |
| UAT-06 | **Lulus** | Langkah 4 semula tidak bisa dijalankan (satu-satunya pengeluaran Kesehatan dibayar dari tujuan, sehingga memang tidak tampil di kategori); dokumen dibetulkan dan langkah penggantinya lulus. Tanya AI Rp 600.000. |
| UAT-07 | **Lulus** | Jatuh tempo kemarin ditolak; "Sudah lunas"; hapus kontak tanpa mengubah SeaBank; nama "seabank" ditolak. |
| UAT-08 | **Lulus** | Masuk tepat di tengah; "Merchant: Kopi Kenangan" Rp 155.000 = jawaban Tanya AI (`merchant=`); satu panel & chip membungkus di 1300 dan 900 px; CSV "Pindah kantong". |

### Temuan di luar "Diharapkan"

Semua sudah diperbaiki di PR yang sama (SPEC-perbaikan-temuan G1–G6) dan diuji ulang: Profil di 900 px dengan Tanya AI terbuka kini satu panel dan terbaca; "Tanpa nama" diganti nama kategori; "pakai cc mandiri" langsung ke kartunya; "Dari kantong" bawaan kantong bersaldo terbesar; tautan Tanya AI ke tab Keluar; keterangan Utang & Piutang membungkus.

1. Profil di 900 px dengan panel Tanya AI terbuka tetap dua panel dan sesak (label menu terpotong jadi "K.", nominal kantong terpotong). Perlakuan satu panel (A6) hanya untuk Riwayat.
2. Tautan "Lihat di Riwayat" dari Tanya AI tidak membawa `jenis=keluar`, jadi Riwayat terbuka di "Semua" (totalnya tetap sama).
3. Transaksi ketikan yang tidak punya merchant tampil "Tanpa nama" di Beranda & Riwayat, padahal kartu Catat menampilkan nama kategorinya.
4. "pakai cc mandiri" tidak langsung cocok dengan kartu "Kartu kredit Mandiri" (AI mengisi "Mandiri"); user diminta memilih kantong.
5. "Dari kantong" di Bayar tagihan bawaannya Tunai walau saldonya Rp 0.
6. Di 390 px subjudul baris kartu/cicilan terpotong ("… jatuh tempo …").
