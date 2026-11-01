# Spec: Metode lanjutan — Zero-Based, Pay Yourself First, 6 Jars, Kakeibo

Status: **disetujui** · 31 Oktober 2026, setelah cek silang dengan kode · modul `metode-lanjutan` (PETA-fase4), butuh `kelompok-baru`

## Tujuan

Empat metode baru di samping Per kategori, 50/30/20, 80/20, 70/20/10, dan Kustom. Semuanya bisa dipilih di Profil → Budget, lalu tampil di Analitik, Beranda, dan Tanya AI dengan bahasa metode itu.

## Prinsip bersama: tabungan dihitung dari setoran nyata

Di Zero-Based, Pay Yourself First, 6 Jars, dan Kakeibo, **tabungan = uang yang benar-benar disisihkan bulan itu**:
- **setoran bersih ke tujuan tabungan**, lalu
- ditambah pengeluaran berkelompok Tabungan (beli emas, reksadana).

Uang yang sekadar tersisa di BCA tidak dihitung. Inti keempat metode ini adalah menyisihkan dengan sengaja.

### Setoran bersih (keputusan user 31 Okt 2026)

`keTujuan` di `ambilPengaturanMetode` sekarang menjumlah semua pindah kantong berstatus confirmed (bukan pelengkap) yang **tujuannya** kantong tujuan, dari kantong asal apa pun. Akibatnya:
- memindah dari tujuan A ke tujuan B ikut terhitung setoran;
- menarik uang dari tujuan kembali ke bank tidak pernah dikurangkan.

Diganti menjadi, untuk bulan itu, kecuali pindah kantong pelengkap (`pelengkap_tujuan`):

```
setoran bersih = Σ pindah dari kantong BUKAN tujuan → kantong tujuan
               − Σ pindah dari kantong tujuan → kantong BUKAN tujuan
```

- Pindah antar-tujuan diabaikan.
- Pengeluaran dari tujuan ("Pakai") bukan penarikan. Itu pembelian, yang sudah dipisah oleh SPEC-analitik-tujuan.
- Hasilnya boleh negatif (lebih banyak ditarik daripada disetor). Tampilannya "Ditarik dari tujuan Rp X".

Karena `keTujuan` dipakai bersama, baris "Disisihkan ke tujuan" di `KartuMetode` untuk metode lama juga memakai angka bersih ini.

### Metode lama

50/30/20, 80/20, 70/20/10, dan Kustom tetap memakai aturan sekarang: tabungan = penghasilan − pengeluaran.

Pembelian dari kantong tujuan tetap di luar semua wadah (SPEC-analitik-tujuan).

## Metode

### Zero-Based

**Gagasan:** setiap rupiah penghasilan diberi tugas.

**Pengaturan:**
- target per kategori (tabel `budgets` yang sudah ada, berlaku sama tiap bulan);
- satu baris **Tabungan** dalam rupiah (`metode_budget.target_tabungan`).

**Profil → Budget:**
- Form target per kategori yang sekarang hanya tampil untuk `metode === "kategori"` juga tampil untuk `zero-based`. Isian Tabungan ada di atasnya.
- Memilih Zero-Based memakai alur "isi dulu, baru simpan" seperti Kustom: tidak langsung disimpan saat diketuk.
- Pratinjau memperluas potongan "Belum dibagi"/"Melebihi penghasilan" milik Per kategori (bukan pratinjau baru). Untuk Zero-Based, potongannya Σ target, Tabungan, dan **"Belum dialokasikan Rp X"** = penghasilan − Σ target − tabungan.
  - X > 0: kuning.
  - X < 0: merah, "Lebih Rp X dari penghasilan".
  - X = 0: "Semua rupiah sudah punya tugas ✓".
- Menyimpan tetap boleh walau belum 0. Ini peringatan, bukan larangan.
- Catatan "Target per kategori tetap tersimpan, dipakai lagi kalau kembali ke Per kategori" disesuaikan: target itu juga dipakai Zero-Based.

