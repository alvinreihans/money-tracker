# Spec: Metode lanjutan — Zero-Based, Pay Yourself First, 6 Jars, Kakeibo

Status: **diterapkan** · rilis 2.8.0 · disetujui 31 Oktober 2026 · modul `metode-lanjutan` (PETA-fase4), butuh `kelompok-baru` · disinkronkan dengan kode 1 Nov 2026

## Tujuan

Empat metode baru di samping Per kategori, 50/30/20, 80/20, 70/20/10, dan Kustom. Semuanya bisa dipilih di Profil → Budget, lalu tampil di Analitik, Beranda, dan Tanya AI dengan bahasa metode itu.

Urutan di daftar Profil → Budget: Per kategori, Zero-Based, 50/30/20, 80/20, 70/20/10, 6 Jars, Pay Yourself First, Kakeibo, Kustom (`METODE`).

## Prinsip bersama: tabungan dihitung dari setoran nyata

Di Zero-Based, Pay Yourself First, 6 Jars, dan Kakeibo, **tabungan = uang yang benar-benar disisihkan bulan itu**:
- **setoran bersih ke tujuan tabungan**, lalu
- ditambah pengeluaran berkelompok Tabungan (beli emas, reksadana).

Uang yang sekadar tersisa di BCA tidak dihitung. Inti keempat metode ini adalah menyisihkan dengan sengaja.

### Setoran bersih (keputusan user 31 Okt 2026)

`keTujuan` di `ambilPengaturanMetode` = `setoranBersih(...)` atas pindah kantong bulan itu yang berstatus confirmed, punya kantong tujuan, dan bukan pelengkap (`pelengkap_tujuan` null):

```
setoran bersih = Σ pindah dari kantong BUKAN tujuan → kantong tujuan
               − Σ pindah dari kantong tujuan → kantong BUKAN tujuan
```

- Pindah antar-tujuan diabaikan.
- Pengeluaran dari tujuan ("Pakai") bukan penarikan. Itu pembelian, yang sudah dipisah oleh SPEC-analitik-tujuan.
- Hasilnya boleh negatif (lebih banyak ditarik daripada disetor). Tampilannya "Ditarik dari tujuan Rp X".

Karena `keTujuan` dipakai bersama, baris "Disisihkan ke tujuan" di `KartuMetode` untuk metode lama juga memakai angka bersih ini (sebelum 2.8.0: semua pindah ke tujuan, tanpa dikurangi tarikan).

### Metode lama

50/30/20, 80/20, 70/20/10, dan Kustom tetap memakai aturan lama: tabungan = penghasilan − pengeluaran selain kelompok tabungan.

Pembelian dari kantong tujuan tetap di luar semua wadah (SPEC-analitik-tujuan).

## Metode

### Zero-Based

**Gagasan:** setiap rupiah penghasilan diberi tugas.

**Pengaturan:**
- target per kategori (tabel `budgets` yang sudah ada, berlaku sama tiap bulan);
- satu isian **Tabungan per bulan** dalam rupiah (`metode_budget.target_tabungan`), opsional.

**Profil → Budget:**
- Form target per kategori tampil untuk `kategori` dan `zero-based`. Untuk Zero-Based, isian "Tabungan per bulan (Rp)" ada di atasnya.
- Memilih Zero-Based tidak langsung menyimpan. Metode, target tabungan (kosong = null), dan target per kategori tersimpan bersama lewat tombol **Simpan** form itu ("Zero-Based tersimpan.").
- Pratinjau memperluas potongan milik Per kategori (bukan pratinjau baru): **Ditargetkan** (Σ target), **Tabungan**, lalu satu potongan sisa = penghasilan − Σ target − tabungan:
  - sisa > 0: **"Belum dialokasikan"**, kuning, sub "N% penghasilan";
  - sisa = 0: "Belum dialokasikan Rp 0", abu-abu, sub "Semua rupiah punya tugas ✓";
  - sisa < 0: **"Melebihi penghasilan"** merah, nominal kelebihannya;
  - penghasilan 0: tanpa potongan sisa.
- Menyimpan tetap boleh walau belum 0. Ini peringatan, bukan larangan.
- Catatan di bawah daftar metode (untuk metode selain Per kategori & Zero-Based): "Target per kategori tetap tersimpan, dipakai lagi kalau kembali ke Per kategori atau Zero-Based."

