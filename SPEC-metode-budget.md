# Spec: Metode budgeting (fase 3)

Status: **diterapkan** (Berbagi, pemasukan nyata bulan itu, Lainnya → Keinginan, pecah transaksi: baris per bagian di database, satu transaksi di tampilan) · 25 Oktober 2026 · branch `feat/metode-budget` · rilis 2.5.0

Peta fase: lihat SPEC-catat-tuntas.md. Fase ini adalah "mesin B" di Rencana CHANGELOG. Fase 4 memakainya untuk Jar/Kakeibo, ditambah Zero-Based dan Snowball/Avalanche.

## Tujuan

User memilih **metode budgeting**: membagi pemasukan bulanan ke beberapa **kelompok** dengan persentase, mis. 50/30/20 (kebutuhan 50%, keinginan 30%, tabungan 20%). Aplikasi lalu menunjukkan realisasinya:
- **Analitik:** "Keinginan Rp 2,9 jt dari jatah Rp 2,4 jt, lewat 21%".
- **Tanya AI:** menjelaskan dengan bahasa metode itu.

Budget per kategori yang sudah ada tetap jadi salah satu pilihan.

## Kelompok

Empat kelompok, satu untuk tiap pengeluaran:

| Kelompok | Arti | Kategori bawaan |
|---|---|---|
| **Kebutuhan** | yang harus dibayar untuk hidup | Makan, Belanja harian, Transportasi, Kesehatan, Tagihan, Biaya admin |
| **Keinginan** | yang bisa ditunda/dikurangi | Belanja, Hiburan, Lainnya |
| **Tabungan & investasi** | uang yang disisihkan | — (lihat cara hitung) |
| **Berbagi** | zakat, sedekah, donasi, hadiah | — |

**Penentuan kelompok tiap transaksi:**
1. **Kelompok bawaan dari kategorinya.** Bisa diubah di Profil → Kategori. Kategori baru wajib memilih kelompok.
2. **Bisa diubah per transaksi**, mis. makan di restoran mewah jadi Keinginan, lewat Edit transaksi → "Kelompok". Bawaannya "Ikut kategori".
3. **AI menyarankan** saat membaca struk/teks, *hanya* bila jelas beda dari bawaan kategorinya (restoran fine dining, kafe premium, tiket konser → Keinginan; "zakat"/"sedekah" → Berbagi; "beli emas/reksadana" → Tabungan). User tetap bisa mengubahnya.

**Belanja campuran → "Pecah transaksi".** Satu struk bisa berisi kebutuhan dan keinginan sekaligus (minimarket Rp 15 rb: sabun Rp 10 rb + kopi Rp 5 rb). Database menyimpan tiap bagian sebagai baris sendiri, tetapi tampilannya **tetap satu transaksi**. Dengan begitu user tidak mengira terunggah dua kali lalu menghapus salah satu bagiannya.

- **Data.**
  - Transaksi aslinya menjadi bagian pertama dan `id`-nya tetap.
  - Bagian lain adalah baris sendiri dengan `pecahan_dari = id transaksi asli`.
  - Tanggal, jam, `created_at`, kantong, merchant, jenis, dan status sama; nominal, kelompok, kategori, dan keterangan sendiri-sendiri.
  - Jumlah nominal semua bagian = nominal semula, jadi **saldo tidak berubah**.
  - Total, filter Riwayat, Analitik, dan Tanya AI menghitung per baris, tanpa aturan khusus untuk nominal sebagian.
  - Sengaja **bukan** `induk_id`: kolom itu milik cashback/biaya admin dan sudah punya aturan sendiri di banyak tempat.
- **Tampilan.**
  - **Riwayat & Beranda:** satu kartu "Alfamart **Rp 15.000** · 2 bagian".
  - **Detail:** bagian **Rincian** ("Kebutuhan · Sabun Rp 10.000", "Keinginan · Kopi Rp 5.000") dengan tombol **Atur pecahan** (ubah nominal/kelompok/kategori tiap bagian; jumlahnya harus tetap sama dengan total) dan **Gabungkan lagi**.
  - **Saat disaring** (kelompok Keinginan, kategori Makan, cari "kopi"), hanya bagian yang cocok yang tampil, diberi tanda jelas: "Alfamart Rp 5.000 · bagian dari Rp 15.000". Total filternya tetap benar.
- **Aman dihapus & diubah.**
  - Menghapus transaksi menghapus **semua bagiannya** (`on delete cascade`). Urungkan mengembalikan semuanya.
  - Mengubah tanggal, jam, kantong, merchant, atau jenis di transaksi asli ikut ke semua bagian (trigger, seperti cashback sekarang).
