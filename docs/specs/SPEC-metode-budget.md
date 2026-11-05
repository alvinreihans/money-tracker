# Spec: Metode budgeting (fase 3)

Status: **diterapkan** · rilis 2.5.0 · 25 Oktober 2026 · branch `feat/metode-budget` · disinkronkan dengan kode 1 Nov 2026

Basis pembagian kemudian diganti SPEC-tujuan-tabungan (penghasilan per bulan, bukan pemasukan bulan itu). Metode tambahan: SPEC-metode-lanjutan. Kelompok tambahan: SPEC-kelompok-baru.

Peta fase: lihat SPEC-catat-tuntas.md. Fase 4 (PETA-fase4) memakainya untuk 6 Jars, Kakeibo, Zero-Based, Pay Yourself First (SPEC-metode-lanjutan) dan Snowball/Avalanche (SPEC-pelunasan).

## Tujuan

User memilih **metode budgeting**: membagi penghasilan per bulan ke beberapa **kelompok** dengan persentase, mis. 50/30/20 (kebutuhan 50%, keinginan 30%, tabungan 20%). Aplikasi lalu menunjukkan realisasinya:
- **Analitik:** "Keinginan Rp 2,9 jt, lewat Rp 500 rb (21%) dari jatah Rp 2,4 jt".
- **Tanya AI:** menjelaskan dengan bahasa metode itu.

Budget per kategori yang sudah ada tetap jadi salah satu pilihan.

## Kelompok

Empat kelompok, satu untuk tiap pengeluaran (sejak 2.8.0 ditambah Pengembangan diri & Tak terduga, SPEC-kelompok-baru):

| Kelompok | Arti | Kategori bawaan |
|---|---|---|
| **Kebutuhan** | yang harus dibayar untuk hidup | Makan, Belanja harian, Transportasi, Kesehatan, Tagihan, Biaya admin |
| **Keinginan** | yang bisa ditunda/dikurangi | Belanja, Hiburan, Lainnya, kategori buatan user yang tidak dikenal |
| **Tabungan & investasi** | uang yang disisihkan | — (lihat cara hitung) |
| **Berbagi** | zakat, sedekah, donasi, hadiah | — |

**Penentuan kelompok tiap transaksi:**
1. **Kelompok bawaan dari kategorinya.** Bisa diubah di Profil → Kategori. Kategori pengeluaran selalu berkelompok; pilihan awal di form kategori baru adalah Keinginan.
2. **Bisa diubah per transaksi**, mis. makan di restoran mewah jadi Keinginan, lewat Edit transaksi → "Kelompok". Bawaannya "Ikut kategori (Kebutuhan)" (nama kelompok kategorinya). Detail transaksi menampilkan kelompoknya, ditambah "(diubah)" bila diubah per transaksi.
3. **AI menyarankan** saat membaca struk/teks, *hanya* bila jelas beda dari bawaan kategorinya (fine dining, kafe premium, tiket konser, liburan → Keinginan; zakat, sedekah, infak, donasi, kado → Berbagi; beli emas, reksadana, saham, deposito → Tabungan). Selain itu `kelompok` null (ikut kategori). User tetap bisa mengubahnya.
4. Pengeluaran tanpa kelompok yang bisa ditentukan dihitung Keinginan.

**Belanja campuran → "Pecah transaksi".** Satu struk bisa berisi kebutuhan dan keinginan sekaligus (minimarket Rp 15 rb: sabun Rp 10 rb + kopi Rp 5 rb). Database menyimpan tiap bagian sebagai baris sendiri, tetapi tampilannya **tetap satu transaksi**. Dengan begitu user tidak mengira terunggah dua kali lalu menghapus salah satu bagiannya.

- **Data.**
  - Transaksi aslinya menjadi bagian pertama dan `id`-nya tetap.
  - Bagian lain adalah baris sendiri dengan `pecahan_dari = id transaksi asli`.
  - Tanggal, jam, `created_at`, kantong (asal & tujuan), metode bayar, merchant, jenis, dan status sama; nominal, kelompok, kategori, dan keterangan sendiri-sendiri.
  - Jumlah nominal semua bagian = nominal semula, jadi **saldo tidak berubah**.
  - Total, filter Riwayat, Analitik, dan Tanya AI menghitung per baris, tanpa aturan khusus untuk nominal sebagian.
  - Sengaja **bukan** `induk_id`: kolom itu milik cashback/biaya admin dan sudah punya aturan sendiri di banyak tempat.
  - Hanya untuk pengeluaran: tombolnya hanya ada di detail transaksi berjenis pengeluaran.
