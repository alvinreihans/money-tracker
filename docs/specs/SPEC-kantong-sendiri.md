# Spec: Uang antar kantong sendiri, kantong yang belum ada, dan impor yang belajar

Status: **diterapkan, belum dirilis** (K1–K5 diputuskan/dijelaskan user 8 Nov; disetujui user 8 Nov; tahap 1 — impor, RPC, API — dan tahap 2 — catat/obrolan, kartu, layar awal — selesai 8 Nov) · 8 November 2026 · branch `feat/kantong-sendiri` · dikerjakan **sebelum** [SPEC-asisten-agen](SPEC-asisten-agen.md) (P7 di sana) · menyentuh [SPEC-catat-tuntas](SPEC-catat-tuntas.md) (arah), [SPEC-impor-rekening](SPEC-impor-rekening.md), [SPEC-lengkapi](SPEC-lengkapi.md), [SPEC-ingat-kategori](SPEC-ingat-kategori.md), [SPEC-paylater](SPEC-paylater.md)

## Masalah

Dari pemakaian user (8 Nov 2026): impor rekening koran BRI, lalu screenshot DANA dan struk. Contoh di bawah **rekaan**; polanya dari data user.

| # | Kejadian | Hasil sekarang | Seharusnya |
|---|---|---|---|
| A1 | Rekening koran BRI: "Top Up DANA 08xx… <nama tersamar> via BRImo", kantong DANA belum ada | Pengeluaran Lainnya, Perlu dilengkapi | Pindah kantong BRI → DANA, dengan tawaran membuat kantong DANA |
| A2 | Screenshot DANA "Receive Money from GoPay/Jago". User mengetik "kantong GoPay" / "bank jago" | "Pakai kantong apa?" diulang terus dengan pilihan BRI / Dana. Tidak ada jalan keluar | Tawaran **+ Buat kantong GoPay** |
| A3 | Kantong DANA dibuat belakangan | Top up dari BRI yang sudah tercatat tetap pengeluaran | Ditawarkan diubah jadi pindah kantong |
| B1 | Screenshot DANA "Send Money to <nama user> – JAGO ••1234" | "Ini uang keluar atau masuk?" tanpa pilihan pindah. Jawaban "Aku kirim" → **pengeluaran** | Dikenali sebagai pindah DANA → Jago (namanya nama user, nomornya rekening Jago user) |
| B2 | "Receive Money from PT Bank Jago" / "from GoPay" | Pemasukan kategori **Pemberian** | Pindah dari kantong Jago/GoPay, atau ditanyakan |
| B3 | Screenshot DANA "Top Up via Agent (ALFAMART)" | "Pakai kantong apa?" (ambigu), merchant Alfamart | Pindah **Tunai → DANA**; pertanyaannya "Uangnya dari kantong mana?" |
| C1 | Rekening koran bulan berikutnya: gaji dari pemberi kerja (BI-Fast), tagihan wifi lewat BRIVA | Lainnya + Perlu dilengkapi tiap bulan, padahal bulan lalu sudah Gaji / Tagihan | Kategori diingat dari bulan sebelumnya |
| C2 | Jago "Pembayaran dengan Jago Pay", GoPay GO-RIDE | Judul "GoPay 0220260527…" (kode referensi) | Judul "GoPay · GO-RIDE", kategori Transportasi |
| D1 | Struk bayar tagihan SPayLater | Pengeluaran Tagihan dari ShopeePay + keterangan "Rencana cicilan 'SPayLater' belum dicatat" | Terhubung ke rencana cicilan / utang SPayLater |
| E1 | Layar awal: tidak memilih bank/e-wallet apa pun (dan belum punya kantong), lalu Lanjut | Langkah "Berapa saldonya sekarang?" tetap tampil, isinya hanya kotak kosong | Langkah saldo dilewati bila tidak ada kantong yang ditanyakan |

### Penyebab (dari kode)

- **A, tidak ada jalan membuat kantong.** Pertanyaan `kantong` / `kantong_tujuan` hanya menerima kantong yang ada. Jawaban yang tidak cocok → 422 → pertanyaan dibuka lagi tanpa batas (`api/draft/[id]/jawab/route.ts` jenis `kantong`; `Obrolan.tsx` saat galat). Satu-satunya jalur membuat kantong dari obrolan adalah kartu kredit (`kartu` + "tambah").
- **A, impor.** `kantongLawan` (`rencana.ts`) hanya mencocokkan kantong yang sudah ada. Kantong baru hanya untuk rekening yang rekening korannya diimpor.
- **A3.** Tidak ada penautan ulang saat kantong dibuat di luar impor. Pola R2 (`ubah_pindah`) hanya jalan di impor dan butuh `nomor_akhir`, yang hanya diisi impor.
- **Daftar pilihan kantong** di obrolan adalah snapshot server saat halaman dimuat. Kantong yang baru dibuat tidak muncul sampai halaman dimuat ulang.
- **B1.**
  - Pilihan "Pindah antar rekeningku" hanya muncul bila **kedua** bank sudah cocok dengan kantong (`Obrolan.tsx` `pilihanArah`).
  - `rekening_tujuan` ("JAGO …1234") terbaca, tapi tidak pernah dibandingkan dengan `nomor_akhir` kantong.
  - **Nama pemilik dari rekening koran** (`pemilik` di parser BRI/Jago/SeaBank) tidak pernah disimpan ke `nama_rekening`, jadi bukti transfer ke diri sendiri tidak dikenali sampai user menjawab sekali.
