# Spec: Lengkapi transaksi dari screenshot & struk, unggah banyak gambar

Status: **diterapkan, belum dirilis** · 6 November 2026 (diterapkan 7 November 2026) · branch `feat/impor-rekening` · migrasi `20261113000000_lengkapi_urutan.sql` · pasangan [SPEC-impor-rekening](SPEC-impor-rekening.md)

## Masalah

Satu belanja muncul di tiga tempat dengan isi berbeda — contoh (rekaan, polanya dari data nyata): belanja minimarket Rp 32.500 dibayar QRIS ShopeePay dengan dana SeaBank:

| Sumber | Yang diketahui |
|---|---|
| Rekening koran SeaBank | "ShopeePay Payment −32.500, 03 SEP" — nominal & kantong benar, tanpa merchant, tanpa jam |
| Screenshot ShopeePay | Bayar ke Alfamart, 3 Sep 08.45, Kamu Membayar Rp 32.500, sumber dana SeaBank, cashback, Order SN |
| Struk Alfamart | Alfamart (nama gerai), 08.45.10, daftar barang, "CPM QRIS SHOPEEPAY" |

Kalau ketiganya dicatat, uangnya terhitung tiga kali. Deteksi duplikat sekarang (sama persis: nominal, tanggal, merchant, kantong; SPEC-catat-andal) tidak mengenalinya karena merchant & kantong berbeda — dan struk menulis "ShopeePay" padahal uangnya dari SeaBank.

Survei data user (Sep–Okt 2026): **92 dari 92** screenshot ShopeePay yang dananya dari SeaBank cocok persis (tanggal & nominal "Kamu Membayar") dengan baris rekening koran; **36 dari 36** struk QRIS ShopeePay cocok nominalnya (2 bertanggal +1 hari: belanja ≥ 22.00, tanggal bisnis kasir). Hanya 3 kelompok baris dengan tanggal & nominal sama dalam 2 bulan.

## Rancangan

### 1. Mencocokkan sebelum mencatat

Setiap screenshot/struk yang dibaca AI (jalur yang ada, SPEC-catat-andal) **dicocokkan dulu** ke transaksi yang sudah tercatat sebelum dibuat transaksi baru (`cariPasangan`, fungsi murni):

- **Kandidat:** transaksi tercatat, belum dilengkapi oleh sumber sejenis (screenshot atau struk), dengan:
  - **nominal**: screenshot → "Kamu Membayar"/"Total Pembayaran" (bukan Total Pembelian); struk → Total Belanja dikurangi voucher/promo e-wallet yang tertera; sama persis;
  - **tanggal**: screenshot sama; struk sama, atau bila jam struk ≥ 22.00 juga **sehari sebelum** tanggal struk (kasir memakai tanggal bisnis berikutnya: struk "11 Okt 23.16" = bank & ShopeePay "10 Okt 23.16"; revisi 7 Nov dari UAT data asli, semula tertulis ambigu "+1 hari");
  - **kantong**: kantong sumber dana yang terbaca (mis. SeaBank), **atau** kantong mana pun bila yang terbaca hanya e-wallet perantara ("QRIS ShopeePay") — karena e-wallet bisa menarik dana dari bank.
- **Urutan & jam:** bila ada beberapa kandidat, yang jamnya paling dekat; untuk rekening tanpa jam (SeaBank), urutan baris rekening dibandingkan urutan jam gambar-gambar yang cocok di hari itu.
- **Hasil:**
  - **1 kandidat** → kartu **"Lengkapi transaksi ini?"** (§2);
  - **beberapa kandidat** → pilih salah satu dari daftar singkat, atau "Catat sebagai baru";
  - **tidak ada** → dicatat sebagai transaksi baru seperti sekarang (mis. bayar dari Saldo ShopeePay, belanja tunai).

### 2. Melengkapi

Kartu menampilkan transaksi yang ada ("ShopeePay · −Rp 32.500 · 3 Sep · SeaBank") dan apa yang akan berubah:

| Diisi dari screenshot | Diisi dari struk |
|---|---|
| merchant / penerima ("Bayar ke Alfamart", "Kirim ke <nama> · BCA …5678"), jam, cashback (ikutan, §3), Order SN | merchant (nama toko), jam, kategori, rincian barang (keterangan ringkas), **tawaran pecah** bila barangnya campur (SPEC-tawar-pecah), nomor bon |