- **Tampilan.**
  - **Riwayat & Beranda:** satu kartu "Alfamart **Rp 15.000**" dengan keterangan "{tanggal} · 2 bagian · {kantong}".
  - **Detail:** nominal = total semua bagian. Baris Kategori, Kelompok, dan Keterangan disembunyikan, diganti bagian **Rincian**: per bagian, judul = keterangannya (atau nama kategori), sub "Kebutuhan · Belanja harian", nominal di kanan.
  - **Pecah transaksi / Atur pecahan** (lembar penuh): tiap bagian punya Nominal, Kategori, Kelompok ("Ikut kategori (…)" atau salah satu kelompok), dan Keterangan.
    - Belum dipecah: bagian 1 = transaksi ini dengan total penuh, bagian 2 kosong.
    - Mengetik nominal bagian 2 dst. membuat bagian 1 menampung sisanya. "Tambah bagian" terisi selisihnya; bagian 2 dst. bisa dihapus.
    - Penanda "Jumlah Rp X ✓" / "Kurang Rp X dari total Rp Y" / "Lebih Rp X dari total Rp Y". Simpan ditolak bila ada bagian tanpa nominal atau jumlahnya ≠ total.
    - **Gabungkan lagi jadi satu** (dengan konfirmasi): bagian lain dihapus, transaksi asli kembali ke total dengan kategori & kelompok bagian pertama.
  - **Edit transaksi** yang dipecah menyembunyikan jenis, nominal, kategori, kelompok, cashback, dan keterangan; isian yang tersisa (tanggal, jam, merchant, kantong) ikut ke semua bagian.
  - **Saat disaring** (kelompok Keinginan, kategori Makan, cari "kopi"), bagian yang cocok tampil sendiri dengan nominalnya dan baris "Bagian dari Rp 15.000"; mengetuknya membuka transaksi aslinya. Bila transaksi aslinya juga cocok, bagian lain disembunyikan di bawah kartu aslinya.
- **Aman dihapus & diubah.**
  - Menghapus transaksi menghapus **semua bagiannya** (`on delete cascade`). Urungkan mengembalikan semuanya.
  - Mengubah tanggal, jam, kantong (asal & tujuan), metode bayar, merchant, jenis, atau status di transaksi asli ikut ke semua bagian (trigger, seperti cashback). `created_at` hanya disalin saat bagian dibuat.
- **Ekspor CSV:** tetap satu baris per bagian (yang dibutuhkan spreadsheet), ditambah kolom **Kelompok** dan **Pecahan**. Pecahan = 8 karakter pertama id transaksi asli, sama untuk asli & semua bagiannya; kosong bila tidak dipecah.
- **Lewat Catat juga bisa:** "15rb di indomaret, 10rb sabun 5rb kopi" dibaca AI menjadi satu transaksi dengan dua bagian (isian `rincian`, lihat Keputusan 6).
- **Struk berisi daftar barang:** AI *menawarkan* pecah, tidak langsung memecah. Diterapkan di SPEC-tawar-pecah (2.8.0).

**Tabungan dihitung dari sisa:** `penghasilan per bulan − pengeluaran selain kelompok Tabungan` (minimal 0).
- Uang yang tidak dibelanjakan dianggap tersimpan.
- Pengeluaran yang memang tabungan (beli emas, reksadana) dikelompokkan Tabungan, jadi tidak mengurangi realisasinya.
- Pindah kantong (mis. ke rekening tabungan) bukan pengeluaran, jadi otomatis sudah termasuk.

## Metode

| Metode | Pembagian |
|---|---|
| **Per kategori** (sekarang) | target rupiah per kategori, seperti halaman Budget saat ini |
| **50/30/20** | Kebutuhan 50 · Keinginan 30 · Tabungan 20 (Berbagi dihitung di Kebutuhan) |
| **80/20** | Pengeluaran 80 (kebutuhan + keinginan + berbagi) · Tabungan 20 |
| **70/20/10** | Biaya hidup 70 (kebutuhan + keinginan) · Tabungan 20 · Berbagi 10 |
| **Kustom** | persen sendiri untuk keempat kelompok: bilangan bulat 0–100, jumlahnya harus 100. Isian awal 50/30/20/0. Kelompok 0% tidak punya wadah. |

