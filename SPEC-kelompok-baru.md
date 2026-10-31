# Spec: Kelompok baru — Pengembangan diri & Tak terduga

Status: **disetujui** · 31 Oktober 2026, setelah cek silang dengan kode · modul `kelompok-baru` (PETA-fase4)

## Masalah

6 Jars punya toples **Pendidikan**; Kakeibo punya **Budaya** (buku, kursus, seni) dan **Ekstra** (tak terduga).

Empat kelompok yang ada (kebutuhan, keinginan, tabungan, berbagi) tidak bisa membedakan keduanya.

## Rancangan

### Kelompok baru

| id | Nama | Contoh | Di 6 Jars | Di Kakeibo |
|---|---|---|---|---|
| `pengembangan` | Pengembangan diri | kursus, buku, seminar, sertifikasi, museum | Pendidikan | Budaya |
| `tak_terduga` | Tak terduga | servis mendadak, berobat darurat, ganti HP rusak | Kebutuhan | Ekstra |

### Di metode yang sudah ada

Kedua kelompok baru dihitung sebagai **Kebutuhan**, jadi angka siapa pun tidak berubah sampai mereka memakainya.

Daftar kelompok tiap wadah ditulis keras di `wadahMetode` (`metode.ts`). Wadah Kebutuhan/biaya hidup di tiap metode ditambah `pengembangan` dan `tak_terduga`:

| Metode | Wadah | Kelompok sekarang | Ditambah |
|---|---|---|---|
| 50/30/20 | Kebutuhan | kebutuhan, berbagi | pengembangan, tak_terduga |
| 80/20 | Pengeluaran | kebutuhan, keinginan, berbagi | pengembangan, tak_terduga |
| 70/20/10 | Biaya hidup | kebutuhan, keinginan | pengembangan, tak_terduga |

**Kustom:**
- Tetap empat isian persen.
- Daftar baru `KELOMPOK_KUSTOM` (empat kelompok lama) dipakai oleh `wadahMetode("kustom")`, `cekPersen`, tipe `PengaturanMetode.persen`, dan BudgetView (`PERSEN_AWAL`, state `persen`, form kustom).
- Wadah kustom `kebutuhan` menghitung `kebutuhan`, `pengembangan`, dan `tak_terduga`.
- Tanpa ini, kustom membuat wadah 0% untuk kelompok baru lalu membuangnya. Pengeluarannya tidak masuk wadah mana pun, tapi tetap mengurangi Tabungan.
- Pengaturan kustom yang sudah tersimpan (empat kunci di `persen` jsonb) tetap sah.

### Kategori bawaan

Satu kategori pengeluaran baru, **Pendidikan**:
- `education`, kelompok `pengembangan`;
- ikon `graduation-cap` (sudah ada di daftar ikon kategori);
- warna `#3e91ff`. Warna harus dari `WARNA_KATEGORI`, kalau tidak, `validasiKategori` menolak suntingannya di Profil → Kategori;
- sort 9.

**Ditambahkan di tiga tempat:**
- Seed user baru, di dua tempat yang harus sama: `public.seed_kategori_bawaan` (database) dan `KATEGORI_BAWAAN` (`src/lib/kategori.ts`).
- User lama: hanya yang belum punya slug `education` **dan** belum punya kategori pengeluaran bernama "pendidikan" (huruf apa pun). Indeks unik `idx_categories_nama` ada di `(user_id, type, lower(btrim(name)))`, dan label ikon `graduation-cap` memang "Pendidikan", jadi kategori buatan sendiri dengan nama itu mungkin sudah ada. Tanpa pengecualian ini, migrasi gagal.

**Tak terduga** tidak mendapat kategori. Ia dipilih per transaksi, karena servis motor biasa adalah Kebutuhan dan baru jadi Tak terduga kalau mendadak.

### AI

**Aturan `kelompok` di prompt ekstraksi** ditambah:
- `pengembangan`: kursus, buku, seminar, sertifikasi, workshop;
- `tak_terduga` **hanya** bila teks menyebut mendadak/darurat/rusak ("ban bocor", "HP jatuh rusak, servis");
- selain itu tetap null.

**Petunjuk kategori bawaan** (`PETUNJUK` di `extract.ts`) ditambah `education`: kursus, buku pelajaran, seminar, SPP.

### Tempat yang ikut

**Ikut otomatis** lewat `KELOMPOK`/`NAMA_KELOMPOK` di `metode.ts`:
- pemilih kelompok di Edit transaksi (`TransactionFields`), Pecah transaksi, dan Profil → Kategori;
- filter kelompok di Riwayat (`riwayat.ts`);
- `/api/kategori-merchant`;
- `transaksi-input.ts`;
- ekspor;
- halaman detail.

**Ditulis keras (hardcoded), harus diubah tangan:**
- `wadahMetode` di `metode.ts` (keempat metode, lihat di atas);
- `validasiKategori` di `kategori.ts`;
- `extract.ts`:
  - skema di prompt: isian `kelompok`, `rincian[].kelompok`, dan `usulan_pecah[].kelompok` (dari SPEC-tawar-pecah, yang dibangun lebih dulu);
  - `KELOMPOK_SAH`;
  - `geminiSchema`: enum `kelompok` dan enum `usulan_pecah[].kelompok`;
- `tanya.ts`: enum `kelompok` di fungsi `usul_ubah_kategori` (SPEC-ingat-kategori).

Ikon & warna wadah (`KartuMetode.IKON`) diberi kunci per **wadah**, bukan per kelompok. Wadah baru baru ada di SPEC-metode-lanjutan, jadi ikonnya diatur di sana.

### Migrasi

Bagian dari `20261108000000_fase4.sql`:
- CHECK `kelompok` di `public.categories` dan `private.transaksi_data` ditambah dua nilai (constraint lama dibuang dulu, nama dipastikan saat dry-run);
- `private.kelompok_bawaan('education')` → `pengembangan`;
- `public.seed_kategori_bawaan` ditambah Pendidikan;
- sisipan Pendidikan untuk user lama, dengan pengecualian di atas.

## Pengujian

**`uji:metode`:**
- pengeluaran berkelompok `pengembangan`/`tak_terduga` masuk Kebutuhan di 50/30/20, 80/20, 70/20/10, dan kustom;
- Tabungan kustom tidak berubah dibanding kalau pengeluaran yang sama berkelompok `kebutuhan`;
- `cekPersen` tetap meminta empat kelompok.

**`uji:kategori`:** `validasiKategori` menerima dua kelompok baru dan menolak yang lain.

**Dry-run migrasi** (dalam transaksi yang di-rollback, sebagai `authenticated` dengan akun sementara):
- insert kategori & transaksi berkelompok baru berhasil, nilai asing ditolak;
- Pendidikan muncul untuk user lama;
- user yang sudah punya kategori "Pendidikan" buatan sendiri dilewati tanpa galat;
- user baru mendapat Pendidikan dari seed.

**Regresi:** semua `uji:*` dan suite E2E (skrip ad-hoc di scratchpad sesi, lihat SPEC-tawar-pecah).

## Boundaries

- **Jangan:** mengubah kelompok kategori yang sudah ada; menambah isian persen kustom menjadi enam.
- **Tanya dulu:** kategori bawaan untuk Tak terduga.