- **Ekspor CSV:** tetap satu baris per bagian (yang dibutuhkan spreadsheet), ditambah kolom "Bagian dari".
- **Lewat Catat juga bisa:** "15rb di indomaret, 10rb sabun 5rb kopi" dibaca AI menjadi satu transaksi dengan dua bagian.
- **Tidak dikerjakan di fase ini:** AI memecah otomatis dari struk berisi daftar barang. Nanti bentuknya *menawarkan* ("Struk ini ada kebutuhan & keinginan. Pecah jadi 2?"), tidak langsung memecah, karena salah baca struk bisa salah pecah.

**Tabungan dihitung dari sisa:** `pemasukan − pengeluaran selain kelompok Tabungan`.
- Uang yang tidak dibelanjakan dianggap tersimpan.
- Pengeluaran yang memang tabungan (beli emas, reksadana) dikelompokkan Tabungan, jadi tidak mengurangi realisasinya.
- Pindah kantong (mis. ke rekening tabungan) bukan pengeluaran, jadi otomatis sudah termasuk.

## Metode

| Metode | Pembagian |
|---|---|
| **Per kategori** (sekarang) | target rupiah per kategori, seperti halaman Budget saat ini |
| **50/30/20** | Kebutuhan 50 · Keinginan 30 · Tabungan 20 (Berbagi dihitung di Kebutuhan) |
| **80/20** | Kebutuhan + Keinginan 80 · Tabungan 20 (Berbagi ikut di 80) |
| **70/20/10** | Kebutuhan + Keinginan 70 · Tabungan 20 · Berbagi 10 |
| **Kustom** | persen sendiri untuk keempat kelompok (jumlahnya harus 100) |

- **Hanya satu yang aktif.** Bawaannya **Per kategori**, jadi user lama tidak melihat perubahan sampai memilih metode lain.
- Target per kategori yang sudah diisi tetap tersimpan; hanya disembunyikan selama metode lain aktif.
- **Basis pemasukan:** pemasukan bulan itu (tanpa Cashback/Refund, karena itu potongan belanja, bukan pemasukan untuk dibagi). Bila bulan itu belum ada pemasukan (awal bulan), dipakai pemasukan bulan lalu dengan keterangan "berdasarkan pemasukan September".

## Tampilan

- **Profil → Budget:**
  - bagian **Metode** di atas: daftar pilihan dengan satu kalimat penjelasan dan contoh rupiah dari pemasukan user;
  - **Kustom:** empat isian persen dengan penanda jumlah ("Total 100% ✓");
  - **Per kategori:** isian target per kategori seperti sekarang.
- **Profil → Kategori:** form kategori pengeluaran mendapat pilihan **Kelompok**.
- **Edit transaksi:** pilihan **Kelompok**, "Ikut kategori (Kebutuhan)" atau salah satu kelompok. Detail transaksi menampilkannya.
- **Analitik:** kartu **"Metode 50/30/20"** menggantikan kartu Budget per kategori saat metode lain aktif.
  - **Isi tiap baris:** nama kelompok, realisasi dari target ("Rp 2,9 jt dari Rp 2,4 jt"), bilah progres, dan status (aman / hampir habis / lewat, dengan ikon, bukan warna saja).
  - **Tabungan** dibaca terbalik: makin besar makin baik ("Rp 1,2 jt dari target Rp 1,6 jt").
  - **Mengetuk baris** membuka Riwayat tersaring ke kelompok itu (filter baru `kelompok=`, ikut tersimpan di URL seperti filter lain).
- **Beranda:** peringatan "Budget hampir habis" juga berlaku untuk kelompok (≥ 80% jatah).
- **Tanya AI:** `ringkasan_bulan` membawa metode aktif, basis, serta target & realisasi per kelompok. Prompt meminta menjelaskan dengan bahasa metode itu ("Keinginan sudah lewat 21% dari jatah 30%").

## Data (migrasi)

- **`categories.kelompok`** (`kebutuhan` / `keinginan` / `tabungan` / `berbagi`, hanya untuk pengeluaran):
  - kategori yang sudah ada diisi sesuai tabel di atas;
  - kategori buatan user yang tidak dikenal masuk Keinginan;
  - fungsi pembuat kategori bawaan untuk user baru ikut mengisinya.
- **`private.transaksi_data.kelompok`** (null = ikut kategori), ditambahkan ke view & trigger.
  - View menambah `kelompok_efektif`, yaitu kelompok transaksi atau bawaan kategorinya. Riwayat & Analitik tinggal menyaring kolom ini.
  - Bukan data sensitif, jadi tidak dienkripsi.
- **`private.transaksi_data.pecahan_dari`** (uuid → transaksi asli, `on delete cascade`), ditambahkan ke view & trigger.
  - Trigger menyamakan tanggal, jam, `created_at`, kantong, merchant, jenis, dan status bagian dengan transaksi aslinya.
- **Tabel baru `metode_budget`:** `user_id`, `metode`, `persen` (jsonb, hanya Kustom), `updated_at`; RLS satu baris milik sendiri.