**Analitik & Beranda.** Keduanya sekarang memilih salah satu kartu: `metode ? <KartuMetode/> : <KartuBudget/>` (`AnalitikView.tsx`, `BerandaView.tsx`). Untuk Zero-Based keduanya menampilkan **KartuBudget** (sama dengan Per kategori), ditambah blok kecil Zero-Based:
- **Analitik:** baris **Tabungan** (setoran bersih vs target, tercapai/kurang) dan baris **Belum dialokasikan** bila ≠ 0.
- **Beranda:** KartuBudget "Budget hampir habis" seperti biasa, ditambah kartu pengingat setoran seperti Pay Yourself First bila tabungan belum tercapai.

### Pay Yourself First

**Gagasan:** sisihkan tabungan dulu begitu gajian; sisanya bebas, tanpa batas per pos.

**Pengaturan:**
- persen tabungan, bawaan 20%, 1–90%;
- disimpan di `metode_budget.persen` sebagai `{"tabungan": 20}`;
- alur "isi dulu, baru simpan" seperti Kustom.

Sekarang `pilih()` menyimpan semua metode selain Kustom begitu diketuk, dan `pakaiMetode` mengirim `persen: null`. Jadi untuk PYF, Zero-Based, dan Kakeibo:
- `pilih()` membuka isiannya, tidak langsung menyimpan;
- `pakaiMetode` mengirim `persen` milik metode itu;
- pratinjau mendapat `persen` PYF, tidak hanya untuk Kustom.

**Wadah:**
- **Tabungan:** target = penghasilan × persen; realisasi = setoran nyata.
- **Bebas dipakai:** batasnya penghasilan − target tabungan, realisasinya semua pengeluaran.
  - Statusnya hanya "aman" atau "lewat", tanpa "hampir".
  - Beranda baru menandainya di "Budget hampir habis" bila **lewat** (keputusan user 31 Okt 2026).

**Beranda: kartu "Belum disisihkan" — "Rp 1.600.000 tabungan bulan ini"**, di atas daftar transaksi terbaru (bersama catatan yang belum selesai), karena paling berguna tepat setelah gajian
- **Kapan tampil:** sudah ada penghasilan masuk bulan itu, dan setoran nyata < target. Hilang sendiri begitu setoran ≥ target.
- **Data penghasilan:** Beranda sekarang hanya mengambil pengeluaran bulan ini. `ambilPengaturanMetode` sudah mengambil pemasukan 3 bulan terakhir (`masuk`), tapi hanya mengembalikan saran. Ia ditambah isian `penghasilanBulanIni`: kategori penghasilan, bulan yang diminta.
- **Tombol Sisihkan** sama dengan aksi "Sisihkan" di Profil → Tujuan: `bukaManual({ type: "transfer", kantong_tujuan_id, merchant })`, ditambah `amount` = kekurangannya (sebagai teks isian, `isianNominal`).
  - Satu tujuan: tujuannya langsung terisi.
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

- Persennya tetap (tidak bisa diatur). Yang ingin persen lain memakai Kustom.
- Dua toples tabungan dibaca terbalik: makin besar makin baik, seperti wadah tabungan sekarang.

### Kakeibo

**Gagasan:** empat pos tanpa persen, target tabungan dalam rupiah, dan refleksi di akhir bulan.

| Pos | Dihitung dari |
|---|---|
| Bertahan hidup | kebutuhan + berbagi |
| Pilihan | keinginan |
| Budaya | pengembangan diri |
| Ekstra | tak terduga |

**Pengaturan:** target tabungan dalam rupiah (`metode_budget.target_tabungan`, berlaku tiap bulan sampai diubah), dengan alur "isi dulu, baru simpan".

