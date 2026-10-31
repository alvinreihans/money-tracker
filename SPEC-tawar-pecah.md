# Spec: AI menawarkan pecah struk campuran

Status: **disetujui** · 31 Oktober 2026, setelah cek silang dengan kode · modul `tawar-pecah` (PETA-fase4)

## Masalah

Struk Indomaret Rp 87.500 berisi beras, sabun, dan cokelat tercatat sebagai satu transaksi "Belanja harian".
- Cokelat (keinginan) ikut terhitung kebutuhan.
- Pecah transaksi sudah ada, tapi harus diisi tangan dari awal.

SPEC-metode-budget sengaja menunda bagian ini: "menawarkan, bukan langsung memecah".

## Keputusan user (28 Okt 2026)

- **Pemicu:** barang di struk berbeda **kategori** (tidak harus beda kelompok).
- **Tempat:** kartu hasil Catat **dan** halaman detail transaksi. Tawarannya bertahan di detail sampai dipecah atau ditutup.

## Rancangan

### 1. Ekstraksi

Skema AI mendapat isian baru `usulan_pecah`. Isian ini **hanya dari struk**; teks ketikan tetap memakai `rincian` yang sudah ada.

```json
"usulan_pecah": [{ "category": "groceries", "kelompok": null, "subtotal": 74000, "barang": "Beras 5 kg, sabun" }] | null
```

**Isi per kelompok barang:**
- AI mengelompokkan barang per kategori;
- `subtotal` = jumlah harga barang **sebelum** diskon/pajak;
- `barang` = nama barang singkat, maksimal 200 karakter.

**Diskon, PPN, dan biaya layanan dibagi aplikasi, bukan AI:**
- tiap subtotal diskalakan ke `amount` (yang benar-benar dibayar) secara proporsional;
- dibulatkan ke rupiah utuh;
- sisa pembulatan masuk ke bagian terbesar;
- hasilnya selalu pas sama dengan `amount`.

**Dibuang (tetap satu transaksi)** bila salah satu berlaku. Lebih baik tidak menawarkan daripada menawarkan yang salah.
- kurang dari 2 kelompok;
- lebih dari 10 kelompok;
- semua kelompok berkategori sama;
- ada subtotal ≤ 0;
- Σ subtotal menyimpang lebih dari 25% dari `amount` (tanda AI salah baca).

**Kategori & kelompok:** kategori di luar daftar milik user jatuh ke "Lainnya" (sama dengan `rincianAtauNull`). Kelompok di luar yang sah menjadi null.

**Fungsi murni baru** `usulanPecah(usulan, amount, kategori)` di `extract.ts`, berdampingan dengan `rincianAtauNull`.

**Hanya dari struk:**
- Kedua jalur struk sekarang adalah Gemini Vision (jalur pertama) dan OCR → Groq (cadangan, `extractWithGroq` dengan `diketik = false`) (`receipt.ts`).
- Prompt Groq dipakai bersama oleh teks ketikan dan OCR, dan `normalize` tidak tahu asalnya. Karena itu `normalize` mendapat penanda `dariStruk`, yang diisi hanya oleh kedua jalur struk.
- Jalur ketikan, koreksi, dan jawaban draft (`processReceiptText`) membuang `usulan_pecah`.

**Skema:**
- Prompt bersama (`buildSystemPrompt`) mendapat skema dan aturan `usulan_pecah`. Enum kelompoknya ikut daftar kelompok yang sah (lihat SPEC-kelompok-baru).
- `geminiSchema` mendapat properti `usulan_pecah` (array objek, `kelompok` sebagai enum). Skema itu daftar tertutup; tanpa properti ini, isiannya tidak pernah keluar.
- Groq memakai mode `json_object` biasa, jadi tidak perlu skema.

**Diteruskan sampai simpan.** Bidangnya ditulis satu per satu, bukan diteruskan otomatis:
- `src/types/transaction.ts`: `ExtractedReceipt.usulan_pecah` dan `Transaction.usulan_pecah`.
- `receipt.ts`: `TransactionRow`, `emptyDraft()`, dan `toTransactionRow` (di samping `rincian`).
- `simpan-transaksi.ts`:
  - `usulan_pecah` dikeluarkan dari `input` di destrukturisasi awal (bersama `rincian`), supaya tidak ikut tersimpan lewat `...row` di cabang draft paylater;
  - dipasang ke `row` tepat sebelum insert terakhir, hanya bila `row.type === "expense"`, bukan pinjaman, bukan cicilan, bukan paylater, dan tidak dipecah dari `rincian`.

### 2. Penyimpanan

**Kolom baru** `private.transaksi_data.usulan_pecah_enc bytea`, terenkripsi seperti `description` karena berisi nama barang:
- Isinya JSON bagian yang sudah diskalakan: `[{amount, category, kelompok, description}]`.
- View `public.transactions` (definisi terakhir di `20261107000000_normalisasi.sql`) mendapat `usulan_pecah` (teks JSON, didekripsi) di akhir, setelah `updated_at`, lewat `create or replace view`.

**Trigger `transactions_tulis`:**
- **INSERT** menulis `usulan_pecah`. Urungkan hapus memasukkan kembali baris `select("*")` (`DeleteTransactionButton`), jadi tawarannya ikut kembali.
- **UPDATE** mengosongkannya bila `new.amount is distinct from old.amount`. Selain itu ia mengikuti nilai baru dengan pola `is not distinct from`, seperti `description`.