**Analitik:** **KartuBudget** (sama dengan Per kategori), lalu `KartuMetode` "Metode Zero-Based" (tidak bisa diketuk) berisi:
- wadah **Tabungan**: setoran bersih + pengeluaran kelompok tabungan vs target tabungan, "Tercapai"/"Kurang Rp X"; target kosong → "Target belum diatur";
- baris **Belum dialokasikan** (selalu tampil bila ada penghasilan): positif kuning dengan "Atur target di Profil → Budget"; nol "Semua rupiah sudah punya tugas ✓"; negatif merah berjudul "Target melebihi penghasilan";
- penghasilan 0: tanpa baris Belum dialokasikan (sama dengan pratinjau Profil); gantinya baris **"Atur penghasilan dulu"** yang membuka Profil → Budget. `belumDialokasikan` tidak diisi.

**Beranda:** KartuBudget "Budget hampir habis" seperti Per kategori, ditambah kartu "Belum disisihkan" seperti Pay Yourself First bila tabungan belum tercapai.

### Pay Yourself First

**Gagasan:** sisihkan tabungan dulu begitu gajian; sisanya bebas, tanpa batas per pos.

**Pengaturan:**
- persen tabungan, bawaan 20%, bilangan bulat 1–90% ("Persen tabungan 1–90%.");
- disimpan di `metode_budget.persen` sebagai `{"tabungan": 20}`;
- alur "isi dulu, baru simpan" seperti Kustom: tombol **Pakai Pay Yourself First**.

`pilih()` hanya menyimpan langsung metode di luar `ISI_DULU` (`kustom`, `pyf`, `kakeibo`, `zero-based`); untuk keempatnya ia membuka isiannya. `pakaiMetode(m, persen, target)` mengirim `persen` milik metode itu (PYF `{tabungan}`, Kustom empat kelompok, lainnya null) dan `target_tabungan` bila diberikan. Pratinjau mendapat `persen` PYF, tidak hanya Kustom.

**Wadah:**
- **Tabungan:** target = penghasilan × persen; realisasi = setoran bersih + pengeluaran kelompok tabungan.
- **Bebas dipakai:** jatahnya penghasilan × (100 − persen)%, realisasinya semua pengeluaran selain kelompok tabungan.
  - Statusnya hanya "aman" atau "lewat", tanpa "hampir".
  - Beranda baru menampilkannya di "Budget hampir habis" bila **lewat** (keputusan user 31 Okt 2026).

**Beranda: kartu "Belum disisihkan"** — "**Rp 1.600.000** tabungan bulan ini. Sisihkan dulu, sisanya bebas dipakai." Letaknya di atas daftar transaksi terbaru, setelah "catatan belum selesai", karena paling berguna tepat setelah gajian.
- **Berlaku untuk** Pay Yourself First dan Zero-Based.
- **Kapan tampil:** penghasilan bulan berjalan > 0, dan realisasi wadah Tabungan < targetnya. Nominalnya kekurangannya. Hilang sendiri begitu realisasi ≥ target.
- **Data penghasilan:** `ambilPengaturanMetode` mengembalikan `penghasilanBulanIni`: jumlah pemasukan berkategori penghasilan di bulan **berjalan** (bukan bulan yang diminta), dari data `masuk` 3 bulan yang sudah diambil untuk saran.
- **Tombol Sisihkan** sama dengan aksi "Sisihkan" di Profil → Tujuan: `bukaManual({ type: "transfer", category: "other", amount })`, `amount` = kekurangannya (`isianNominal`).
  - Satu tujuan: `kantong_tujuan_id` dan `merchant` (nama tujuan) langsung terisi.
  - Beberapa tujuan: user memilih di "Ke kantong". Daftar itu berisi semua kantong, tidak hanya tujuan; dibiarkan sama dengan Sisihkan di Tujuan (keputusan user 31 Okt 2026).
  - Belum ada tujuan: tombolnya **Buat tujuan** dan membuka Profil → Tujuan.

### 6 Jars (T. Harv Eker)

