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

Belum dikerjakan; dicatat supaya tidak lupa. Urutan fase ada di
SPEC-catat-tuntas.md (fase 1 & 2 selesai di 2.4.0, fase 3 di 2.5.0, fase 4 di 2.8.0).

- **Opsi "tujuan ini disimpan di BCA"**, kalau saldo BCA yang lebih kecil dari
  saldo asli di bank (karena sebagian disisihkan ke tujuan) terasa membingungkan.

- **Caching data di server** (lanjutan), kalau setelah diukur di produksi
  halaman masih terasa lambat atau kuota Supabase/Vercel menipis: mis. data
  yang jarang berubah (kategori, kantong) disimpan sementara di server.

## [Unreleased]

### Diubah
- **AI Catat mengenali nama kantong & tujuan tabunganmu** (SPEC-ai-kantong). "sisihkan 200rb dari bca ke Liburan" atau "nabung 500rb ke dana darurat pakai gopay" langsung tercatat sebagai pindah kantong yang benar, tanpa ditanya "Pindah ke kantong mana?". Pada 18 kalimat uji, ketepatannya naik dari 31/36 menjadi 35/36; kalimat pindah kantong 12/12.

### Diperbaiki
- **Mencatat beberapa transaksi beruntun lewat teks tidak lagi berakhir jadi "nggak berhasil dibaca".** AI utama (Groq, paket gratis) hanya kuat ±1 catatan per menit per model; bila sedang penuh, teks kini dibaca Gemini. Aturan khusus struk juga tidak lagi dikirim untuk teks ketikan, jadi tiap catatan memakai ±28% lebih sedikit kuota.

## [2.8.1] — 2026-10-31

### Keamanan
- **Transaksi tidak bisa lagi merujuk data akun lain.** Sebelumnya, siapa pun yang tahu id transaksi atau kantong milik orang lain (mis. dari tautan `/transactions/<id>`) bisa memasangnya di transaksinya sendiri sebagai bagian pecahan, ikutan, atau kantong, lalu membaca merchant dan nama kantong pemiliknya. Kini database menolak rujukan ke transaksi, kantong, atau rencana cicilan milik akun lain. Tidak ada data lama yang terkena (sudah diperiksa).

## [2.8.0] — 2026-10-31

### Ditambah
- **AI menawarkan pecah struk campuran** (SPEC-tawar-pecah). Struk Indomaret berisi beras, sabun, dan cokelat kini ditawari dipecah: "Belanja harian Rp 70.000 · Makan Rp 17.500". Tawarannya muncul di kartu hasil Catat dan di atas halaman detail, sampai dipecah atau ditutup.
  - **Pecah** membuka lembar "Pecah transaksi" yang sudah terisi; tidak ada yang berubah sebelum Simpan.
  - Diskon, PPN, dan biaya layanan dibagi aplikasi secara proporsional, jadi jumlah bagiannya selalu pas dengan yang dibayar.
  - Hanya untuk struk dengan barang beda kategori. Teks ketikan tidak ditawari. Tawaran hilang sendiri kalau nominal transaksinya diubah.
  - Nama barang di usulan disimpan terenkripsi, seperti keterangan transaksi.
- **Dua kelompok baru: Pengembangan diri dan Tak terduga** (SPEC-kelompok-baru), untuk metode 6 Jars dan Kakeibo. Bisa dipilih di Edit transaksi, Pecah transaksi, Profil → Kategori, dan filter Riwayat.
  - Kategori bawaan baru **Pendidikan** (kelompok Pengembangan diri). Akun yang sudah punya kategori bernama Pendidikan tidak mendapat duplikat.
  - AI memberi kelompok Pengembangan diri untuk kursus, buku, dan seminar, dan Tak terduga hanya bila disebut mendadak/darurat/rusak.
  - Di metode 50/30/20, 80/20, 70/20/10, dan Kustom keduanya dihitung Kebutuhan, jadi angkanya tidak berubah. Kustom tetap empat isian persen.