**Tampilan (Analitik):**
- **Bisa dibelanjakan** = penghasilan − target tabungan, dibanding total pengeluaran.
- Empat pos: nominal dan porsinya dari total, tanpa jatah per pos.
- **Tabungan:** setoran nyata vs target.

**Refleksi:**
- Mulai tanggal 25, dan di bulan yang sudah lewat, Analitik menampilkan tombol **Refleksi {nama bulan}**.
- Tombol itu membuka Tanya AI dan langsung mengirim "Refleksi Kakeibo {Nama bulan YYYY}", seperti kartu saran di layar kosong Tanya AI. Nama bulannya disebut karena prompt mengartikan "bulan ini" sebagai bulan berjalan.
- Konteks Tanya AI sekarang memberi `buka`, `terbuka`, dan `aturBulan`. Ditambah `tanyaLangsung(q)`, yang membuka lalu memanggil `tanya(q)` milik provider. `tanya` diam saja bila sedang sibuk, jadi tombolnya dinonaktifkan selama Tanya AI sibuk.
- AI menjawab empat pertanyaan Kakeibo dari data:
  - penghasilan yang dibagi (`penghasilan_dibagi`), bukan semua uang masuk;
  - target tabungan;
  - total dibelanjakan;
  - satu saran perbaikan.
- Agar angkanya tidak ditandai `ragu`, `bisa_dibelanjakan` dan `sisa` (bisa dibelanjakan − dibelanjakan) dihitung lebih dulu di isian `metode`.
- Aturan "2–5 kalimat" dilonggarkan khusus refleksi: empat poin pendek tanpa markdown (keputusan user 31 Okt 2026).

## Data & kode

**Migrasi** (bagian dari `20261108000000_fase4.sql`):
- CHECK `metode_budget.metode` + `zero-based`, `pyf`, `6-jars`, `kakeibo`;
- kolom `target_tabungan numeric(14,2) check (target_tabungan > 0)`;
- default `metode` = `'kategori'`, supaya baris bisa dibuat dari halaman lain (lihat SPEC-pelunasan).

**`metode.ts`:**
- `METODE` (juga gerbang parse di `ambilPengaturanMetode`), `LABEL_METODE`, dan `wadahMetode` (PYF, 6 Jars, Kakeibo).
- `ambilPengaturanMetode` ditambah:
  - `target_tabungan`;
  - `penghasilanBulanIni`;
  - `totalTarget` (Σ `budgets`, untuk Zero-Based; diambil di sini supaya tiap pemanggil tidak menghitung sendiri);
  - `keTujuan` versi setoran bersih: mengambil pindah kantong yang dari **atau** ke kantong tujuan.
- **`hitungMetode` diperluas, bukan diganti:**
  - wadah menandai sumber realisasinya: `pengeluaran`, `setoran-tujuan`, `setoran-total`, atau `sisa`;
  - Kakeibo boleh tanpa target per wadah;
  - Zero-Based mengembalikan baris tabungan dan belum dialokasikan;
  - semua masukan baru opsional, karena `uji-metode.mts` memanggil `hitungMetode({metode, persen, penghasilan})` tanpa isian baru.
- **Metode lama tetap lulus `uji:metode` tanpa diubah.** Itu bukti angkanya tidak bergeser.
  - Pengecualian: tes `keTujuan`, yang memang berubah menjadi setoran bersih.

**Pemanggil `hitungMetode`/`ambilPengaturanMetode` yang ikut diubah:**
- `analitik/page.tsx` + `AnalitikView.tsx` (pilihan kartu untuk Zero-Based, blok Zero-Based, tombol refleksi Kakeibo);
- `(app)/page.tsx` + `BerandaView.tsx` (pilihan kartu, kartu "Belum disisihkan");
- `tanya-server.ts`;
- `profil/budget/BudgetView.tsx`.