| Toples | % | Dihitung dari |
|---|---|---|
| Kebutuhan | 55 | kelompok kebutuhan + tak terduga |
| Hiburan | 10 | keinginan |
| Pendidikan | 10 | pengembangan diri |
| Tabungan jangka panjang | 10 | setoran bersih ke tujuan tabungan |
| Kebebasan finansial | 10 | pengeluaran kelompok tabungan (emas, reksadana) |
| Berbagi | 5 | berbagi |

- Persennya tetap (tidak bisa diatur). Yang ingin persen lain memakai Kustom. Memilihnya langsung menyimpan.
- Dua toples tabungan dibaca terbalik ("Tercapai"/"Kurang"): makin besar makin baik.

### Kakeibo

**Gagasan:** empat pos tanpa persen, target tabungan dalam rupiah, dan refleksi di akhir bulan.

| Pos | Dihitung dari |
|---|---|
| Bertahan hidup | kebutuhan + berbagi |
| Pilihan | keinginan |
| Budaya | pengembangan diri |
| Ekstra | tak terduga |

**Pengaturan:** target tabungan dalam rupiah, **wajib** > 0 ("Isi target tabungan per bulan."), di `metode_budget.target_tabungan`, berlaku tiap bulan sampai diubah. Alur "isi dulu, baru simpan": tombol **Pakai Kakeibo**.

**Pratinjau (Profil → Budget):** "Target tabungan" (rupiah, % penghasilan) dan "Bisa dibelanjakan" (penghasilan − target, sub "4 pos, tanpa jatah").

**Tampilan (Analitik, `KartuMetode`):**
- Empat pos: nominal dan "N% dari belanja" (porsi dari total pengeluaran selain kelompok tabungan), tanpa jatah, selalu "aman".
- **Tabungan:** setoran bersih + pengeluaran kelompok tabungan vs target.
- **Bisa dibelanjakan** = penghasilan − target tabungan.
- **Sisa** (atau **Lewat**, merah) = bisa dibelanjakan − dibelanjakan, dengan keterangan "Sudah dibelanjakan Rp X". Dibelanjakan = pengeluaran selain kelompok tabungan.
- Beranda tidak menampilkan apa pun untuk Kakeibo (pos tanpa jatah tidak pernah "hampir"/"lewat").

**Refleksi:**
- Mulai tanggal 25 di bulan berjalan, dan di bulan yang sudah lewat, Analitik menampilkan tombol **Refleksi {Nama bulan YYYY}** (mis. "Refleksi Oktober 2026").
- Tombol itu membuka Tanya AI dan langsung mengirim "Refleksi Kakeibo {Nama bulan YYYY}", seperti kartu saran di layar kosong Tanya AI. Nama bulannya disebut karena prompt mengartikan "bulan ini" sebagai bulan berjalan.
- Konteks Tanya AI punya `tanyaLangsung(q)` (buka lalu kirim) dan `sibuk`; `useTanyaLangsung()` mengembalikan `{ kirim, sibuk }`, atau null di luar provider (tombol tidak tampil). Tombolnya dinonaktifkan selama Tanya AI sibuk.
- AI menjawab empat poin bernomor dari data:
  1. penghasilan yang dibagi (`penghasilan_dibagi`), bukan semua uang masuk;
  2. target tabungan dan yang benar-benar disisihkan (realisasi wadah Tabungan);
  3. dibelanjakan dibanding bisa dibelanjakan, beserta sisa atau lewatnya;
  4. satu saran perbaikan dari pos dengan belanja terbesar.
- Agar angkanya tidak ditandai `ragu`, `bisa_dibelanjakan`, `dibelanjakan`, dan `sisa` dihitung lebih dulu di isian `metode.kakeibo`.
- Aturan "2–5 kalimat" dilonggarkan khusus refleksi: empat poin pendek tanpa markdown (keputusan user 31 Okt 2026).

## Data & kode

**Migrasi** (bagian dari `20261108000000_fase4.sql`):
- CHECK `metode_budget.metode` + `zero-based`, `pyf`, `6-jars`, `kakeibo`;
- kolom `target_tabungan numeric(14,2) check (target_tabungan > 0)`;
- default `metode` = `'kategori'`, supaya baris bisa dibuat dari halaman lain (lihat SPEC-pelunasan).