- **B2.** Prompt ekstraksi: uang yang "dikirim orang lain" = pemasukan, petunjuk `gift`. "Receive Money from <bank/e-wallet>" tidak punya nama orang, jadi tidak lewat logika arah.
- **B3.** Top up e-wallet = `transfer`, sumber dana "Alfamart" tidak cocok dengan kantong mana pun. Kalimat "Pakai kantong apa?" tidak menyebut bahwa yang ditanya adalah sumbernya.
- **C1.** Impor tidak memakai ingat kategori. `transaksiBaru` (`rencana.ts`) selalu mengisi `other` + `perlu_dilengkapi` untuk golongan bayar/transfer/lain (keputusan 12 SPEC-impor-rekening).
- **C2.** `jago.ts` `jadiBaris`: kode referensi yang mengandung huruf tidak cocok dengan pola nomor, jadi ikut masuk `pihak.nama` → merchant.
- **D1.**
  - Sebutan cicilan dari AI ("SPayLater") tidak dibakukan. `pilihCicilan` butuh nama persis, sedangkan penyedia rencana dibakukan jadi "Shopee PayLater".
  - Impor hanya mencocokkan potongan nama kantong (`kantongPaylater`) dan tidak pernah menaut ke rencana cicilan (Belum diterapkan di SPEC-impor-rekening).
- **E1.** `MulaiView.tsx` langkah 2 selalu ditampilkan walau `daftarSaldo` kosong (kantong yang ada + yang dipilih di langkah 1): yang tersisa hanya bingkai `blokForm` tanpa kolom. Selain itu label kolom disembunyikan selama kolom kosong (nama kantong hanya di placeholder). E-wallet dari layar awal tersimpan dengan `kind` bawaan `bank` dan tanpa `nomor_akhir`, sehingga impor berikutnya tidak bisa memetakannya otomatis.

## Usulan perilaku

### A. Kantong yang belum ada bisa dibuat di tempat

**A-1. Catat (obrolan).** Pertanyaan **"Pakai kantong apa?"**, **"Uangnya dari kantong mana?"** (B3), dan **"Pindah ke kantong mana?"** mendapat pilihan tambahan **+ Buat kantong <nama>**:
- `<nama>` diambil dari yang terbaca: sumber dana / dompet / bank pengirim atau penerima, sesuai yang ditanya. Pilihan ini muncul hanya bila nama itu belum cocok dengan kantong mana pun.
- Jawaban ketik yang tidak cocok dengan kantong mana pun tidak lagi berputar. Balasannya: **"Kantong 'GoPay' belum ada. Buat sekarang?"** dengan pilihan **Buat** / **Pilih yang ada**.
- Jenis kantong ditebak dari nama: daftar e-wallet (DANA, GoPay, OVO, ShopeePay, LinkAja, Flip, Jenius Pay…) → `ewallet`; nama bank (pola `kantongBank`) → `bank`; "tunai"/"cash" → `cash`; selain itu `bank`. Bisa diubah di Profil.
- Saldo awal kantong baru: **K1**.
- Kantong yang baru dibuat **langsung** ada di pilihan kantong obrolan dan form, tanpa muat ulang halaman.

**A-2. Impor rekening koran.**
- Baris transfer/top up ke **e-wallet atau bank milik sendiri** yang kantongnya belum ada → pratinjau menawarkan **"Kantong baru DANA (3 top up dari BRI)"** (tercentang). Tanda milik sendiri: aturan §6 yang sudah ada, yaitu nama pemilik (boleh tersamar) atau 4 digit akhir.
- Bila dicentang, barisnya jadi pindah kantong BRI → DANA. Bila tidak, tetap pengeluaran seperti sekarang.
- Kantong e-wallet baru ini tidak punya rekening koran, jadi saldonya mengikuti **K1**.

**A-3. Penautan ulang saat kantong dibuat.**
- Setiap kali kantong uang dibuat, dari Profil, obrolan (A-1), impor (A-2), atau layar awal, aplikasi mencari **pengeluaran/pemasukan dari rekening koran** yang tampaknya pindah ke/dari kantong itu:
  - nama bank/e-wallet lawan cocok dengan nama kantong, **dan**
  - ada tanda milik sendiri (nama pemilik/tersamar, atau 4 digit akhir = `nomor_akhir` kantong).
- Bila ada: kartu **"3 transaksi lama sepertinya pindah ke DANA. Jadikan pindah kantong?"** dengan daftar ringkasnya. Tombol **Jadikan pindah** / **Biarkan**; sesudahnya snackbar **Urungkan**.
- Sisi lawan yang sudah tercatat (mis. pemasukan di DANA dari screenshot dengan nominal & tanggal sama) **digabung**, bukan dibuat dua (aturan pasangan §6: nominal sama, ±1 hari, jam sama bila ada).
- Satu fungsi server bersama `cariCalonPindah(kantong)` + RPC `jadikan_pindah(jsonb)` (perluasan `ubah_pindah`, `security invoker`). Fungsi yang sama nanti dipakai asisten agen (`usul_jadikan_pindah`).

### B. Uang antar rekening sendiri dikenali

**B-1. Nama pemilik dari rekening koran disimpan.** Setiap impor menggabungkan `pemilik` rekening koran ke `nama_rekening` user (`gabungNama`, maks 5, nama tersamar tidak disimpan). Setelah satu impor, bukti transfer atas nama user langsung dikenali.

**B-2. Nomor rekening tujuan dipakai.**
- `rekening_tujuan` dari gambar ("JAGO ••1234") dibandingkan dengan `nomor_akhir` kantong.
- Bila cocok → itulah kantong tujuannya. Arah = pindah bila pengirimnya juga kantong user.
- Bila nomornya belum dikenal tapi nama penerima = nama user → pindah, dengan tujuan dari nama bank. Bila kantong bank itu belum ada → **+ Buat kantong Jago** (A-1), dan nomornya disimpan ke `nomor_akhir` supaya impor rekening koran Jago nanti langsung terpetakan.