- **Empat metode budgeting baru** (SPEC-metode-lanjutan), di Profil → Budget, Analitik, Beranda, dan Tanya AI. Tabungannya dihitung dari uang yang **benar-benar disisihkan** (pindah ke tujuan tabungan dan beli emas/reksadana), bukan sisa di rekening.
  - **Zero-Based:** target per kategori ditambah target tabungan; "Belum dialokasikan" menunjukkan penghasilan yang belum diberi tugas sampai Rp 0.
  - **Pay Yourself First:** atur persen tabungan (bawaan 20%), sisanya bebas. Setelah gajian, Beranda menampilkan **"Belum disisihkan"** dengan tombol **Sisihkan** sampai tabungannya tercapai.
  - **6 Jars:** kebutuhan 55%, hiburan, pendidikan, tabungan jangka panjang, kebebasan finansial masing-masing 10%, berbagi 5%.
  - **Kakeibo:** empat pos tanpa jatah (bertahan hidup, pilihan, budaya, ekstra), target tabungan, dan "Bisa dibelanjakan". Mulai tanggal 25 dan di bulan yang sudah lewat, Analitik punya tombol **Refleksi** yang meminta Tanya AI merangkum bulan itu dalam empat poin.
- **Strategi pelunasan utang: Snowball atau Avalanche** (SPEC-pelunasan) di Utang & Piutang, berjalan bersama metode budget apa pun. Muncul kalau ada dua utang atau lebih (pinjaman orang, kartu kredit, sisa cicilan).
  - **Snowball:** sisa terkecil dulu. **Avalanche:** bunga tertinggi dulu. Yang pertama ditandai **Fokus**; "Uang ekstra per bulan" menunjukkan ke mana uang tambahan sebaiknya pergi.
  - Bunga per bulan (opsional) bisa diisi saat menambah kartu kredit atau cicilan, dan lewat aksi baru **Atur bunga** untuk orang, kartu, dan cicilan (termasuk cicilan dari belanja paylater).
  - Tanya AI bisa menjawab "utang mana dulu?" sesuai strategi pilihan.

### Diubah
- **"Disisihkan ke tujuan" kini setoran bersih:** uang yang ditarik lagi dari tujuan tabungan ke kantong biasa dikurangkan, dan pindah antar tujuan tidak dihitung.
- Nama kelompok yang panjang di kartu budget turun baris, tidak terpotong.
- **Pembelian dari tujuan tabungan tidak lagi dihitung sebagai pengeluaran bulan itu** (SPEC-analitik-tujuan). HP Rp 10 jt yang dibayar dari "Tabungan HP" tidak membuat proyeksi melonjak, tidak jadi "Paling boros" atau "Belanja naik Rp 10 jt", dan tidak ikut di kategori, merchant teratas, tren 6 bulan, maupun budget per kategori.
  - **Analitik** menampilkannya di baris sendiri, **"Dari tujuan tabungan"**, di bawah Keluar. Mengetuknya membuka Riwayat pembelian itu.
  - **Beranda** (pengeluaran bulan ini) dan **Tanya AI** memakai angka yang sama. Tanya AI tetap tahu pembelian itu dan menyebutnya terpisah sebagai "dibayar dari tabungan".
  - Riwayat tidak berubah: tetap menampilkan semua transaksi.

## [2.7.0] — 2026-10-27

### Diubah
- **Database dinormalisasi** (SPEC-normalisasi). Tidak ada yang berubah di tampilan; yang berubah cara data disimpan:
  - kategori transaksi, budget, dan rencana cicilan dijaga database: tidak bisa lagi menunjuk kategori yang tidak ada;
  - transaksi tidak lagi menyimpan salinan nama kantong. **Mengganti nama kantong** kini langsung terlihat di semua transaksi lamanya;
  - kolom sisa impor rekening koran dibuang; kolom yang sering dipakai untuk mencari mendapat indeks; waktu terakhir diubah (`updated_at`) dicatat.

### Diperbaiki
- **Kantong yang punya transaksi pindah kantong bisa dihapus lagi.** Sebelumnya gagal dengan "permission denied". Nama kantongnya tetap tertulis di transaksi lama.

## [2.6.0] — 2026-10-27