- **Nominal, tanggal, dan kantong tidak berubah** (rekening koran yang benar). Kategori dari struk menggantikan "Lainnya"; kategori yang sudah diisi user tidak ditimpa tanpa ditanya.
- Tombol **Lengkapi** / **Catat sebagai baru** / **Batal**. Dari ketikan "ini yang tadi pagi di alfamart" tidak berlaku — hanya gambar.
- Tanda **Perlu dilengkapi** (SPEC-impor-rekening) hilang begitu dilengkapi; Riwayat punya filter **Perlu dilengkapi**.
- Dilengkapi oleh screenshot lalu struk (atau sebaliknya) boleh: masing-masing mengisi bagiannya.

### 3. Cashback

Cashback dari screenshot ShopeePay (Rp 5–215, ±50 per bulan) dicatat sebagai **ikutan cashback** transaksinya (konsep yang sudah ada), masuk ke kantong **ShopeePay** (bukan kantong sumber dana), karena di sanalah cashback dikreditkan (**K2**).

### 4. Duplikat yang sama persis

Deteksi duplikat yang ada ("Sepertinya ini sudah tercatat… Catat lagi?") mendapat pilihan ketiga **"Lengkapi yang sudah ada"** (permintaan user): mengisi kategori, merchant, jam, dan rincian dari gambar baru ke transaksi lama, tanpa membuat transaksi baru.

### 5. Gambar yang sama dikirim dua kali

Order SN (screenshot) dan nomor bon (struk) disimpan pada transaksi yang dilengkapi/dibuat (kolom `ref_bukti`). Gambar dengan pengenal yang sama → "Struk ini sudah dipakai untuk melengkapi …" tanpa memproses ulang ke AI bila pengenalnya terbaca lebih dulu dari nama file/teks.

### 6. Screenshot sebelum rekening korannya diimpor

Screenshot/struk yang tidak menemukan pasangan dicatat sebagai transaksi baru (seperti sekarang). Saat rekening koran diimpor kemudian, barisnya dicocokkan ke transaksi itu (SPEC-impor-rekening §5) sehingga tidak dobel; nominal & kantong mengikuti rekening koran bila berbeda (ditampilkan di pratinjau impor).

### 7. Unggah banyak gambar sekaligus

- Galeri di Catat menerima **banyak gambar** (dan seret-lepas banyak file / Bagikan banyak gambar).
- Diproses **berurutan di latar** dengan jeda sesuai batas kuota AI; antrean yang ada (snackbar "Lagi proses struk · sisa n", SPEC-catat-chat) dipakai.
- Hasilnya **ringkasan**, bukan satu kartu per gambar: "38 struk: 34 melengkapi transaksi, 2 dicatat baru, 2 perlu dicek" → ketuk untuk membuka yang perlu dicek (kandidat ganda, tidak terbaca) satu per satu. Pencocokan 1 kandidat **dilengkapi otomatis** saat unggah banyak (**K1**); tetap bisa diurungkan dari ringkasan.
- Batas per unggahan: **K3**.

## Keputusan (6 Nov 2026: K1–K4 semua memakai usulan)

| K | Pertanyaan | Usulan | Alternatif |
|---|---|---|---|
| K1 | Unggah banyak: pasangan yang pasti (1 kandidat) | **Dilengkapi otomatis**, bisa diurungkan dari ringkasan | Tetap ditanya satu per satu |
| K2 | Cashback ShopeePay | **Ikutan cashback di kantong ShopeePay** | Diabaikan (kecil) |
| K3 | Batas jumlah gambar per unggahan | **50** (±2–3 menit dengan jeda kuota) | 20 / tanpa batas |
| K4 | Kantong ShopeePay sebagai tempat saldo, cashback, dan perantara | **Wajib ada kantong ShopeePay** (ditawarkan dibuat saat pertama dibutuhkan) | Tanpa kantong ShopeePay (cashback & Saldo ShopeePay tidak dicatat) |

## Pengujian

- **Unit** (`uji:lengkapi`): `cariPasangan` (nominal net vs total, tanggal struk −1 hari bila ≥ 22.00, kantong perantara, kandidat ganda dengan urutan jam, sumber sejenis tidak dobel), isian yang diubah/tidak diubah, cashback ke kantong ShopeePay, pengenal bukti ganda.
- **Eval AI** (AI sungguhan, gambar contoh buatan bukan data user): screenshot "Rincian Pembayaran" dengan promo & cashback, "Rincian Transfer Bank" (sumber dana SeaBank), struk dengan voucher.
- **E2E** (`lengkapi`): transaksi hasil impor disuntik → unggah gambar (hasil AI disuntik, tanpa AI) → kartu Lengkapi → isi berubah, nominal tetap; unggah banyak → ringkasan; duplikat → "Lengkapi yang sudah ada".
- **UAT dengan data asli user** (lokal, akun uji sementara, dihapus sesudahnya): impor rekening koran SeaBank Sep 2026 → unggah screenshot ShopeePay & struk Alfamart September → cek angka kecocokan mendekati survei (92/92, 36/36).