**Dikosongkan (null) ketika:**
- user menutup tawaran: update `usulan_pecah = null`;
- user menyimpan lembar Pecah transaksi, apa pun hasilnya (juga bila semua bagian dihapus sampai tinggal satu dan nominalnya tidak berubah). `PecahTransaksi.simpan()` menyertakan `usulan_pecah: null` di update transaksi asli;
- nominal berubah lewat jalan mana pun: Edit transaksi, koreksi di obrolan ("eh tadi 90rb"), atau jawaban draft. Trigger UPDATE di atas yang menangani.

**Diterima sebagai batas:**
- "Batalkan perubahan" setelah koreksi mengembalikan nominal, tapi tidak mengembalikan usulannya.
- Draft yang dibereskan dengan mengubah nominal (jawaban nominal, atau cerita yang dibaca ulang lewat `processReceiptText`) kehilangan usulannya.
- Usulan hanya bertahan pada draft yang kurang kantong, jam, arah, atau cek duplikat.

### 3. Tampilan

**Kartu hasil di obrolan Catat** (`kartu()` di `Obrolan.tsx`):
- Satu baris di bawah transaksi: **"Isinya campur: Belanja harian Rp 74.000 · Makan Rp 13.500"**, nominal dengan `fmtIDR`, dan tombol **Pecah**.
- Pecah membuka lembar "Pecah transaksi" yang sudah ada, **terisi usulan**. User memeriksa, boleh mengubah, lalu Simpan. Tidak ada yang tersimpan sebelum Simpan ditekan.
- Struk selalu masuk obrolan besar (`catatFoto`/`lampirkan` memanggil `setBesar(true)`), jadi lembar ringkas tidak perlu tawaran.
- Struk dari Bagikan (antrean `useAntreanStruk`) tidak punya kartu hasil. Tawarannya hanya muncul di halaman detail.

**Halaman detail:**
- Kartu tawaran **paling atas** (di tempat peringatan draft), supaya tidak tenggelam di bawah lipatan layar: "Isi struk ini campur", rincian singkat, tombol **Pecah** dan **Tutup**. Selama tawaran tampil, tombol "Pecah transaksi" di bawah tidak ditampilkan (tawaran sudah membuka lembar yang sama).
- Tutup mengosongkan usulan, dan tawaran tidak muncul lagi.
- Draft ("Belum selesai") tidak menampilkan tawaran, sama seperti "Pecah transaksi" yang disembunyikan untuk draft (`DetailView`). Lihat batas di §2.

**Mengisi lembar dari usulan:** kategori yang sudah tidak ada (dihapus setelah usulan dibuat) diganti "Lainnya". Tanpa itu, bagian baru ditolak FK `transaksi_data_kategori_fkey`.

**Membatalkan:** sesudah dipecah, "Gabungkan lagi jadi satu" yang sudah ada mengembalikannya jadi satu. Tawarannya tidak muncul lagi karena usulannya sudah dikosongkan.

**Kode:**
- `PecahTransaksi` sekarang hanya punya state `buka` internal. Ia mendapat prop opsional `usulan` (isi awal lembar) dan cara dibuka dari luar (dari kartu Obrolan dan kartu tawaran detail).
- Tidak ada mekanisme pecah kedua.

### 4. Tanya AI & ekspor

Tidak berubah. Tanya AI memilih kolom secara eksplisit dan ekspor memakai `KOLOM_EKSPOR`, jadi usulan tidak bocor ke keduanya.

## Pengujian

**`uji:kategori`** (tempat `normalize` sudah diuji):
- `usulanPecah`:
  - skala proporsional dengan diskon dan dengan PPN;
  - sisa pembulatan masuk ke bagian terbesar;
  - Σ = amount;
  - dibuang bila satu kategori, menyimpang lebih dari 25%, kurang dari 2 bagian, atau lebih dari 10 bagian.
- `normalize` tanpa `dariStruk` membuang `usulan_pecah`.
- `rincianAtauNull` (belum pernah diuji): jumlah pas diterima, jumlah tidak pas dibuang, kategori asing jatuh ke Lainnya.

**Dry-run migrasi:**
- mengubah `amount` lewat view mengosongkan `usulan_pecah`, sedangkan mengubah kolom lain tidak;
- insert lewat view menyimpan `usulan_pecah` dan bisa dibaca kembali.

**E2E.** Suite E2E bukan bagian repo: skrip ad-hoc Playwright di folder scratchpad sesi (`e2e-kepala2.mjs` + `e2e-ekor-<suite>.mjs`, dijalankan `jalankan-e2e.sh` terhadap dev server). Suite baru `pecah`, dengan usulan disuntik lewat insert langsung tanpa memanggil AI:
- tawaran tampil di detail dan Pecah membuka lembar terisi;
- Simpan menghasilkan bagian yang benar dan tawaran hilang;
- Tutup menghilangkan tawaran;
- ubah nominal menghilangkan tawaran;
- draft tidak menampilkan tawaran;
- usulan berisi kategori yang sudah dihapus tetap bisa disimpan (jatuh ke Lainnya).

**Ekstraksi sungguhan:** satu struk contoh campuran dicoba manual lewat Catat. Hasilnya dilaporkan, tidak otomatis.

**Regresi:** semua `uji:*`, semua suite E2E, typecheck, `next build`.

## Boundaries

- **Jangan:**
  - memecah otomatis;
  - menawarkan dari teks ketikan;
  - menyimpan usulan tanpa enkripsi;
  - membuat lembar pecah kedua.
- **Tanya dulu:** menawarkan juga untuk struk sekategori yang beda kelompok (mis. nasi biasa + kopi premium).