**`metode.ts`:**
- `METODE` (juga gerbang parse di `ambilPengaturanMetode`; nilai asing → `kategori`), `LABEL_METODE`, dan `wadahMetode(metode, persen, targetTabungan)` (PYF, 6 Jars, Kakeibo, Zero-Based).
- `setoranBersih(pindah, idTujuan)`: fungsi murni setoran bersih.
- `ambilPengaturanMetode` ditambah:
  - `targetTabungan` (null bila belum diatur);
  - `penghasilanBulanIni`;
  - `totalTarget` (Σ `budgets`, untuk Zero-Based; diambil di sini supaya tiap pemanggil tidak menghitung sendiri);
  - `keTujuan` versi setoran bersih (lihat di atas).
- **`hitungMetode` diperluas, bukan diganti:**
  - `Wadah.sumber` menandai asal realisasinya: `pengeluaran` (bawaan), `sisa` (tabungan metode lama), `setoran-tujuan` (Tabungan jangka panjang 6 Jars), atau `setoran-total` (setoran + kelompok tabungan: Tabungan PYF, Zero-Based, Kakeibo);
  - `targetTetap` (target rupiah, bukan persen), `tanpaJatah` (pos Kakeibo), `bebas` (Bebas dipakai PYF: tanpa "hampir");
  - Zero-Based mengembalikan wadah Tabungan dan `belumDialokasikan` (penghasilan − Σ target − target tabungan);
  - Kakeibo mengembalikan `kakeibo: { bisaDibelanjakan, dibelanjakan, sisa }`;
  - semua masukan baru opsional, karena `uji-metode.mts` memanggil `hitungMetode({metode, persen, penghasilan})` tanpa isian baru.
- **Metode lama tetap lulus `uji:metode` tanpa diubah.** Itu bukti angkanya tidak bergeser.
  - Pengecualian: `keTujuan`, yang memang berubah menjadi setoran bersih.

**Pemanggil `hitungMetode`/`ambilPengaturanMetode` yang ikut diubah:**
- `analitik/page.tsx` + `AnalitikView.tsx` (KartuBudget + KartuMetode untuk Zero-Based, tombol refleksi Kakeibo, tautan wadah);
- `(app)/page.tsx` + `BerandaView.tsx` (pilihan kartu, kartu "Belum disisihkan");
- `tanya-server.ts`;
- `profil/budget/BudgetView.tsx` (isian PYF/Kakeibo/Zero-Based, pratinjau).

**`KartuMetode`:**
- Tidak menulis `{persen}%` untuk wadah berpersen 0 (Kakeibo, Tabungan Zero-Based).
- Ikon & warna wadah baru di `IKON`: bebas, hiburan, pendidikan, tabungan-panjang, kebebasan, bertahan, pilihan, budaya, ekstra (wadah tak dikenal jatuh ke ikon Kebutuhan). Warnanya diuji buta warna terhadap tetangganya (jarak CIELAB ≥ 23), seperti warna yang sudah ada.
- Baris "Disisihkan ke tujuan"/"Ditarik dari tujuan" tidak ditampilkan bila metode itu sudah punya wadah bersumber `setoran-tujuan`/`setoran-total` (6 Jars, PYF, Zero-Based, Kakeibo), supaya tidak dobel.
- Mode Beranda (`judul`) membuang semua wadah tabungan dan wadah berstatus aman. "Bebas dipakai" PYF hanya ikut bila lewat.

**Tautan ke Riwayat (`AnalitikView`):**
- wadah bersumber `pengeluaran`: Riwayat pengeluaran bulan itu dengan filter kelompok wadahnya (termasuk Kebebasan finansial → kelompok tabungan);
- wadah bersumber `setoran-tujuan`: Riwayat pindah kantong bulan itu, filter kantong = semua kantong tujuan;
- wadah bersumber `sisa` atau `setoran-total` tidak bisa diketuk;
- kartu Zero-Based tidak punya tautan sama sekali.