## Boundaries

- Nominal, tanggal, dan kantong dari rekening koran tidak pernah diubah oleh screenshot/struk tanpa persetujuan user.
- Data asli user tidak masuk repo, tes otomatis, atau log.

## Keputusan saat implementasi (7 Nov 2026)

Hal yang tidak diatur spec, dipilih yang paling kecil dan sejalan dengannya:

1. **Field baru hasil baca AI** (prompt & skema Gemini, jalur struk saja): `sumber_dana` (rekening/dompet yang benar-benar terpotong, nama singkat: "SeaBank Bayar Instan - *1234" → SeaBank, "Saldo ShopeePay" → ShopeePay; null bila struk hanya menulis "QRIS SHOPEEPAY"), `dompet` (e-wallet perantara: screenshot ShopeePay, "CPM QRIS SHOPEEPAY" → ShopeePay), `voucher` (hanya struk kasir), `ref_bukti` (Order SN / No. Transaksi / nomor bon, dirapikan jadi huruf & angka besar: "ZZ01-234-5678ABCD" → "ZZ012345678ABCD"), `rekening_tujuan` (transfer bank: nama bank + 4 digit terakhir, "BCA …7890", dirapikan kode bila model menulis lebih). Nominal screenshot tetap "Kamu Membayar"/"Total Pembayaran".
2. **Struk dengan voucher**: nominal yang tercatat = Total Belanja − voucher (= yang ditagih ke QRIS = baris rekening koran), juga untuk transaksi baru; usulan pecah diskalakan ke nominal itu.
3. **`ref_bukti`** berisi token dipisah spasi: `ss:<Order SN>` / `struk:<nomor bon>` (`-` bila tidak terbaca) menandai transaksi sudah dilengkapi atau dibuat oleh bukti jenis itu ("sumber sejenis tidak dobel"), dan `h:<sidik>` = 16 hex sha-256 isi gambar. Diisi juga pada transaksi baru & draft dari gambar.
4. **Gambar yang sama dua kali (§5)**: sebelum AI — sidik gambar sama, atau pengenal tersimpan (≥ 8 karakter) termuat di nama berkas (struk digital Alfagift bernama `receipt-<kode toko>-<nomor bon>.png`); sesudah AI — Order SN/nomor bon sama untuk jenis yang sama. Hasilnya pesan "Struk ini sudah dipakai untuk melengkapi transaksi ini, jadi tidak dicatat lagi: …" (draft: "Gambar ini sudah dikirim dan menunggu di Belum selesai"), tidak ada yang disimpan.
5. **Kandidat (§1)**: transaksi tercatat, bukan ikutan/bagian pecahan; nominal sama persis; tanggal sama (struk ≥ 22.00: atau sehari sebelum tanggal struk; tanggal sama didahulukan). Arah: bukti pengeluaran ↔ pengeluaran atau pindah kantong dari kantong itu; bukti pindah kantong (isi/tarik saldo) ↔ sisi asal di kantong sumber, atau sisi masuk di kantong tujuan; bukti pemasukan ↔ pemasukan/pindah masuk. Kantong: sumber dana yang terbaca → hanya kantong itu (tidak ada kantongnya, mis. Saldo ShopeePay tanpa kantong ShopeePay, atau paylater → tidak ada pasangan, dicatat seperti biasa); hanya e-wallet/QRIS atau tidak tertulis → kantong mana pun. Deposito tidak pernah jadi kantong sumber.
6. **Pasti vs ragu**: pasti bila satu kandidat; atau satu-satunya yang jamnya ≤ 15 menit dari jam gambar; atau baris rekening tanpa jam yang urutannya cocok dengan jam baris tetangga yang sudah dilengkapi di kantong & hari itu (baris sebelumnya berjam ≤, sesudahnya ≥ jam gambar); atau, di unggah banyak, gambar ke-k menurut jam di antara n gambar sebayar & setanggal = baris ke-k menurut urutan rekening koran (bila tepat n kandidat tanpa jam). Selain itu ragu: daftar singkat (maks. 5) urut tanggal sama, jam terdekat, lalu urutan rekening.
7. **Urutan baris rekening koran disimpan** lewat `created_at` = saat impor + posisi baris (milidetik), migrasi `20261113000000_lengkapi_urutan.sql` (`impor_rekening` ditulis ulang, tanpa kolom baru). Riwayat jadi ikut urutan bank untuk baris SeaBank tanpa jam. Rekening koran yang diimpor sebelum migrasi ini: urutan tidak diketahui (semua `created_at` sama) → tidak dipakai, pasangannya ragu.
8. **Isian (§2)**: merchant & keterangan diganti bila pengisinya sekarang lebih lemah — rekening koran < screenshot < struk < diketik user (pengisi dibaca dari token `ref_bukti` dan `source`); jam hanya bila belum ada (jam bank/user tetap) dan tidak di hari saldo kantong sebelum jam saldonya (Lengkapi tidak boleh menggeser saldo); kategori menggantikan **Lainnya** dari screenshot maupun struk (kategori yang diingat per merchant didahulukan, SPEC-ingat-kategori); kategori struk yang beda dengan kategori yang sudah diisi hanya ditawarkan di kartu (kotak "Ganti kategori ke …", bawaan tidak; unggah banyak tidak pernah mengganti); usulan pecah dari struk bila jumlahnya = nominal transaksi dan belum dipecah; transfer bank: keterangan "Kirim ke <nama> · BCA …7890". Tipe, nominal, tanggal, kantong tidak pernah disentuh.
9. **Satu gambar dari Catat**: bila ada kandidat, belum ada yang disimpan; kartu "Lengkapi transaksi ini?" menampilkan transaksinya (atau pilihan radio bila ragu), daftar perubahan untuk kandidat pertama, "Nominal, tanggal, dan kantongnya tetap.", lalu **Lengkapi** / **Catat sebagai baru** / **Batal**. "Catat sebagai baru" mengirim balik hasil baca yang sama (field `hasil`, tanpa AI lagi) ke jalur biasa, termasuk cek duplikat; Batal tidak menyimpan apa pun. Sesudah Lengkapi: "Sudah dilengkapi:" dengan perubahannya, **↩ Urungkan** dan **Lihat**.
10. **Cashback (K2, K4)**: ikutan pemasukan Cashback/Refund di kantong e-wallet perantara (`dompet`, mis. ShopeePay), bila transaksinya belum punya cashback. Belum ada kantongnya: di kartu, kotak "Buat kantong ShopeePay untuk cashback Rp 15" (bawaan ya) → kantong e-wallet dibuat dengan saldo 0 sejak saat itu (saldonya bisa diatur di Kantong; cashback bertanggal sebelumnya tidak menggeser saldo); di unggah banyak cashback-nya ditunda dan ringkasan menawarkan **Buat kantong ShopeePay & catat**. Transaksi baru dari screenshot (tanpa pasangan) juga menaruh cashback di kantong e-wallet-nya bila ada, selain itu di kantong transaksinya seperti dulu. Edit transaksi dan jawaban draft tidak lagi memindahkan cashback dari kantong e-wallet-nya bila kantong induknya tidak berubah.
11. **Unggah banyak (§7)**: galeri lebih dari satu gambar → semua ke antrean (lembar Catat ditutup); seret-lepas dan gambar Bagikan yang gagal di latar juga lewat antrean. Berurutan, jeda 4 detik antar-panggilan AI (Gemini paket gratis ±15/menit). K3: maks. 50 gambar menunggu di antrean; kelebihannya tidak diproses dan dikabari. Pasti → dilengkapi otomatis (K1); ragu → ditunda ke akhir antrean lalu dikirim lagi tanpa AI dengan urutan jamnya (keputusan 6); masih ragu → draft "sudah tercatat?" (`duplikat_dari` = kandidat terbaik) di Belum selesai, dibuka satu per satu dengan tombol **Lengkapi: …** per kandidat (§4). Ringkasan: snackbar 20 detik "38 struk: 34 melengkapi transaksi, 2 dicatat baru, 2 perlu dicek" (+ "sudah pernah dipakai", "gagal") → **Lihat** → lembar **Hasil unggah**: perlu dicek (**Cek sekarang** → Belum selesai), cashback tertunda, yang dilengkapi dengan **Urungkan** per baris, dicatat baru, sudah dipakai, gagal.
12. **Bagikan di latar (service worker)**: mode yang sama tanpa penundaan (pasti → dilengkapi, ragu → draft dengan push seperti draft lain); tidak ada ringkasan/Urungkan karena aplikasinya mungkin tertutup.
13. **Urungkan**: kolom yang diubah Lengkapi kembali ke nilai lamanya (hanya kolom milik Lengkapi), cashback ikutan yang dibuatnya dihapus, kantong e-wallet yang dibuat untuknya dihapus bila sudah kosong; tanda Perlu dilengkapi kembali.
14. **§4 "Lengkapi yang sudah ada"**: dari draft duplikat yang berasal dari gambar; merchant & keterangan dari gambar baru selalu dipakai, aturan lain seperti keputusan 8; cashback draft jadi ikutan transaksi lama; draft dihapus. Label daftar Belum selesai untuk draft ini "Mungkin sudah tercatat".
15. **API**: `/api/upload-receipt` (field baru `banyak`, `tunda`, `baru`, `hasil`, `peringkat`; `latar` = banyak), `/api/lengkapi` (terapkan), `/api/lengkapi/urungkan`, `/api/lengkapi/kandidat?draft=` (pilihan §4), `/api/lengkapi/cashback` (cashback tertunda). `hasil` adalah hasil baca yang sudah dirapikan server (dirapikan & divalidasi ulang, voucher tidak dikurangkan dua kali); dipakai juga E2E untuk menyuntik hasil AI.
16. **Deposito manual "Sudah termasuk" (SPEC-impor-rekening)**: baris penempatan ditautkan ke pindah kantong pembuatan deposito (kantong induk → deposito, nominal sama, tanggal berapa pun, yang tanggalnya paling dekat), bukan pindah kantong kedua. Tanggal pindah kantongnya tetap tanggal pembuatan.

