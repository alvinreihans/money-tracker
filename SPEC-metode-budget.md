# Spec: Metode budgeting (fase 3)

Status: **usulan** (pertanyaan 1–3 disetujui: Berbagi, pemasukan nyata bulan itu, Lainnya → Keinginan; menunggu persetujuan "Pecah transaksi") · 25 Oktober 2026 · branch `feat/metode-budget` · rilis 2.5.0

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

**Belanja campuran → "Pecah transaksi".** Satu struk bisa berisi kebutuhan dan keinginan sekaligus (minimarket Rp 15 rb: sabun Rp 10 rb + kopi Rp 5 rb).
- Di detail/Edit transaksi ada **"Pecah"**: isi nominal bagian kedua, kelompoknya (dan kategorinya), plus keterangan opsional ("kopi").
- Transaksi itu menjadi **dua transaksi sungguhan**: tanggal, jam, kantong, dan merchant sama, sementara nominal, kelompok, dan kategori sendiri-sendiri.
- **Saldo tidak berubah.** Total, filter Riwayat, Analitik, dan Tanya AI tidak perlu aturan khusus untuk nominal sebagian.
- Bisa diurungkan lewat snackbar.
- Lewat Catat juga bisa: "15rb di indomaret, 10rb sabun 5rb kopi" dibaca AI sebagai dua transaksi.
- **Tidak dikerjakan di fase ini:** AI memecah otomatis dari struk berisi daftar barang. Nanti bentuknya *menawarkan* ("Struk ini ada kebutuhan & keinginan. Pecah jadi 2?"), tidak langsung memecah, karena salah baca struk bisa salah pecah.

**Tabungan dihitung dari sisa:** `pemasukan − pengeluaran selain kelompok Tabungan`.
- Uang yang tidak dibelanjakan dianggap tersimpan.
- Pengeluaran yang memang tabungan (beli emas, reksadana) dikelompokkan Tabungan, jadi tidak mengurangi realisasinya.
- Pindah kantong (mis. ke rekening tabungan) bukan pengeluaran, jadi otomatis sudah termasuk.

## Metode

| Metode | Pembagian |
|---|---|
| **Per kategori** (sekarang) | target rupiah per kategori, seperti halaman Budget saat ini |
| **50/30/20** | Kebutuhan 50 · Keinginan 30 · Tabungan 20 |
| **80/20** | Kebutuhan + Keinginan 80 · Tabungan 20 |
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
  - pecah transaksi Rp 15 rb jadi 10 rb Kebutuhan + 5 rb Keinginan → dua transaksi, saldo sama, realisasi kelompok bergeser; urungkan → kembali satu;
  - pilih 50/30/20 → kartu Analitik dengan angka yang benar;
  - ketuk Keinginan → Riwayat tersaring;
  - ubah kelompok satu transaksi → realisasi bergeser;
  - Kustom ≠ 100% ditolak di isian;
  - kembali ke Per kategori → kartu Budget lama.
- **Tanya AI:** `eval:tanya` + 1 kasus ("bagaimana budget 50/30/20-ku bulan ini?").
- **Regresi:** semua `uji:*` & E2E, typecheck, dan `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - migrasi kolom `kelompok` (kategori & transaksi), `kelompok_efektif` di view, tabel `metode_budget`;
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
4. **Belanja campuran:** "Pecah transaksi" manual (lihat Kelompok); AI memecah otomatis menyusul (menawarkan, bukan langsung).