**Tanya AI (`tanya-server.ts`, ringkasan bulan):**
- Isian `metode` memuat wadah baru (pos tanpa jatah: `porsi_dari_belanja_persen` alih-alih jatah), `disisihkan_ke_tujuan_tabungan` (setoran bersih), `kakeibo` (`target_tabungan`, `bisa_dibelanjakan`, `dibelanjakan`, `sisa`), serta `belum_dialokasikan` (Zero-Based).
- Catatan per wadah tabungan (`CATATAN_TABUNGAN`) mengikuti sumber realisasinya:
  - `sisa`: "tabungan = penghasilan dikurangi pengeluaran selain tabungan";
  - `setoran-total`: "tabungan = yang benar-benar disisihkan bulan ini: setoran bersih ke tujuan tabungan ditambah beli emas/reksadana";
  - `setoran-tujuan`: setoran bersih ke tujuan tabungan;
  - `pengeluaran`: beli emas, reksadana, dan investasi lain (kelompok tabungan).
- Aturan prompt baru:
  - di Zero-Based, PYF, 6 Jars, dan Kakeibo, "tabungan" berarti yang disisihkan, bukan sisa; pos Kakeibo tidak punya jatah; `belum_dialokasikan` negatif = target melebihi penghasilan;
  - "Refleksi Kakeibo {bulan}": pakai ringkasan bulan yang disebut, jawab empat poin bernomor (lihat Refleksi).

## Pengujian

**`uji:metode`, untuk tiap metode baru dengan data contoh:**
- target, realisasi, dan status tiap wadah (PYF, 6 Jars, Kakeibo, Zero-Based);
- setoran bersih: setor 1 jt, tarik 400 rb, pindah antar-tujuan 300 rb → 600 rb; lebih banyak ditarik → negatif (pelengkap dibuang di query, tidak di fungsi);
- pembelian dari tujuan tetap di luar;
- Zero-Based belum dialokasikan positif, nol, dan negatif;
- PYF "Bebas dipakai" 97% tetap "aman", "lewat" bila melebihi jatahnya; persen bawaan 20.

**`eval:tanya`.** Akun eval memasang 50/30/20 sekali di awal (`upsert`), dan kasus 14 bergantung padanya.
- Tiap kasus mendapat isian opsional `metode` (di-`upsert` di atas pengaturan awal) dan `siapkan` (data tambahan khusus kasus itu, dikembalikan sebagai fungsi pembersih).
  - Sesudah kasus itu, metode kembali ke pengaturan awal tanpa data tambahan.
- Kasus "bagaimana toples 6 jars-ku bulan ini?":
  - `siapkan`: setor 600 rb ke Tabungan HP dari BCA, kursus 400 rb (Pendidikan, kelompok pengembangan);
  - harapan: 400.000, 600.000, 800.000, menyebut "pendidikan".
- Kasus "Refleksi Kakeibo {bulan}":
  - `metode`: Kakeibo dengan target tabungan 1 jt (tanpa `siapkan`);
  - harapan: penghasilan 8 jt, target 1 jt, belanja 367 rb, sisa 6.633.000; tidak `ragu`.

**E2E (suite `e2e/metode.mjs`):**
- PYF: isian & pratinjau tampil, belum tersimpan sebelum "Pakai"; tersimpan dengan `persen.tabungan` 20;
- Beranda: "Belum disisihkan Rp 1.600.000"; Sisihkan mengisi nominal & tujuan; kartu hilang setelah disetor;
- Zero-Based: pratinjau Ditargetkan/Tabungan/Belum dialokasikan; tersimpan bersama budget; Analitik menampilkan KartuBudget + "Metode Zero-Based" dengan Belum dialokasikan dan Tabungan;
- 6 Jars: langsung tersimpan; Analitik menampilkan Pendidikan & Tabungan jangka panjang;
- Kakeibo: tersimpan dengan target; pos "% dari belanja", Bisa dibelanjakan; tombol refleksi di bulan lalu mengirim "Refleksi Kakeibo {bulan}" yang benar.

**Regresi:** semua `uji:*`, semua suite E2E, typecheck, `next build`, `eval:tanya`.

## Boundaries

- **Jangan:**
  - mengubah perhitungan metode lama (selain `keTujuan` menjadi setoran bersih);
  - membuat persen 6 Jars bisa diatur;
  - target per minggu untuk Kakeibo (bulanan saja);
  - membatasi pilihan "Ke kantong" di form manual.
- **Tanya dulu:**
  - target tabungan yang beda tiap bulan;
  - jurnal refleksi yang disimpan (sekarang lewat Tanya AI saja, tidak disimpan).