## Hasil uji (7 Nov 2026)

- `uji:lengkapi` lulus (hasil baca & voucher, rekening tujuan, nominal net vs total, struk ≥ 22.00 ke baris sehari sebelumnya, kantong perantara/sumber/Saldo ShopeePay/paylater/deposito, isi & tarik saldo, sumber sejenis, jam terdekat, urutan rekening vs jam tetangga, peringkat unggah banyak, isian diubah/tidak, screenshot lalu struk, §4 paksa, usulan pecah, cashback ke ShopeePay, pengenal bukti & nama berkas, penempatan deposito manual).
- Eval AI sungguhan atas 3 gambar BUATAN (`npm run eval:lengkapi`, Gemini): "Rincian Pembayaran" dengan promo & cashback, "Rincian Transfer Bank" (sumber SeaBank, admin "Gratis"), struk minimarket dengan voucher: 21/21 cek lulus — "Kamu Membayar" Rp 32.500 (bukan total Rp 52.500), sumber dana SeaBank, e-wallet ShopeePay, cashback Rp 15, Order SN; transfer: penerima, rekening tujuan (model menulis "BCA …67890", dirapikan kode jadi "BCA …7890"), Order SN bukan No. Referensi, admin "Gratis" bukan biaya; struk: voucher Rp 5.500 → Rp 12.000, jam 22.15, sumber dana kosong (hanya QRIS), nomor bon.
- E2E `lengkapi` lulus: rekening koran buatan diimpor → kartu Lengkapi → isi berubah, nominal/tanggal/kantong tetap, Perlu dilengkapi hilang, cashback ke kantong ShopeePay yang dibuat; gambar sama & Order SN sama → sudah dipakai; seret 3 gambar → "3 struk: 3 melengkapi transaksi", sebayar setanggal mengikuti urutan rekening, Urungkan; Catat sebagai baru → duplikat → Lengkapi yang sudah ada.

## Belum diterapkan

- UAT dengan data asli user (dijalankan user sendiri).
- Kartu dengan beberapa kandidat menampilkan daftar perubahan untuk kandidat pertama saja.
- Draft "sudah tercatat?" dari pasangan ragu tidak menyimpan sumber dana/e-wallet hasil bacanya: pilihan kandidat saat dibuka dari Belum selesai memakai kantong mana pun.
- Bagikan di latar: tanpa ringkasan & Urungkan; cashback yang kantong e-wallet-nya belum ada tidak dicatat.
- Screenshot paylater (SPayLater) tetap jalur rencana cicilan (SPEC-paylater), tidak dicocokkan.