### Ditambahkan
- **Kategori diingat per merchant.** Transaksi dari merchant yang pernah dicatat langsung memakai kategori transaksi terakhirnya, tidak ditebak ulang AI. Contoh: "WAITENJOY" yang sudah dibetulkan jadi Laundry tidak kembali jadi Makan di unggahan berikutnya; transfer ke "Dnid Ridx Dana" (warteg tanpa akun merchant) tetap Makan.
  - Nama yang dibaca sedikit berbeda tetap dikenali: huruf besar-kecil, tanda baca, nama terpotong, atau kata depan yang hilang ("qwrtz" = "Toko Qwrtz").
  - "Lainnya" tidak ikut diingat, karena tebakan AI yang spesifik lebih berguna.
- **Betulkan sekaligus:** setelah mengubah kategori sebuah transaksi (Edit transaksi atau koreksi di obrolan Catat, mis. "bukan, itu laundry"), aplikasi menawarkan "Ubah juga 4 transaksi WAITENJOY lain jadi Laundry?". Tidak ada yang berubah tanpa persetujuan; bisa diurungkan.
- **Minta lewat Tanya AI:** "waitenjoy itu laundry, tolong betulkan". Tanya AI menjelaskan transaksi mana yang akan berubah dan menampilkan kartu konfirmasi **Ubah** / **Batal**; kategori yang belum ada (mis. Laundry) ikut dibuat. Tanya AI tidak pernah mengubah data sebelum tombol Ubah ditekan, dan hasilnya bisa diurungkan.

### Diperbaiki
- **Tombol kembali mengingat asal halaman.** Utang & Piutang yang dibuka dari Profil kembali ke Profil (dulu selalu ke Beranda); Budget dari "Atur metode" kembali ke Analitik; Tujuan tabungan dari Kantong kembali ke Kantong. Halaman yang dibuka langsung (notifikasi, pintasan, muat ulang) tetap kembali ke induknya.

## [2.5.0] — 2026-10-26

### Ditambahkan
- **Metode budgeting** di **Profil → Budget**: selain budget per kategori, kini bisa memilih **50/30/20**, **80/20**, **70/20/10**, atau **Kustom** (persen sendiri, totalnya harus 100%).
  - **Penghasilan per bulan** dibagi ke kelompok **Kebutuhan, Keinginan, Tabungan, Berbagi**. Angkanya disarankan dari rerata penghasilan 3 bulan terakhir, jadi jatahnya tetap sepanjang bulan walau gajian di akhir bulan; bisa diubah sendiri ("Ubah", lalu "Pakai saran" untuk kembali).
  - **Penghasilan ≠ uang masuk:** hanya kategori pemasukan yang ditandai **"Dihitung sebagai penghasilan"** (Profil → Kategori) yang ikut. Bawaannya Gaji, Bonus/THR, Usaha/Jualan, dan Freelance; pemberian, cashback/refund, bunga, dan lainnya tidak.
  - **Pratinjau pembagian** di atas daftar metode: bilah per persen dan rupiah tiap kelompok dari penghasilanmu, plus penjelasan singkat metodenya. Ikut berubah saat memilih metode atau mengetik persen Kustom. Untuk Per kategori, pratinjaunya membandingkan total target dengan penghasilan.
  - **Analitik** menampilkan realisasi tiap kelompok dibanding jatahnya. Mengetuk satu kelompok membuka Riwayat yang tersaring ke kelompok itu. Tabungan dibaca terbalik: makin besar makin baik.
  - **Beranda** memperingatkan kelompok yang hampir habis atau lewat.
  - **Tanya AI** menjelaskan dengan bahasa metode itu ("Keinginan Rp 10,5 jt, jauh di atas jatah Rp 2,4 jt").
  - Target per kategori yang sudah diisi tetap tersimpan, tinggal dipilih lagi kapan saja.
- **Kelompok** di tiap kategori pengeluaran (Profil → Kategori) dan di tiap transaksi. Contoh: makan di restoran mewah boleh dihitung Keinginan walau kategorinya Makan. Saat mencatat, AI menyarankan kelompoknya bila jelas (fine dining → Keinginan, zakat → Berbagi).
- **Pecah transaksi:** satu belanja campuran bisa dibagi ke beberapa kategori/kelompok, mis. Rp 15.000 di minimarket = sabun Rp 10.000 (Kebutuhan) + kopi Rp 5.000 (Keinginan).
  - Di daftar tetap tampil **satu transaksi** dengan totalnya dan keterangan "2 bagian", jadi tidak terlihat seperti terunggah dua kali.
  - Diatur dari detail transaksi ("Pecah transaksi" / "Atur pecahan"), bisa digabungkan lagi.
  - Mengetik rinciannya langsung di Catat ("15rb di indomaret, 10rb sabun 5rb kopi") otomatis tersimpan terpecah.