- Nama wadah di kartu: Kebutuhan, Keinginan, Pengeluaran, Biaya hidup, Tabungan & investasi, Berbagi.
- **Hanya satu yang aktif.** Bawaannya **Per kategori** (tanpa baris `metode_budget`), jadi user lama tidak melihat perubahan sampai memilih metode lain.
- Target per kategori yang sudah diisi tetap tersimpan; hanya disembunyikan selama metode lain aktif.
- **Basis = penghasilan per bulan** (SPEC-tujuan-tabungan): diatur user di Profil → Budget, atau saran aplikasi.
  - Saran dihitung **untuk bulan yang dilihat** (Analitik, Tanya AI, refleksi Kakeibo): rerata 3 bulan penuh sebelum bulan itu yang ada penghasilannya, hanya kategori pemasukan bertanda "Dihitung sebagai penghasilan".
  - Belum ada riwayatnya → penghasilan bulan itu sendiri. Tidak ada sama sekali → 0.
  - Penghasilan yang **diatur sendiri** tetap satu angka untuk semua bulan (tidak ada riwayatnya).
  - Jatahnya tetap sepanjang bulan, kapan pun gajiannya.
- Hanya pengeluaran berstatus confirmed yang dihitung. Pengeluaran dari kantong tujuan tabungan di luar semua wadah ("Dibayar dari tujuan: …", SPEC-tujuan-tabungan).
- **Status wadah:** terpakai = realisasi ÷ target × 100.
  - > 100% **lewat**, ≥ 80% **hampir**, selain itu **aman**. Ambang yang sama dipakai kartu Budget per kategori (SPEC-analitik).
  - Wadah tabungan: **tercapai** (realisasi ≥ target) atau **kurang**.
  - Target 0 dengan pengeluaran dianggap 100%.

## Tampilan

- **Profil → Budget:**
  - **pratinjau pembagian** paling atas, seperti pratinjau di halaman pilihan resolusi One UI:
    - baris "Penghasilan per bulan" dengan keterangan asalnya dan tombol **Ubah** (SPEC-tujuan-tabungan);
    - bilah bersegmen per persen dan satu kolom per wadah (nama, persen, rupiah dari penghasilan);
    - lalu penjelasan metode terpilih.
    - Per kategori: total target dibanding penghasilan ("Ditargetkan" vs "Belum dibagi", atau "Melebihi penghasilan" merah).
    - Kustom yang belum 100%: potongan abu-abu "Belum dibagi".
    - Warna wadah sama dengan kartu Analitik (`IKON` di `KartuMetode.tsx`) dan lolos uji buta warna;
  - bagian **Metode** di bawahnya: daftar pilihan dengan satu kalimat penjelasan. Metode preset tersimpan begitu diketuk; Kustom baru tersimpan lewat "Pakai persen ini";
  - **Kustom:** empat isian persen dengan penanda jumlah ("Total 100% ✓" / "Total 90% — harus 100%"); yang tidak 100% ditolak dengan pesan di isian;
  - **Per kategori:** isian target per kategori seperti sekarang.
- **Profil → Kategori:** form kategori pengeluaran mendapat pilihan **Kelompok**.
- **Edit transaksi:** pilihan **Kelompok**, "Ikut kategori (Kebutuhan)" atau salah satu kelompok. Detail transaksi menampilkannya.
- **Analitik:** kartu **"Metode 50/30/20"** menggantikan kartu Budget per kategori saat metode lain aktif.
  - Subjudul "Dari penghasilan Rp 8 jt per bulan." (atau "Atur penghasilan per bulan untuk membagi jatahnya."). Kaki **Atur metode** membuka Profil → Budget.
  - **Isi tiap baris:** ikon, nama wadah + persen, realisasi di kanan, bilah progres, lalu status dan "jatah Rp X".
    - Aman: "Sisa Rp X".
    - Hampir: ikon peringatan + "Hampir habis · sisa Rp X", diwarnai peringatan (tidak hanya warna).
    - Bilah progres: `aria-valuenow` dibatasi 0–100; persen aslinya (mis. 133%) di `aria-valuetext`.
    - Lewat: ikon peringatan + "Lewat Rp X (N%)".
  - **Tabungan** dibaca terbalik: makin besar makin baik. Status "Tercapai" (ikon centang) atau "Kurang Rp X" (ikon peringatan), dan "target Rp X".
  - **Mengetuk baris** membuka Riwayat pengeluaran bulan itu, tersaring ke kelompok wadahnya.
    - Filter `kelompok=`, tersimpan di URL seperti filter lain. Di Riwayat tampil sebagai chip yang bisa dilepas; lembar filter tidak punya pemilih kelompok.
    - Wadah tabungan (dari sisa) tidak bisa diketuk.
  - Di bawah wadah: "Disisihkan ke tujuan" / "Ditarik dari tujuan" dan "Dibayar dari tujuan: {nama}" (SPEC-tujuan-tabungan, SPEC-metode-lanjutan).