**B-3. Pilihan "Pindah antar rekeningku" selalu ada** di pertanyaan arah (bukti transfer dua pihak), bukan hanya bila kedua bank sudah dikenal. Bila dipilih dan salah satu kantong belum ada → A-1.

**B-4. "Receive Money from <bank/e-wallet>"** (pengirimnya lembaga, bukan nama orang):
- Prompt ekstraksi: uang masuk ke e-wallet dari **bank atau e-wallet** (bukan nama orang) dibaca sebagai **calon pindah kantong**: `type: transfer`, `payment_method` = bank/e-wallet pengirim, `payment_target` = e-wallet penerima. Bukan `gift`.
- Bila kantong pengirim ada → pindah, tanpa ditanya. Bila belum ada → **"Uang dari Jago ini dari rekeningmu sendiri?"** dengan pilihan **Ya, pindah dari Jago** (+ buat kantong bila perlu) / **Bukan, pemasukan**.
- Pengecualian: cashback, refund, dan bunga dari e-wallet itu sendiri tetap pemasukan/ikutan seperti sekarang.

**B-5. Top up lewat agen** (Alfamart, Indomaret, kasir):
- Dibaca sebagai pindah **Tunai → e-wallet**. Merchant tidak diisi nama toko; nama toko masuk keterangan ("Top up lewat Alfamart").
- Bila kantong Tunai tidak ada → ditanyakan dengan kalimat **"Uangnya dari kantong mana?"** + **+ Buat kantong Tunai**.

**B-6. Kalimat pertanyaan untuk pindah kantong.** Untuk transaksi `transfer`, "Pakai kantong apa?" diganti **"Uangnya dari kantong mana?"**, dan "Pindah ke kantong mana?" tetap.

**B-7. Screenshot sisi lawan menaut, tidak mencatat baru.**
- Screenshot uang masuk di DANA yang cocok dengan **pengeluaran top up dari rekening koran** di kantong lain (nominal sama, ±1 hari, tanda milik sendiri) → kartu Lengkapi **"Jadikan pindah BRI → DANA"**. Pengeluaran itu diubah, tidak dibuat transaksi baru.
- Sama untuk kebalikannya: screenshot kirim dari DANA cocok dengan pemasukan di rekening koran Jago.
- Memakai `jadikan_pindah` (A-3).

### C. Impor rekening koran belajar dari bulan sebelumnya

**C-1. Ingat kategori dipakai saat impor.**
- Untuk baris bayar/transfer/lain, merchant (nama pihak) dicocokkan dengan ingatan kategori (`ingatKategori`, `src/lib/ingat.ts`: transaksi terkonfirmasi 365 hari terakhir, bukan Lainnya, `merchantSama`).
- Bila ada → kategori diisi, kelompok mengikuti kategori. Perlakuan "Perlu dilengkapi": **K2**.
- Pratinjau menyebut jumlahnya: "· 2 berkategori dari bulan lalu".
- Pindah kantong dan pinjaman tidak terpengaruh.

**C-2. Kode referensi tidak jadi judul.**
- Di parser Jago (dan pembersih merchant umum untuk rekening koran), token mirip kode referensi dibuang dari merchant dan disimpan di keterangan. Contoh: ≥ 10 karakter dengan campuran angka dan huruf, `#RB-…`, `ID-1`.
- Pembayaran Jago Pay ke GoPay: merchant **"GoPay · GO-RIDE"** (layanan dari rincian: GO-RIDE, GO-CAR, GO-FOOD, GO-SEND, GO-MART…).
- Kategori dari layanan, aturan kecil tetap: GO-RIDE/GO-CAR → Transportasi; GO-FOOD → Makan; GO-SEND → Lainnya; GO-MART → Belanja. Ini didahulukan sebelum ingat kategori, dan ingat kategori boleh menimpanya bila user pernah mengubah.
- QRIS BRI tanpa nama toko: tidak berubah (dilengkapi lewat struk).

### D. SPayLater / SPinjam

**D-1. Sebutan dibakukan.** Sebutan cicilan dari AI dibakukan dengan pembaku yang sama dengan `paylater.penyedia`: "SPayLater" / "Shopee PayLater" / "ShopeePay Later" → **Shopee PayLater**; "SPinjam" → **SPinjam**; GoPayLater, Kredivo, Akulaku, dst. `pilihCicilan` dan `kantongPaylater` (impor) membandingkan nama yang sudah dibakukan, dua arah.

**D-2. Bayar tagihan paylater.** Struk/screenshot bayar tagihan SPayLater:
- **Satu** rencana cicilan Shopee PayLater yang berjalan → ditautkan (cicilan ke-n), seperti sekarang.
- **Beberapa** → ditanya "Cicilan yang mana?" dengan pilihan rencana.
- **Tidak ada** → tidak lagi hanya keterangan: pindah ke kantong utang paylater (D-4).

**D-3. Impor rekening koran.**
- Baris SPayLater/SPinjam memakai pembaku D-1.
- Bila ada rencana cicilan penyedia itu dengan cicilan yang jatuh tempo di sekitar tanggal baris (± 7 hari) dan nominalnya sama → ditautkan ke cicilan itu (`cicilan_id`, nomor), bukan pengeluaran biasa.
- Selain itu pindah ke kantong utang penyedianya (D-4). Ini menutup butir SPinjam/SPayLater di Belum diterapkan SPEC-impor-rekening.

### E. Layar awal: saldo kantong