**`KartuMetode`:**
- Tidak menulis `{persen}%` untuk wadah tanpa persen (Kakeibo).
- Ikon & warna wadah baru di `IKON` (sekarang wadah tak dikenal jatuh ke ikon Kebutuhan). Warnanya diuji buta warna terhadap tetangganya, seperti warna yang sudah ada.
- Baris "Disisihkan ke tujuan" tidak ditampilkan bila metode itu sudah punya wadah setoran tujuan (6 Jars, PYF, Zero-Based, Kakeibo), supaya tidak dobel.
- Mode Beranda (`judul`) sekarang membuang semua wadah tabungan. Itu tetap; "Bebas dipakai" PYF hanya ikut bila lewat.

**Tautan ke Riwayat (`AnalitikView`):**
- sekarang memakai kelompok untuk wadah bukan tabungan;
- wadah bersumber `setoran-tujuan` membuka Riwayat pindah kantong ke tujuan;
- wadah bersumber `sisa` tidak bisa diketuk.

**Tanya AI (`tanya-server.ts`, ringkasan bulan):**
- Isian `metode` memuat wadah baru, setoran bersih, `bisa_dibelanjakan` dan `sisa` (Kakeibo), serta belum dialokasikan (Zero-Based).
- Catatan per wadah tabungan sekarang selalu "tabungan = penghasilan dikurangi pengeluaran selain tabungan". Catatan itu dibuat mengikuti sumber realisasinya; untuk metode setoran nyata: "tabungan = yang benar-benar disisihkan bulan ini".
- Aturan prompt baru:
  - di metode setoran nyata, "tabungan" berarti yang disisihkan, bukan sisa;
  - "Refleksi Kakeibo {bulan}": pakai bulan yang disebut, jawab empat poin dengan angka dari isian `metode`.

## Pengujian

**`uji:metode`, untuk tiap metode baru dengan data contoh:**
- target, realisasi, dan status tiap wadah;
- setoran bersih: setor 1 jt lalu tarik 400 rb → 600 rb; pindah antar-tujuan tidak dihitung; pelengkap tidak dihitung;
- pembelian dari tujuan tetap di luar;
- Zero-Based belum dialokasikan positif, nol, dan negatif;
- PYF "Bebas dipakai" hanya "lewat" bila melebihi penghasilan − target, tidak pernah "hampir".

**`eval:tanya`.** Akun eval sekarang memasang 50/30/20 sekali di awal (`insert`), dan kasus 14 bergantung padanya. Datanya juga tidak punya setoran ke tujuan maupun pengeluaran Pendidikan, dan menambahkannya akan menggeser angka harapan 8 kasus lama. Jadi:
- Tiap kasus mendapat isian opsional `metode` dan `siapkan` (data tambahan khusus kasus itu, dihapus setelahnya).
  - Metode dipasang dengan `upsert`, menggantikan `insert`.
  - Kasus berikutnya kembali ke 50/30/20 tanpa data tambahan.
- Kasus "bagaimana toples 6 jars-ku?":
  - `siapkan`: setor ke tujuan dari BCA, beli kursus (Pendidikan);
  - harapan: angka toples Pendidikan dan Tabungan jangka panjang.
- Kasus "Refleksi Kakeibo {bulan}":
  - `siapkan`: target tabungan;
  - harapan: penghasilan, target, total belanja, dan sisa; tidak `ragu`.

**E2E** (skrip ad-hoc di scratchpad sesi; suite `fase3` sudah menguji Profil → Budget, diperluas atau suite baru `metode`):
- pilih tiap metode di Profil → Budget; PYF/Zero-Based/Kakeibo tidak tersimpan sebelum diisi;
- pratinjau benar;
- Analitik menampilkan wadahnya; Zero-Based menampilkan KartuBudget dan blok Zero-Based;
- Beranda menampilkan "Belum disisihkan" untuk PYF dan hilang setelah sisihkan;
- tombol refleksi muncul di bulan lalu dan mengirim nama bulan yang benar.

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
