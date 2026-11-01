# Spec: Kelompok baru — Pengembangan diri & Tak terduga

Status: **diterapkan** · rilis 2.8.0 · disetujui 31 Oktober 2026 · modul `kelompok-baru` (PETA-fase4) · disinkronkan dengan kode 1 Nov 2026

## Masalah

6 Jars punya toples **Pendidikan**; Kakeibo punya **Budaya** (buku, kursus, seni) dan **Ekstra** (tak terduga).

Empat kelompok yang ada (kebutuhan, keinginan, tabungan, berbagi) tidak bisa membedakan keduanya.

## Rancangan

### Kelompok baru

| id | Nama | Contoh | Di 6 Jars | Di Kakeibo |
|---|---|---|---|---|
| `pengembangan` | Pengembangan diri | kursus, buku, seminar, sertifikasi, museum | Pendidikan | Budaya |
| `tak_terduga` | Tak terduga | servis mendadak, berobat darurat, ganti HP rusak | Kebutuhan | Ekstra |

`KELOMPOK` di `metode.ts` kini enam nilai (urutan: kebutuhan, keinginan, tabungan, berbagi, pengembangan, tak_terduga); `NAMA_KELOMPOK` memberi namanya.

### Di metode yang sudah ada

Kedua kelompok baru dihitung sebagai **Kebutuhan**, jadi angka siapa pun tidak berubah sampai mereka memakainya.

Daftar kelompok tiap wadah ditulis keras di `wadahMetode` (`metode.ts`), lewat konstanta `IKUT_KEBUTUHAN = ["pengembangan", "tak_terduga"]`:

| Metode | Wadah | Kelompok lama | Ditambah |
|---|---|---|---|
| 50/30/20 | Kebutuhan | kebutuhan, berbagi | pengembangan, tak_terduga |
| 80/20 | Pengeluaran | kebutuhan, keinginan, berbagi | pengembangan, tak_terduga |
| 70/20/10 | Biaya hidup | kebutuhan, keinginan | pengembangan, tak_terduga |

**Kustom:**
- Tetap empat isian persen.
- Daftar baru `KELOMPOK_KUSTOM` (empat kelompok lama) dipakai oleh `wadahMetode("kustom")`, `cekPersen`, tipe `PengaturanMetode.persen`, dan BudgetView (`PERSEN_AWAL`, state `persen`, form kustom).
- Wadah kustom `kebutuhan` menghitung `kebutuhan`, `pengembangan`, dan `tak_terduga`.
- Tanpa ini, kustom membuat wadah 0% untuk kelompok baru lalu membuangnya. Pengeluarannya tidak masuk wadah mana pun, tapi tetap mengurangi Tabungan.
- `cekPersen` hanya memeriksa empat kunci itu; kunci lain di masukan diabaikan. Pengaturan kustom yang sudah tersimpan (empat kunci di `persen` jsonb) tetap sah.

### Kategori bawaan

Satu kategori pengeluaran baru, **Pendidikan**:
- `education`, kelompok `pengembangan`;
- ikon `graduation-cap` (sudah ada di daftar ikon kategori);
- warna `#3e91ff` (sama dengan Transportasi). Warna harus dari `WARNA_KATEGORI`, kalau tidak, `validasiKategori` menolak suntingannya di Profil → Kategori;
- sort 9 (sesudah Biaya admin, sebelum Lainnya 99).

**Ditambahkan di tiga tempat:**
- Seed user baru, di dua tempat yang harus sama: `public.seed_kategori_bawaan` (database) dan `KATEGORI_BAWAAN` (`src/lib/kategori.ts`).
- User lama: hanya yang belum punya slug `education` **dan** belum punya kategori pengeluaran bernama "pendidikan" (`lower(btrim(name))`). Indeks unik `idx_categories_nama` ada di `(user_id, type, lower(btrim(name)))`, dan label ikon `graduation-cap` memang "Pendidikan", jadi kategori buatan sendiri dengan nama itu mungkin sudah ada. Tanpa pengecualian ini, migrasi gagal. Sisipan juga memakai `on conflict do nothing`.

**Tak terduga** tidak mendapat kategori. Ia dipilih per transaksi, karena servis motor biasa adalah Kebutuhan dan baru jadi Tak terduga kalau mendadak.

### AI