- **E-0.** Bila tidak ada kantong yang saldonya ditanyakan (belum punya kantong dan tidak memilih apa pun di langkah 1), langkah "Berapa saldonya sekarang?" **dilewati**: Lanjut dari langkah 1 langsung ke "Siap mencatat!", Kembali dari sana ke langkah 1, dan titik langkah menyesuaikan.
- **E-1.** Tiap kolom saldo selalu menampilkan labelnya ("🏦 BRI", "👛 DANA") di atas kolom, juga saat kosong, dengan awalan "Rp". Placeholder "0".
- **E-2.** Kantong e-wallet yang dipilih di layar awal disimpan dengan `kind = 'ewallet'` (sekarang `bank`), tunai `cash`.
- **E-3.** Impor rekening koran: rekening yang belum terpetakan dicocokkan otomatis ke kantong **bank** bernama sama yang belum punya `nomor_akhir`, bila hanya ada satu. Lalu `nomor_akhir` diisi. Ini menghindari kantong ganda "BRI" dan "BRI …5678".

## Data

- RPC `jadikan_pindah(jsonb)` (perluasan `ubah_pindah`; dipakai A-3, B-7, nanti asisten). Ketentuannya:
  - `security invoker`; `revoke public, anon`; `grant authenticated`;
  - hanya transaksi milik user, berjenis expense/income, belum punya kantong tujuan;
  - gagal bila sudah berubah sejak ditampilkan;
  - mengembalikan data untuk Urungkan.
- RPC `urungkan_jadikan_pindah(jsonb)`.
- `user_metadata.nama_rekening` diisi dari impor (B-1). Tanpa kolom baru.
- `user_accounts.nomor_akhir` boleh diisi dari gambar (B-2) dan pemetaan otomatis (E-3): `grant update (nomor_akhir)` bila belum.
- Tanpa tabel baru.

## Pengujian

- **Unit:**
  - `cariCalonPindah` (nama + tanda milik sendiri, nomor, tanpa tanda → tidak; sisi lawan digabung);
  - tebakan jenis kantong dari nama;
  - pembaku paylater (D-1);
  - pembersih kode referensi & layanan GoPay (C-2);
  - ingat kategori saat impor (C-1, termasuk Lainnya tidak diingat);
  - arah dengan `rekening_tujuan` & nama pemilik dari impor (B-1–B-3);
  - "Receive Money from <lembaga>" (B-4) dan top up agen (B-5) dari hasil baca tiruan;
  - pemetaan otomatis rekening ke kantong tanpa nomor (E-3).
- **RPC:** `jadikan_pindah` atomik + Urungkan; `uji:isolasi` (tidak bisa menyentuh transaksi/kantong akun lain).
- **AI sungguhan (`eval-lengkapi` / ekstraksi):** screenshot rekaan "Receive Money from Bank X", "Send Money to <nama> – BANK ••1234", "Top Up via Agent", bayar tagihan SPayLater → jenis & isian sesuai B-4/B-5/D-2.
- **E2E (rekening koran & gambar buatan):**
  - impor BRI dengan top up DANA tanpa kantong → tawaran kantong baru → pindah;
  - buat kantong DANA belakangan → kartu "jadikan pindah" → Urungkan;
  - obrolan: ketik kantong yang belum ada → Buat → langsung ada di pilihan;
  - bukti kirim ke diri sendiri → pindah tanpa ditanya keluar/masuk;
  - rekening koran bulan kedua → kategori dari bulan pertama;
  - layar awal: tanpa pilihan & tanpa kantong → langkah saldo dilewati (maju & mundur); label tampil; e-wallet berjenis e-wallet;
  - 360px & 1024px.
- **UAT data asli user** (lokal, akun uji sementara, laporan agregat saja): impor BRI + Jago + SeaBank, lalu screenshot DANA/ShopeePay dan struk:
  - tidak ada pengeluaran "top up" ke kantong sendiri;
  - saldo semua kantong bank sama dengan rekening koran;
  - kategori bulanan berulang terisi.

## Keputusan user (8 Nov 2026)

| # | Pertanyaan | Keputusan |
|---|---|---|
| K1 | Saldo awal kantong yang dibuat di tempat | **(a)** Rp 0 sejak transaksi pertamanya, lalu sekali ditawari "Saldo <kantong> sekarang berapa?" (boleh dilewati) sesudah obrolan/impor itu selesai |
| K2 | Kategori dari ingatan saat impor | **(a)** tanda "Perlu dilengkapi" tidak dipasang |
| K3 | Cara mencatat paylater | **(b)** satu kantong utang per penyedia (mis. "Shopee PayLater", jenis `kredit`), seperti kartu kredit. Rincian di D-4 |
| K4 | Penautan ulang (A-3) | **Hanya transaksi dari rekening koran** dulu |

### D-4. Kantong utang paylater (K3 = b)

- **Bayar tagihan** paylater (struk/screenshot/rekening koran) tanpa rencana cicilan yang cocok → **pindah kantong** dari kantong sumber (mis. ShopeePay/SeaBank) ke kantong utang **"Shopee PayLater"**. Bila kantong itu belum ada → **+ Buat kantong Shopee PayLater** (jenis `kredit`, saldo awal Rp 0 per K1; sesudahnya ditawari "Utang Shopee PayLater sekarang berapa?").
- **Belanja** dengan paylater:
  - tenornya disebut/terbaca → rencana cicilan seperti sekarang (SPEC-paylater);
  - tidak disebut → **pengeluaran dari kantong utang** itu, tanpa ditanya tenornya. Utangnya bertambah, seperti belanja dengan kartu kredit.
- Kantong utang paylater tampil bersama kartu kredit di Utang & Piutang. Sisa tagihan = saldo minusnya.
- Impor rekening koran (D-3): baris bayar SPayLater/SPinjam tanpa cicilan yang cocok → pindah ke kantong utang penyedianya (pembaku D-1). Bila belum ada → tawaran kantong baru di pratinjau (pola A-2).
- SPinjam (pinjaman tunai) memakai kantong utang **"SPinjam"** tersendiri, bukan Shopee PayLater.