- Ekspor CSV mendapat kolom **Kelompok** dan **Pecahan**.
- **Tujuan tabungan** (Profil → Tujuan tabungan): mis. "HP baru Rp 10 jt, Maret 2027".
  - Progres tiap tujuan dan berapa yang perlu disisihkan per bulan agar tercapai tepat waktu.
  - **Sisihkan** = pindah kantong ke tujuan; bisa juga lewat Catat: "sisihkan 500rb dari BCA ke HP baru". **Pakai** = bayar dari tujuan.
  - Belanja yang dibayar dari tujuan **tidak menghabiskan jatah bulan itu**; kartu metode menampilkannya terpisah ("Dibayar dari tujuan: HP baru"), begitu juga yang disisihkan bulan ini.
  - Belanja lama yang ternyata dari tabungan: di detail transaksi pilih **"Dibayar dari tujuan tabungan"**. Saldo kantong asalnya tidak berubah; bisa dibatalkan.
  - Tanya AI tahu belanja mana yang dari tabungan, jadi "kenapa bulan ini boros?" tidak lagi menyalahkan pembelian itu.
  - Profil → Kantong menampilkan total yang disisihkan ke tujuan; total aset tetap menghitungnya.

### Diubah
- **Lend & Borrow** kini bernama **Utang & Piutang** (Lend → Piutang, Borrow → Utang).

## [2.4.0] — 2026-10-25

### Ditambahkan
- **Arah bukti transfer.** Bukti transfer kiriman orang lain kini tercatat sebagai **pemasukan**, bukan pengeluaran.
  - **Cara memutuskan:** aplikasi mengenali kamu dari nama di rekening (pengirim atau penerima) atau dari kantongmu (bank penerima atau pengirim).
  - **Kalau belum jelas,** Catat bertanya *"Ini kamu yang kirim ke …, atau terima dari …?"*. Jawaban pertama menyimpan namamu, jadi berikutnya tidak ditanya lagi.
  - Nama yang dikenali bisa dilihat, ditambah, dan dihapus di **Profil → Nama di rekening**.
- **Cerita di balik transaksi:** setelah mencatat, kartu "Tersimpan" menawarkan **"+ Tambah cerita"** ("traktir teman", "kado nikahan"). Ceritanya tersimpan di Keterangan. Catatan yang ditulis orang di struk/bukti transfer ("Bayar arisan Oktober") juga terisi sendiri.
- **Tanya AI menjelaskan "kenapa"** memakai cerita itu: "kenapa bulan ini boros?" dijawab dengan transaksi besarnya beserta alasannya.
- Tombol **Tanya AI juga di Beranda**. Di layar lebar panelnya tetap terbuka saat membuka tautan "Lihat di Riwayat"; di HP obrolannya tetap ada saat dibuka lagi.
- **Urungkan hapus:** setelah menghapus transaksi, snackbar menampilkan "Urungkan". Transaksi beserta cashback/biaya adminnya kembali persis seperti semula.

### Diubah
- **Tanya AI jauh lebih cepat** untuk pertanyaan perbandingan ("bandingin sama bulan lalu", "selisihnya berapa"): dari ±20 detik jadi ±3 detik. Ringkasan bulan yang sedang dilihat kini dihitung di depan.

### Diperbaiki
- **Hasil "Bagikan" langsung tampil.** Struk dari e-wallet yang diproses di latar langsung muncul di Riwayat, atau sebagai titik di tombol + kalau perlu dicek, tanpa refresh. Kembali ke aplikasi juga menyegarkan data.
- **Ketikan di Catat tidak hilang** saat lembarnya ditutup (seperti draf), juga setelah aplikasi ditutup. Draf terhapus begitu dikirim.

## [2.3.1] — 2026-10-25