## Pengujian

- **Unit `uji:metode`:**
  - preset → target per kelompok;
  - realisasi per kelompok (termasuk override per transaksi);
  - tabungan dari sisa;
  - basis pemasukan (tanpa refund, cadangan bulan lalu);
  - Kustom harus 100%;
  - status aman/hampir/lewat.
- **Uji kering migrasi:** rollback, akun sementara. Kategori lama terisi kelompoknya, transaksi lama identik, `kelompok_efektif` benar.
- **AI:** "dinner di restoran fine dining 1,2jt" → Keinginan; "makan siang warteg 20rb" → ikut kategori (tanpa override); "zakat 250rb" → Berbagi.
- **E2E:**
  - pecah transaksi Rp 15 rb jadi 10 rb Kebutuhan + 5 rb Keinginan:
    - Riwayat tetap **satu kartu** Rp 15.000 "2 bagian"; saldo sama; realisasi kelompok bergeser;
    - filter Keinginan → hanya "Rp 5.000 · bagian dari Rp 15.000";
    - ubah tanggal transaksi → bagian ikut;
    - hapus → semua bagian hilang, urungkan → semua kembali;
    - gabungkan lagi → satu baris Rp 15.000;
  - pilih 50/30/20 → kartu Analitik dengan angka yang benar;
  - ketuk Keinginan → Riwayat tersaring;
  - ubah kelompok satu transaksi → realisasi bergeser;
  - Kustom ≠ 100% ditolak di isian;
  - kembali ke Per kategori → kartu Budget lama.
- **Tanya AI:** `eval:tanya` + 1 kasus ("bagaimana budget 50/30/20-ku bulan ini?").
- **Regresi:** semua `uji:*` & E2E, typecheck, dan `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - migrasi kolom `kelompok` (kategori & transaksi), `pecahan_dari`, `kelompok_efektif` di view, tabel `metode_budget`;
  - filter Riwayat `kelompok`.
- **Tanya dulu:**
  - mengubah kelompok kategori milik user secara massal di luar migrasi awal;
  - metode di luar daftar di atas (itu fase 4).
- **Jangan:**
  - menghapus target per kategori saat metode lain dipilih;
  - membuat AI mengganti kelompok yang sudah diubah user.

## Keputusan

1. **Kelompok keempat:** Berbagi (zakat, sedekah, donasi, hadiah) → 10% di 70/20/10.
2. **Basis:** pemasukan nyata bulan itu; awal bulan tanpa pemasukan memakai bulan lalu.
3. **"Lainnya" → Keinginan.** User yang ingin hasilnya akurat perlu memberi kategori/cerita yang jelas.
4. **Belanja campuran:** "Pecah transaksi". Database memakai baris per bagian supaya mudah dicari dan dihitung; tampilannya tetap **satu transaksi** dengan rincian, supaya user tidak mengira terunggah dua kali. AI memecah otomatis menyusul (menawarkan, bukan langsung).
5. **Berbagi di metode tanpa wadah Berbagi:** dihitung di Kebutuhan pada 50/30/20, dan di wadah 80 pada 80/20.
6. **Rincian yang diketik langsung dipecah.** "15rb di indomaret, 10rb sabun 5rb kopi" sudah menyebut bagiannya sendiri, jadi langsung tersimpan sebagai satu transaksi dengan dua bagian. Syaratnya, jumlah bagian persis sama dengan totalnya; selain itu tetap satu transaksi utuh. Rincian dari struk/gambar tidak dipecah otomatis (lihat nomor 4).

## Hasil

- **Migrasi:** `20261105000000_metode_budget.sql`, lalu `20261105000001_kategori_kelompok_definer.sql`.
  - Migrasi kedua memperbaiki "permission denied for schema private" saat user menambah/mengubah kategori: fungsi trigger kelompok kategori kini `security definer`.
  - Uji kering migrasi pertama tidak menangkapnya karena fungsi dibuat di transaksi yang sama. Pelajaran: uji kering juga dijalankan terhadap database yang sudah ter-commit, dengan peran `authenticated`.
- **AI kelompok:** fine dining 1,2 jt → Keinginan; warteg 20 rb → ikut kategori; zakat 250 rb → Berbagi.
- **AI rincian ketikan:** 6/6 terpecah benar (dua kalimat, masing-masing 3×), setelah teks ketikan tidak lagi dibungkus peringatan "teks OCR struk". Dengan peringatan itu model melewatkan rinciannya dan pernah menjumlah ulang nominal (15 rb jadi 30 rb). Bagian "kopi" diberi kelompok kategorinya (Makan → Kebutuhan), bukan Keinginan; user mengubahnya di "Atur pecahan".
- **Tanya AI:** `eval:tanya` 15/15, termasuk kasus 50/30/20 (jatah Keinginan Rp 2.400.000, realisasi Rp 10.545.000).