## Pertanyaan terbuka

- **K1 (terjawab). Saldo awal kantong yang dibuat di tempat** (A-1/A-2), terutama e-wallet tanpa rekening koran:
  - (a) Rp 0 sejak transaksi pertamanya, lalu ditawari "Saldo DANA sekarang berapa?" (boleh dilewati) supaya total aset benar;
  - (b) langsung ditanya saldonya saat dibuat;
  - (c) Rp 0, tanpa tanya.

  *Usulan: (a).* Pertanyaannya muncul sekali sesudah semua transaksi di obrolan/impor itu selesai, dan "sekarang" berarti saldo saat ini (pola `saldo_sejak` = sekarang).
- **K2 (terjawab). Kategori dari ingatan saat impor (C-1): tetap "Perlu dilengkapi"?**
  - (a) Tidak. Kategorinya sudah terisi, jadi tanda hilang.
  - (b) Tetap ditandai sampai dilengkapi gambar.

  *Usulan: (a)* untuk transfer berulang (gaji, tagihan) yang memang tidak punya struk. Merchant tetap dari rekening koran dan bisa dilengkapi kapan saja.
- **K3 (terjawab). Paylater tanpa rencana cicilan** (D-2/D-3): bagaimana SPayLater sebaiknya dicatat?
  - (a) Seperti sekarang di SPEC-paylater: tiap belanja jadi rencana cicilan sendiri. Bayar tagihan tanpa rencana → ditawari "Buat rencana cicilan?" (nominal, tenor).
  - (b) Satu **kantong utang "Shopee PayLater"** seperti kartu kredit: belanja paylater menambah utangnya, bayar tagihan = pindah kantong ke sana. Lebih cocok dengan rekening koran, yang hanya memuat pembayaran tagihan, dan dengan alur kartu kredit yang sudah ada.

  *Usulan: (b)*, dengan rencana cicilan tetap bisa dipakai bila user mencatat belanjanya per cicilan.
- **K4 (terjawab). Penautan ulang otomatis (A-3) juga untuk transaksi lama yang dicatat dari gambar/ketikan,** bukan hanya dari rekening koran? *Usulan: hanya rekening koran dulu* (angkanya pasti). Yang dari gambar/ketikan masuk daftar asisten agen nanti.
- **K5 (terjawab).** Screenshot layar awal: muncul saat tidak memilih bank/e-wallet apa pun → E-0.

## Temuan UAT (8 Nov 2026, data asli lokal, laporan agregat)

UAT bagian rekening koran & layar awal: E-0–E-3, A-2, A-3, C-1, D-3, regresi deposito & R2 lulus. Bagian screenshot (A-1, B-2–B-7, D-2/D-4) belum diuji: unggahan gambar asli ke AI diblokir sistem izin alat pengembang; user akan mencobanya sendiri setelah rilis.

| # | Temuan | Seharusnya | Keputusan user |
|---|---|---|---|
| U1 | Kantong bank yang dibuat di tempat (tawaran A-2, mis. "Kantong baru SeaBank" dari transfer di rekening koran Jago; saldo Rp 0 sejak transaksi pertama, K1) lalu rekening koran banknya sendiri diimpor: rekeningnya terpetakan ke kantong itu (4 digit), tapi saldo awal tetap Rp 0 → "Saldo akhir tidak sama", baru cocok bila "Samakan" dicentang. | Kantong yang **belum pernah** menerima rekening koran banknya sendiri mengambil saldo awal dari rekening koran pertamanya (saldo awal bank pada awal periode, `saldo_sejak` = awal periode), sama seperti kantong yang dibuat oleh impor. Transaksi yang sudah ada di kantong itu (pindah kantong dari bank lain) tetap, dan bertaut/berpasangan dengan baris bank seperti biasa. Tanpa peringatan dan tanpa perlu Samakan. Pratinjau menyebutnya: "Saldo awal SeaBank diambil dari rekening koran ini". Bila user sudah mengisi saldo sendiri (pertanyaan K1 dijawab, atau diubah di Profil), saldo itu **tidak** ditimpa; perilaku lama (peringatan + Samakan) berlaku. | **Diperbaiki** (butir 25; migrasi `20261120000000_saldo_sementara.sql`) |
| U2 | Judul pembayaran Jago Pay ke GoPay **tanpa** layanan GO-… masih menyisakan potongan kode referensi di ujung ("GoPay …ID-1"). | Potongan sisa kode (mis. `…ID-1`, akhiran pecahan kode yang terpotong baris) ikut dibuang: judul "GoPay". | **Diperbaiki** (butir 26) |
| U3 | Top up e-wallet lewat Jago Pay ("GoPay Top up") tetap pengeluaran walau kantong GoPay sudah ada, karena tidak ada tanda milik sendiri (nama/nomor). | **Top up** (bukan pembayaran) ke e-wallet yang **kantongnya sudah ada** dianggap pindah kantong ke kantong itu walau tanpa tanda milik sendiri. Pembayaran ke e-wallet (merchant lewat GoPay/ShopeePay) tetap pengeluaran. Top up ke e-wallet yang kantongnya belum ada tetap butuh tanda milik sendiri untuk tawaran kantong baru (A-2). | Dianggap pindah · **Diperbaiki** (butir 27) |

## Keputusan saat implementasi

Tahap 1 (8 Nov 2026): migrasi, pustaka bersama, impor rekening koran, API penautan ulang. Tahap 2 (8 Nov 2026): A-1, B-2–B-7, D-2, D-4 sisi catat, kartu "Jadikan pindah", E-0–E-2 (butir 13–24).