- **Beranda:** kartu "Budget hampir habis" untuk metode menampilkan wadah bukan tabungan yang hampir (≥ 80%) atau lewat; tidak tampil bila semuanya aman.
- **Tanya AI:** isian `metode` di ringkasan bulan (`tanya-server.ts`) membawa:
  - nama metode, `penghasilan_dibagi`, `penghasilan_diatur_sendiri`;
  - per wadah: nama, persen, jatah, persen_terpakai, realisasi, status, dan catatan arti angka tabungan;
  - `dibayar_dari_tujuan_tabungan`, `disisihkan_ke_tujuan_tabungan`.
  - Prompt meminta menjelaskan dengan bahasa metode itu ("Keinginan Rp 10.545.000, jauh di atas jatah Rp 2.400.000").

## Data (migrasi)

- **`categories.kelompok`** (`kebutuhan` / `keinginan` / `tabungan` / `berbagi`, hanya untuk pengeluaran; dua nilai lagi di SPEC-kelompok-baru):
  - `private.kelompok_bawaan(slug)`: food, groceries, transport, health, bills, fees → kebutuhan; selain itu keinginan;
  - trigger `kategori_kelompok` (before insert/update, `security definer`) mengisi kelompok yang kosong dari bawaannya dan mengosongkannya untuk kategori pemasukan. Jadi seed user baru & kategori buatan user ikut terisi;
  - kategori yang sudah ada diisi sekali lewat `update` di migrasi.
- **`private.transaksi_data.kelompok`** (null = ikut kategori), ditambahkan ke view & trigger.
  - View menambah `kelompok_efektif` (hanya pengeluaran): kelompok transaksi, atau kelompok kategorinya (dicocokkan lewat slug), atau `keinginan`. Riwayat, Analitik, Beranda, Tanya AI, dan ekspor memakai kolom ini.
  - Bukan data sensitif, jadi tidak dienkripsi.
- **`private.transaksi_data.pecahan_dari`** (uuid → transaksi asli, `on delete cascade`, berindeks), ditambahkan ke view & trigger.
  - `pecahan_salin_asli` (before insert bagian): menyalin tanggal, jam, `created_at`, kantong asal & tujuan, metode bayar, merchant, jenis, dan status dari transaksi asli.
  - `pecahan_ikut_asli` (after update transaksi asli): menyamakan kolom yang sama, kecuali `created_at`, ke semua bagiannya.
  - Keduanya `security definer` (20261107000000_normalisasi) dan hanya menyentuh baris akun yang sama (20261109000000_isolasi_rujukan).
- **Tabel baru `metode_budget`:** `user_id` (PK, default `auth.uid()`), `metode` (CHECK daftar metode), `persen` (jsonb; Kustom, kemudian juga PYF), `updated_at`. RLS satu baris milik sendiri.
  - Memilih metode preset menyimpan `persen: null`.
  - Kolom berikutnya: `penghasilan` (SPEC-tujuan-tabungan), `target_tabungan`, `strategi_utang`, `ekstra_utang` (fase 4).

## Pengujian

- **Unit `uji:metode`:**
  - preset → target per kelompok;
  - realisasi per kelompok (termasuk override per transaksi);
  - tabungan dari sisa;
  - basis penghasilan (saran rerata bulan penuh, uang masuk bukan penghasilan tidak dihitung, cadangan bulan ini);
  - Kustom harus 100%;
  - status aman/hampir/lewat.