**Aturan `kelompok` di prompt ekstraksi** (`extract.ts`) ditambah:
- `pengembangan`: kursus, buku, seminar, sertifikasi, workshop;
- `tak_terduga` **hanya** bila teks menyebut mendadak/darurat/rusak ("ban bocor", "HP jatuh rusak, servis", "berobat darurat"); servis atau berobat biasa: null;
- selain itu tetap null.

**Petunjuk kategori bawaan** (`PETUNJUK` di `extract.ts`) ditambah `education`: "kursus/buku pelajaran/seminar/SPP".

### Tempat yang ikut

**Ikut otomatis** lewat `KELOMPOK`/`NAMA_KELOMPOK` di `metode.ts`:
- pemilih kelompok di Edit transaksi (`TransactionFields`), Pecah transaksi, dan Profil → Kategori (`KategoriView`);
- filter kelompok di Riwayat (`riwayat.ts`, nilai dari URL; chip-nya memakai `NAMA_KELOMPOK`);
- `/api/kategori-merchant`;
- `transaksi-input.ts`;
- `validasiKategori` di `kategori.ts`;
- `extract.ts`: `kelompokAtauNull` (penyaring hasil AI untuk `kelompok`, `rincian[].kelompok`, `usulan_pecah[].kelompok`) dan `geminiSchema` (enum `kelompok` dan `usulan_pecah[].kelompok`);
- `tanya.ts`: enum `kelompok` di fungsi `usul_ubah_kategori` (SPEC-ingat-kategori);
- ekspor;
- halaman detail.

**Ditulis keras (hardcoded), harus diubah tangan:**
- `wadahMetode` di `metode.ts` (lihat di atas);
- `extract.ts`: teks skema di prompt untuk `kelompok`, `rincian[].kelompok`, dan `usulan_pecah[].kelompok` (dari SPEC-tawar-pecah, yang dibangun lebih dulu), serta aturan `kelompok` di prompt;
- database: CHECK `kelompok` dan `private.kelompok_bawaan` (lihat Migrasi).

Ikon & warna wadah (`KartuMetode.IKON`) diberi kunci per **wadah**, bukan per kelompok. Wadah baru ada di SPEC-metode-lanjutan, jadi ikonnya diatur di sana.

### Migrasi

Bagian dari `20261108000000_fase4.sql`:
- CHECK `kelompok` di `public.categories` (`categories_kelompok_check`) dan `private.transaksi_data` (`transaksi_data_kelompok_check`) dibuang lalu dibuat ulang dengan dua nilai baru;
- `private.kelompok_bawaan('education')` → `pengembangan`;
- `public.seed_kategori_bawaan` ditambah Pendidikan;
- sisipan Pendidikan untuk user lama, dengan pengecualian di atas. Kelompoknya diisi trigger `kategori_kelompok` lewat `kelompok_bawaan`.

## Pengujian

**`uji:metode`:**
- `KELOMPOK` enam nilai, `KELOMPOK_KUSTOM` empat;
- pengeluaran berkelompok `pengembangan`/`tak_terduga` menghasilkan realisasi wadah yang sama persis dengan bila berkelompok `kebutuhan`, di 50/30/20, 80/20, 70/20/10, dan kustom (termasuk Tabungan);
- kustom tanpa persen untuk kelompok baru tidak membuat wadahnya; `cekPersen` mengabaikan kunci di luar empat kelompok.

**`uji:kategori`:**
- `validasiKategori` menerima dua kelompok baru dan menolak yang lain ("mewah"); kelompok kosong → keinginan;
- warna & ikon Pendidikan bawaan lolos `validasiKategori`;
- `normalize` (hasil AI) menerima `pengembangan` dan mengubah kelompok asing jadi null.

**Dry-run migrasi** (dalam transaksi yang di-rollback, sebagai `authenticated` dengan akun sementara):
- insert kategori & transaksi berkelompok baru berhasil, nilai asing ditolak;
- Pendidikan muncul untuk user lama;
- user yang sudah punya kategori "Pendidikan" buatan sendiri dilewati tanpa galat;
- user baru mendapat Pendidikan dari seed.

**Regresi:** semua `uji:*` dan suite E2E.

## Boundaries

- **Jangan:** mengubah kelompok kategori yang sudah ada; menambah isian persen kustom menjadi enam.
- **Tanya dulu:** kategori bawaan untuk Tak terduga.