1. **Migrasi `20261118000000_kantong_sendiri.sql`.** `impor_rekening` = versi 20261117 ditambah kolom `kelompok`, `cicilan_id`, `cicilan_ke` di `sisip[]`, dan hasil `kantong_baru: { kunci: id }` (untuk pertanyaan saldo K1). `grant update (nomor_akhir)` sudah ada sejak 20261112; diulang (idempoten).
2. **`jadikan_pindah(p)`** — `p = { ubah: [{ id, updated_at, kantong_lawan, merchant, gabung: { id, updated_at } | null }] }`. Syarat baris: milik sendiri (view RLS), `status = confirmed`, `source = statement` (K4), expense/income, tanpa kantong tujuan / `ref_bank_tujuan`, bukan ikutan/cicilan/pecahan, dan `updated_at` sama dengan saat ditampilkan; `kantong_lawan` kantong uang sendiri (bank/ewallet/cash) selain kantongnya. Pengeluaran → pindah kantongnya → lawan; pemasukan → pindah lawan → kantongnya. `gabung` = sisi lawan di `kantong_lawan` (jenis berlawanan, nominal sama, sumber apa pun) → dihapus; `ref_bank`-nya, jam & keterangannya (bila kosong) pindah ke pindah kantong. Kategori Lainnya, kelompok kosong, tanda Perlu dilengkapi hilang. Hasil `{ n, salinan }`; galat `22023` "Transaksinya sudah berubah sejak ditampilkan. Muat ulang dulu." Semua atau tidak sama sekali.
3. **`urungkan_jadikan_pindah(p)`** — `p = { salinan }` dari hasil di atas: pindah kantong dikembalikan ke isian semula (hanya bila `updated_at`-nya masih sama dengan sesudah diubah), sisi lawan dimasukkan lagi dengan id yang sama. Dua kali → ditolak. `updated_at` yang dipakai harus dibaca lewat `select`, bukan balikan `insert` lewat view.
4. **API untuk tahap 2** (kartu "3 transaksi lama sepertinya pindah ke DANA"):
   - `GET /api/kantong/[id]/calon-pindah` → `{ kantong, calon: CalonPindah[], kalimat }` (`src/lib/pindah-server.ts` `muatCalonPindah`; 3.000 transaksi rekening koran terbaru).
   - `POST /api/kantong/pindah` `{ kantong_id, ids? }` → `{ ok, n, salinan }`; calon dihitung ulang di server, klien hanya memilih id. 409 + pesan bila sudah berubah.
   - `POST /api/kantong/pindah/urungkan` `{ salinan }` → `{ ok, n }` (snackbar Urungkan).
   - Fungsi murni di `src/lib/pindah.ts`: `cariCalonPindah(kantong, transaksi, { namaUser })`, `isianJadikanPindah`, `kalimatCalonPindah`, `pihakDariTeks`, dan (diekspor ulang dari `src/lib/lembaga.ts`) `tebakJenisKantong`, `namaLembaga`, `emojiJenis`.
