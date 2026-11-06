# Spec: Lengkapi transaksi dari screenshot & struk, unggah banyak gambar

Status: **disetujui** (implementasi menunggu aba-aba user) · 6 November 2026 · branch `feat/impor-rekening` · pasangan [SPEC-impor-rekening](SPEC-impor-rekening.md)

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
  - **tanggal**: screenshot sama; struk sama atau +1 hari bila jam struk ≥ 22.00;
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

- **Unit** (`uji:lengkapi`): `cariPasangan` (nominal net vs total, tanggal +1 hari ≥ 22.00, kantong perantara, kandidat ganda dengan urutan jam, sumber sejenis tidak dobel), isian yang diubah/tidak diubah, cashback ke kantong ShopeePay, pengenal bukti ganda.
- **Eval AI** (AI sungguhan, gambar contoh buatan bukan data user): screenshot "Rincian Pembayaran" dengan promo & cashback, "Rincian Transfer Bank" (sumber dana SeaBank), struk dengan voucher.
- **E2E** (`lengkapi`): transaksi hasil impor disuntik → unggah gambar (hasil AI disuntik, tanpa AI) → kartu Lengkapi → isi berubah, nominal tetap; unggah banyak → ringkasan; duplikat → "Lengkapi yang sudah ada".
- **UAT dengan data asli user** (lokal, akun uji sementara, dihapus sesudahnya): impor rekening koran SeaBank Sep 2026 → unggah screenshot ShopeePay & struk Alfamart September → cek angka kecocokan mendekati survei (92/92, 36/36).

## Boundaries

- Nominal, tanggal, dan kantong dari rekening koran tidak pernah diubah oleh screenshot/struk tanpa persetujuan user.
- Data asli user tidak masuk repo, tes otomatis, atau log.

## Belum diterapkan

Seluruh spec ini (implementasi menunggu aba-aba user).