### Diubah
- **Pesan salah di form tampil di bawah isian yang salah**, bukan satu pesan di bawah form. Isian itu langsung difokus (dan digulir ke sana), garisnya merah, dan pesannya hilang begitu isiannya dibetulkan. Berlaku di Catat manual, Edit transaksi, Kantong, Kategori, Budget, pinjaman, kartu kredit, cicilan, dan password baru. Galat jaringan/server tetap di bawah form.
- Keterangan di bawah isian (mis. daftar syarat password) tetap tampil saat ada pesan salah, karena sering justru menjelaskan cara membetulkannya.
- Pembaca layar: pesan salah & keterangan kini dibacakan sebagai keterangan isian (`aria-describedby`, `aria-invalid`), bukan ikut menjadi nama isian.

## [2.3.0] — 2026-10-25

### Ditambahkan
- **Tempel gambar** (Ctrl+V) di kolom Catat: tangkapan layar atau gambar yang disalin langsung dilampirkan seperti foto dari galeri. Teks biasa tetap ditempel seperti biasa.
- **Halaman offline**: membuka aplikasi tanpa internet kini menampilkan "Kamu sedang offline" (bukan halaman dinosaurus browser), dan halaman tadi terbuka sendiri begitu sinyal kembali.
- **"Buang perubahan?"**: menutup form yang sudah diisi (lewat Batal, kembali, Esc, atau ketuk di luar) bertanya dulu. Berlaku di form Catat manual, Edit transaksi, Kantong, Kategori, pinjaman, kartu kredit, dan cicilan. Form yang belum diubah tetap langsung tertutup.

### Diubah
- Di layar lebar, lembar **Catat** lebih lebar (640px, sama dengan pop-up besar lain).
- Margin samping isi 24px mulai layar 600px (panduan One UI: minimal 24dp). Di HP tetap 16px.

### Diperbaiki
- **Aksesibilitas** (dari review UI/UX Pro Max):
  - Di dua panel, judul panel detail kini h2, jadi tiap halaman punya satu judul utama untuk pembaca layar.
  - Elemen yang difokus dengan Tab tidak lagi tertutup baris aksi yang menempel atau navigasi bawah.
  - Chip filter, chip saran, dan pegangan lembar Catat punya area sentuh 48dp tanpa mengubah tampilannya. Begitu juga tombol kirim Tanya AI, pilihan emoji & warna, dan "Lupa password?".

## [2.2.0] — 2026-10-25

### Ditambahkan
- **Tampilan layar lebar** untuk tablet, Galaxy Z Fold, dan desktop, mengikuti panduan layar lebar & foldable Samsung. Di HP tidak ada yang berubah.
  - Mulai 600px, navigasi bawah pindah ke **rail di kiri** dengan tombol + di atas. Mulai 1200px rail menjadi **sidebar berlabel**, dan Lend & Borrow mendapat item sendiri.
  - Mulai 840px, **Riwayat** berisi daftar dan detail berdampingan: klik transaksi, detailnya terbuka di kanan tanpa kehilangan daftar dan filter. **Profil** berisi menu di kiri dan halamannya di kanan. **Beranda** dan **Analitik** menampilkan kartu dalam dua kolom.
  - Lembar seperti Catat dan form lain tampil sebagai **pop-up di tengah**, bukan layar penuh.
  - **Tanya AI** menempel sebagai panel di kanan, sehingga grafik Analitik tetap terlihat sambil bertanya.
  - Fold dibuka atau dilipat tidak menghapus ketikan, obrolan, atau detail yang sedang dibuka.
- **Seret foto struk** ke aplikasi (desktop, layar terpisah di tablet/Fold): fotonya langsung diproses seperti foto dari "Bagikan".
- Efek hover untuk mouse di desktop.

## [2.1.0] — 2026-10-25

### Ditambahkan
- **Tanya AI** di Analitik: tanya soal keuanganmu dengan bahasa sehari-hari ("Kenapa bulan ini boros?", "Total kopi bulan ini?", "Utangku ke siapa aja?"). Bisa juga "kalau Laku6 tidak dihitung…", "transaksi di atas 1 juta", dan "bagaimana kondisi keuanganku". Angkanya diambil langsung dari catatanmu; selisih & persen dihitung kalkulator, bukan ditebak AI, dan nominal di jawaban diperiksa, dengan tombol untuk membuka Riwayat/Analitik yang sesuai. Obrolan tidak disimpan.
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