5. **Tanda rekening sendiri di `cariCalonPindah`** dibaca dari merchant & keterangan tersimpan: uraian BRI utuh (`pihakBri`, nama tersamar di "Top Up …"), dan segmen "Bank …1234". Supaya baris Jago tetap bisa dikenali, uraian Jago kini menyertakan bank & 4 digit akhir rekening lawan ("BUDI · Transfer Keluar · Seabank …5555"); baris Jago yang diimpor sebelum ini hanya dikenali lewat nama.
6. **A-2 hanya untuk bank/e-wallet yang dikenal** (`namaLembaga`: daftar e-wallet & bank umum). Nama bank yang tidak dikenal ("Bank Lain", "PT BANK X") tidak ditawarkan jadi kantong — tidak jelas namanya. Bank/e-wallet yang sudah punya kantong (nomor lain) juga tidak ditawarkan. Tanda milik sendiri: aturan §6 yang sama, ditambah `nama_rekening` user (B-1). Nama bentrok dengan kantong lain → "DANA (e-wallet)". Kantong bank baru mengambil 4 digit akhir dari nomor lawan bila tertulis.
7. **Tawaran tidak dicentang** disimpan sebagai `Pilihan.tolakKantong` (bawaan tercentang). Kantong utang paylater (D-3) memakai tawaran yang sama dengan jenis `kredit`, emoji 💳, kunci `baru:lawan:<nama>`. Rencana cicilan dicocokkan lebih dulu (cicilan berikutnya yang belum dibayar, jatuh tempo ± 7 hari terdekat, nominal sama); baris yang sudah dicatat sendiri sebagai pengeluaran (nominal & kantong sama, ± 1 hari) dibiarkan ditautkan seperti biasa.
8. **K1 di impor**: kantong baru bersaldo 0 sejak 00.00 WIB tanggal baris pertamanya; sesudah impor lembar impor menampilkan "Saldo DANA sekarang berapa?" (satu kolom per kantong baru, "Utang … sekarang berapa?" untuk kantong utang, disimpan minus). Simpan = `saldo_awal` + `saldo_sejak = sekarang` (pola layar awal); Lewati = tetap Rp 0.
9. **C-2: kategori dari layanan GoPay** menghapus tanda Perlu dilengkapi bila kategorinya bukan Lainnya (sama dengan K2); GO-SEND tetap Lainnya + Perlu dilengkapi. Layanan dibaca dari semua teks baris (sumber, rincian, catatan). Pembersih kode referensi juga dipakai untuk merchant semua baris rekening koran yang perlu dilengkapi.
10. **C-1** memakai 1.000 transaksi berkategori terakhir setahun (bukan Lainnya, bukan ikutan/cicilan/pecahan), `merchantSama` seperti `ingatKategori`; kelompok ikut untuk pengeluaran. Kategori yang sudah dihapus user tidak dipakai.
11. **E-3** hanya bila tepat satu kantong `bank` bernama sama (nama/alias) tanpa `nomor_akhir` **dan** tepat satu rekening bank itu yang belum dikenal di impor yang sama; selain itu tetap ditanya.
12. **B-1** dijalankan di `/api/rekening/impor` sesudah RPC berhasil (`auth.updateUser`, gagalnya hanya dicatat di log). Nama dianggap tersamar bila ada "*" atau "XX".
13. **Petunjuk kantong tanpa kolom baru** (A-1, B-2, B-4, D-2). Nama kantong yang terbaca tapi belum ada (asal, tujuan, 4 digit rekening tujuan, lembaga pengirim B-4, penyedia cicilan D-2) disimpan sebagai JSON `{ petunjuk: {...} }` di kolom `bukti_transfer` draft (`src/lib/petunjuk.ts`), supaya "+ Buat kantong" tetap ada saat draft dibuka lagi dari "Belum selesai". Bukti transfer sungguhan dikenali dari `pengirim`/`penerima` (`bacaBukti`, `alasanDraft`), jadi petunjuk saja tidak memicu pertanyaan arah. Kolomnya dikosongkan begitu draft selesai.
14. **A-1 di server**: `POST /api/draft/[id]/jawab` menerima `nilai = "buat:<nama>"` untuk `kantong`/`kantong_tujuan` (dan "Ya" di `sendiri`), membuat kantong lewat `buatKantongDiTempat` (`src/lib/pindah-server.ts`): `tebakJenisKantong`, `emojiJenis`, saldo Rp 0 sejak 00.00 WIB tanggal transaksinya (K1), `nomor_akhir` dari rekening tujuan bila bank (B-2); nama yang sudah dipakai (beda huruf) → kantong itu. Balasan membawa `kantong_baru`. Ketikan yang tidak cocok: nama bank/e-wallet/paylater/tunai yang dikenal langsung dijawab 422 `{ error: "Kantong “GoPay” belum ada. Buat sekarang?", buat }` tanpa dibaca ulang AI; ketikan lain dibaca ulang AI seperti dulu, dan bila tetap gagal serta pendek (≤ 3 kata, tanpa angka) juga ditawari dibuat. Nama baru dari teks: `namaKantongBaru` (paylater/bank/e-wallet baku, "Tunai", cara bayar seperti QRIS/Transfer → tidak ditawarkan).
15. **Kantong baru langsung ada di pilihan**: `CatatProvider` menyimpan kantong tambahan (`tambahKantong`) di atas daftar dari server sampai halaman dimuat ulang; obrolan juga memanggil `router.refresh()`.
16. **K1 di obrolan**: sesudah draft yang membuat kantong selesai, obrolan bertanya per kantong "Saldo X sekarang berapa?" (kartu/paylater: "Utang X sekarang berapa?", disimpan minus) sebelum hitung mundur penutup; Simpan = `saldo_awal` + `saldo_sejak = sekarang` (pola impor & layar awal), **Lewati** = tetap Rp 0. Ditanya sekali saat catatan itu selesai, bukan sesudah semua draft di daftar "Belum selesai".
17. **Kartu A-3** (`src/components/CalonPindah.tsx`) dipasang sekali di `CatatProvider` (`periksaPindah(ids)`): antrean kantong, tampil satu per satu hanya bila tidak ada lembar Catat/impor/manual yang terbuka, supaya snackbar Urungkan tidak tertutup dialog. Dipanggil dari Profil (kantong uang baru), obrolan (kantong uang yang dibuat), impor (`periksaPindah` di jawaban `/api/rekening/impor`: kantong uang baru), dan layar awal — yang terakhir lewat `sessionStorage` (`periksa-pindah`), diperiksa begitu aplikasi terbuka, karena /mulai tidak punya CatatProvider.
18. **B-2/B-3 arah**: `tentukanArah(bukti, nama, kantong, rekening_tujuan)` — nomor tujuan = kantong user → pindah bila pengirimnya user (nama, atau tanpa nama dari kantong user lain), selain itu masuk; penerima = nama user tanpa nama pengirim dan bank pengirim kantong user → pindah. `rekening_tujuan` kini juga diisi untuk transfer ke rekening sendiri (prompt) dan dibawa `toTransactionRow`. "Pindah antar rekeningku" selalu ada; kantong yang belum ada ditanyakan berikutnya dengan "+ Buat kantong".
19. **B-4** hanya dari gambar (sumber bukan ketikan): `transfer` yang kantong asalnya belum ada dan asalnya bank/e-wallet yang dikenal (`namaLembaga`) → pertanyaan `sendiri` (jenis tanya baru). "Bukan, pemasukan" → pemasukan kategori Lainnya di e-wallet penerima, merchant = lembaganya. Teks ketikan ("topup gopay dari bca" tanpa kantong BCA) langsung ditanya kantong asalnya dengan "+ Buat kantong BCA".
20. **B-5** juga dijaga di `normalize`: hasil `transfer` yang sumber/merchant-nya toko agen (Alfamart, Alfamidi, Indomaret, Lawson, Circle K) → sumber "Tunai", merchant kosong, keterangan "Top up lewat <toko>".
21. **B-7** dicari di `/api/upload-receipt` sebelum kandidat Lengkapi, hanya untuk satu gambar dari Catat (bukan unggah banyak/latar): bukti `transfer` (atau bukti transfer yang arahnya pindah) dengan kedua kantong ada → pengeluaran rekening koran di kantong asal atau pemasukan di kantong tujuan, nominal sama, ±1 hari, belum pindah kantong (`cariPindahBukti`). Kartu "Jadikan pindah BRI → DANA" memakai `jadikan_pindah` tanpa `gabung` lewat `POST /api/kantong/pindah/bukti`; Urungkan lewat `/api/kantong/pindah/urungkan`. Gambarnya tidak ditandai "sudah dipakai" (pengenal bukti tidak disimpan), supaya Urungkan mengembalikan semuanya.
22. **D-2/D-4 di catat**: `kandidatCicilan` (semua rencana berjalan yang cocok). Satu → ditautkan seperti dulu; beberapa dengan sebutan penyedia saja → draft `cicilan` (jenis tanya baru, "Bayar cicilan Shopee PayLater yang mana?"); sebutan nama barang → yang jatuh tempo terdekat (seperti dulu); tidak ada & sebutannya paylater (`penyediaPaylater`) → pindah kantong ke kantong utang penyedianya (merchant = penyedia), yang belum ada ditawarkan dibuat (jenis `kredit`, 💳); selain itu tetap pengeluaran dengan keterangan "Rencana cicilan … belum dicatat". Belanja paylater tanpa tenor → pengeluaran dari kantong utang (bila nominal terbaca; tanpa nominal tetap draft paylater lama). Draft paylater lama yang menunggu tenor tetap ditanya tenornya. Utang & Piutang menampilkan kantong utang paylater dengan keterangan "Tagihan paylater".
23. **E-0–E-2**: `Field` mendapat `awalan` ("Rp": label selalu tampil, awalan di kiri isian) — juga dipakai kolom saldo kantong baru sesudah impor. Langkah saldo dilewati bila `daftarSaldo` kosong. Kantong baru di Profil juga ditebak jenisnya dari nama (paylater tetap `bank` di Profil; kantong utang dibuat dari obrolan/impor).
24. **Migrasi `20261119000000_jadikan_pindah_ikutan.sql`** (temuan saat tahap 2): `induk_id` berkaskade saat dihapus, dan trigger `ikutan_sesuai_jenis` menghapus cashback (pemasukan Refund) begitu induknya bukan pengeluaran lagi. Jadi `jadikan_pindah` diam-diam menghilangkan ikutan sisi lawan yang digabung dan cashback transaksi yang dijadikan pindah, dan Urungkan tidak mengembalikannya. Kini keduanya dilepas dulu (`induk_id = null`, tetap terhitung di kantongnya), salinan mencatatnya (`lepas`), dan `urungkan_jadikan_pindah` menempelkannya lagi. Biaya admin di transaksi yang jadi pindah kantong tetap menempel.
25. **U1 — penanda `user_accounts.saldo_sementara`** (migrasi `20261120000000_saldo_sementara.sql`, kolom boolean, bawaan false). Diisi true saat kantong dibuat di tempat: tawaran impor A-2/D-3 (`kantong_baru[].saldo_sementara` dari `tanyaSaldo`) dan "+ Buat kantong" di obrolan (`buatKantongDiTempat`). Trigger `saldo_sementara_mati` mematikannya setiap kali `saldo_awal` atau `saldo_sejak` berubah tanpa ikut mengubah penandanya: jawaban K1 (impor & obrolan), ubahan di Profil, Samakan, dan saldo yang diambil dari rekening koran itu sendiri. User hanya boleh mengisinya saat insert (tanpa `grant update`), jadi tidak bisa dihidupkan lagi. Penanda ini dipilih karena saldo Rp 0 saja tidak cukup membedakan "belum diisi" dari "diisi 0", dan `saldo_sejak` jam 00.00 juga dipakai Profil. Di `rencanakan` (bagian 9): rekening utama yang terpetakan ke kantong uang bertanda → `saldo[]` = saldo awal rekening koran paling awal sejak 00.00 WIB awal periodenya (tanpa perlu dicentang), saldo aplikasi dihitung seperti kantong baru dari impor, tanpa `samakan`, dan `saldoDariRekening` → "Saldo awal SeaBank diambil dari rekening koran ini". Transaksi yang sudah ada tetap; yang di dalam periode bertaut dengan baris bank seperti biasa (pindah kantong dari Jago tidak dobel), yang sebelum periode sudah termasuk saldo bank. Sesudah sekali diambil penandanya mati, jadi rekening koran berikutnya kembali ke perilaku biasa. Kantong yang dibuat di layar awal tidak bertanda (saldonya ditanya di sana).
26. **U2** — `bersihkanMerchant`: nama yang diawali nama e-wallet (`namaEwallet`) membuang semua token sesudahnya yang berisi angka tanpa huruf kecil (potongan kode: "02202605", "A1B2", "D4-ID-1"); untuk semua merchant, token akhiran kode `ID-<angka>` (boleh berawalan "…" atau "<kode>-") dan token berawalan "…"/"..." juga dibuang. "Klinik COVID-19" tidak terkena; kata biasa sesudah nama e-wallet ("GoPay Top up") tetap.
27. **U3** — `kantongLawan`: baris uang keluar yang teksnya (nama pihak, uraian, jenis) menyebut "top up"/"isi saldo" dan menyebut e-wallet (`namaEwallet` dari bank, nama pihak, atau uraian) → kantong **e-wallet** (jenis `ewallet`) bernama itu bila sudah ada, tanpa syarat tanda milik sendiri. Pembayaran ("Pembayaran dengan Jago Pay" ke merchant GoPay tanpa kata top up) tetap pengeluaran. Kantong bernama sama yang bukan e-wallet (mis. kantong orang) tidak dipakai. Kantong yang belum ada: tawaran A-2 tetap butuh tanda milik sendiri.

## Belum diterapkan

- Penautan ulang untuk transaksi dari gambar/ketikan (bila K4 = hanya rekening koran).
- Pembacaan rekening koran e-wallet (DANA/ShopeePay/GoPay PDF/CSV), bila suatu saat tersedia.