- **Uji kering migrasi:** rollback, akun sementara. Kategori lama terisi kelompoknya, transaksi lama identik, `kelompok_efektif` benar.
- **AI:** "dinner di restoran fine dining 1,2jt" → Keinginan; "makan siang warteg 20rb" → ikut kategori (tanpa override); "zakat 250rb" → Berbagi.
- **E2E (suite `fase3`):**
  - pecah transaksi Rp 15 rb jadi 10 rb Kebutuhan + 5 rb Keinginan:
    - Riwayat tetap **satu kartu** Rp 15.000 "2 bagian"; saldo sama; realisasi kelompok bergeser;
    - filter Keinginan → hanya "Rp 5.000 · Bagian dari Rp 15.000";
    - ubah tanggal transaksi → bagian ikut;
    - hapus → semua bagian hilang, urungkan → semua kembali;
    - gabungkan lagi → satu baris Rp 15.000;
  - pilih 50/30/20 → kartu Analitik dengan angka yang benar;
  - ketuk Keinginan → Riwayat tersaring;
  - ubah kelompok satu transaksi → realisasi bergeser;
  - Kustom ≠ 100% ditolak di isian;
  - kembali ke Per kategori → kartu Budget lama;
  - Beranda "Budget hampir habis" menampilkan Keinginan yang lewat;
  - kategori baru dengan kelompok Tabungan tersimpan.
- **Tanya AI:** `eval:tanya` + 1 kasus ("bagaimana budget 50/30/20-ku bulan ini?").
- **Regresi:** semua `uji:*` & E2E, typecheck, dan `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - migrasi kolom `kelompok` (kategori & transaksi), `pecahan_dari`, `kelompok_efektif` di view, tabel `metode_budget`;
  - filter Riwayat `kelompok`.
- **Tanya dulu:**
  - mengubah kelompok kategori milik user secara massal di luar migrasi awal;
  - metode di luar daftar di atas (fase 4 menambah empat, SPEC-metode-lanjutan).
- **Jangan:**
  - menghapus target per kategori saat metode lain dipilih;
  - membuat AI mengganti kelompok yang sudah diubah user.

## Keputusan

1. **Kelompok keempat:** Berbagi (zakat, sedekah, donasi, hadiah) → 10% di 70/20/10.
2. **Basis:** awalnya pemasukan nyata bulan itu (cadangan bulan lalu). Diganti SPEC-tujuan-tabungan: penghasilan per bulan, diatur user atau saran rerata 3 bulan penuh.
3. **"Lainnya" → Keinginan.** User yang ingin hasilnya akurat perlu memberi kategori/cerita yang jelas.
4. **Belanja campuran:** "Pecah transaksi". Database memakai baris per bagian supaya mudah dicari dan dihitung; tampilannya tetap **satu transaksi** dengan rincian, supaya user tidak mengira terunggah dua kali. Tawaran pecah dari struk: SPEC-tawar-pecah.
5. **Berbagi di metode tanpa wadah Berbagi:** dihitung di Kebutuhan pada 50/30/20, dan di wadah Pengeluaran (80) pada 80/20.
6. **Rincian yang diketik langsung dipecah.** "15rb di indomaret, 10rb sabun 5rb kopi" sudah menyebut bagiannya sendiri, jadi langsung tersimpan sebagai satu transaksi dengan dua bagian.
   - Syaratnya: pengeluaran dari teks ketikan, 2–10 bagian, semua bernominal, dan jumlahnya persis sama dengan totalnya. Selain itu tetap satu transaksi utuh.
   - Kategori bagian yang tidak dikenal jadi Lainnya.
   - Rincian dari struk/gambar tidak dipecah otomatis (lihat nomor 4).

## Hasil

- **Migrasi:** `20261105000000_metode_budget.sql`, lalu `20261105000001_kategori_kelompok_definer.sql`.
  - Migrasi kedua memperbaiki "permission denied for schema private" saat user menambah/mengubah kategori: fungsi trigger kelompok kategori kini `security definer`.
  - Uji kering migrasi pertama tidak menangkapnya karena fungsi dibuat di transaksi yang sama. Pelajaran: uji kering juga dijalankan terhadap database yang sudah ter-commit, dengan peran `authenticated`.
- **AI kelompok:** fine dining 1,2 jt → Keinginan; warteg 20 rb → ikut kategori; zakat 250 rb → Berbagi.
- **AI rincian ketikan:** 6/6 terpecah benar (dua kalimat, masing-masing 3×), setelah teks ketikan tidak lagi dibungkus peringatan "teks OCR struk". Dengan peringatan itu model melewatkan rinciannya dan pernah menjumlah ulang nominal (15 rb jadi 30 rb). Bagian "kopi" diberi kelompok kategorinya (Makan → Kebutuhan), bukan Keinginan; user mengubahnya di "Atur pecahan".
- **Tanya AI:** `eval:tanya` 15/15, termasuk kasus 50/30/20 (jatah Keinginan Rp 2.400.000, realisasi Rp 10.545.000).
