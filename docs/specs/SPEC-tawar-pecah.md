# Spec: AI menawarkan pecah struk campuran

Status: **diterapkan** · rilis 2.8.0 · 31 Oktober 2026 · modul `tawar-pecah` (PETA-fase4) · disinkronkan dengan kode 1 Nov 2026

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
- Kedua jalur struk adalah Gemini Vision (jalur pertama, `extractWithGeminiVision`) dan OCR → Groq (cadangan, `extractWithGroq` dengan `diketik = false`) (`processReceiptImage` di `receipt.ts`).
- `normalize` mendapat penanda `dariStruk` (parameter ketiga). Yang mengisinya `true` hanya `extractWithGeminiVision` dan `extractWithGroq` saat `!diketik`.
- Jalur ketikan, koreksi, dan jawaban draft (`processReceiptText`: Groq dengan `diketik = true`, lalu cadangan `extractTextWithGemini`) membuang `usulan_pecah`.
- Pinjaman juga tidak pernah membawa usulan (`normalize`).

**Skema:**
- `buildSystemPrompt(tanggal, konteks, sumber)` dipisah per sumber (sejak 2.9.0, SPEC-ai-kantong): skema dan aturan `usulan_pecah` hanya ada di prompt `"struk"` (gambar/OCR); prompt `"ketik"` hanya memuat `rincian`. Aturannya: hanya struk belanja yang daftar barangnya terbaca dan masuk ≥ 2 kategori; bukti bayar e-wallet, barang sekategori, atau daftar tak terbaca → null. Enum kelompoknya ikut daftar kelompok yang sah (lihat SPEC-kelompok-baru).
- `geminiSchema` mendapat properti `usulan_pecah` (array objek nullable; `category`, `subtotal`, `barang` wajib; `kelompok` enum nullable). Skema itu daftar tertutup; tanpa properti ini, isiannya tidak pernah keluar.
- Groq memakai mode `json_object` biasa, jadi tidak perlu skema.

**Diteruskan sampai simpan.** Bidangnya ditulis satu per satu, bukan diteruskan otomatis:
- `src/types/transaction.ts`: `ExtractedReceipt.usulan_pecah` dan `Transaction.usulan_pecah`.
- `receipt.ts`: `TransactionRow`, `emptyDraft()`, dan `toTransactionRow` (di samping `rincian`).
- `simpan-transaksi.ts`:
  - `usulan_pecah` dikeluarkan dari `input` di destrukturisasi awal (bersama `rincian`), supaya tidak ikut tersimpan lewat `...row` di cabang draft paylater;
  - dipasang ke `row` (sebagai teks JSON) tepat sebelum insert terakhir, hanya bila dari AI, `row.type === "expense"`, bukan pinjaman, bukan cicilan, tidak dipecah dari `rincian`, dan Σ bagian = `row.amount`. Belanja paylater sudah keluar lebih awal lewat cabang paylater, jadi tidak pernah membawa usulan.

### 2. Penyimpanan

**Kolom baru** `private.transaksi_data.usulan_pecah_enc bytea`, terenkripsi seperti `description` karena berisi nama barang:
- Isinya JSON bagian yang sudah diskalakan: `[{amount, category, kelompok, description}]`.
- Migrasi `20261108000000_fase4.sql`: view `public.transactions` (dasar dari `20261107000000_normalisasi.sql`) mendapat `usulan_pecah` (teks JSON, didekripsi) di akhir, setelah `updated_at`, lewat `create or replace view`. Trigger tulisnya ditulis ulang lagi di `20261109000000_isolasi_rujukan.sql` (perilaku `usulan_pecah` sama).

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
- Satu baris di bawah transaksi: **"Isinya campur: Belanja harian Rp 74.000 · Makan Rp 13.500"** (`ringkasUsulan`, nominal dengan `fmtIDR`), dan tombol **Pecah** di baris aksi kartu (di samping Batalkan, Ubah). Tidak tampil pada kartu yang dibatalkan atau kartu perbaikan.
- Pecah membuka lembar "Pecah transaksi" yang sudah ada, **terisi usulan** (`PecahTransaksi` dengan `hanyaLembar`). User memeriksa, boleh mengubah, lalu Simpan. Tidak ada yang tersimpan sebelum Simpan ditekan. Setelah dipecah (≥ 2 bagian), baris tawaran hilang dari kartu.
- Struk selalu masuk obrolan besar (`catatFoto`/`lampirkan` memanggil `setBesar(true)`), jadi lembar ringkas tidak perlu tawaran.
- Struk dari Bagikan (antrean `useAntreanStruk`) tidak punya kartu hasil. Tawarannya hanya muncul di halaman detail.

**Halaman detail:**
- Kartu tawaran **paling atas** (setelah tempat peringatan draft, sebelum rincian), supaya tidak tenggelam di bawah lipatan layar: `Pesan` info berjudul "Isi struk ini campur", isi "Belanja harian Rp 70.000 · Makan Rp 17.500. Pecah supaya tiap bagian masuk kategorinya sendiri?", tombol **Pecah** dan **Tutup**.
- Tombol "Pecah transaksi" di bawah **tetap tampil** selama tawaran ada (`DetailView` merender `PecahTransaksi` kedua tanpa usulan); ia membuka lembar kosong biasa, bukan berisi usulan.
- Tutup mengosongkan usulan (snackbar "Tawaran pecah ditutup"), dan tawaran tidak muncul lagi.
- Tawaran hanya untuk pengeluaran yang belum terpecah.
- Draft ("Belum selesai") tidak menampilkan tawaran, sama seperti "Pecah transaksi" yang disembunyikan untuk draft (`DetailView`). Lihat batas di §2.

**Mengisi lembar dari usulan:** kategori yang sudah tidak ada (dihapus setelah usulan dibuat) diganti "Lainnya". Tanpa itu, bagian baru ditolak FK `transaksi_data_kategori_fkey`.

**Membatalkan:** sesudah dipecah, "Gabungkan lagi jadi satu" yang sudah ada mengembalikannya jadi satu. Tawarannya tidak muncul lagi karena usulannya sudah dikosongkan.

**Kode:**
- `PecahTransaksi` mendapat prop opsional `usulan` (dengan usulan, yang dirender kartu tawaran, bukan tombol), `hanyaLembar` (langsung membuka lembar berisi usulan, dipakai kartu Obrolan) dan `onSelesai(disimpan)`.
- Pembantu di `PecahTransaksi.tsx`: `bacaUsulan(tx)` (parse JSON; rusak atau < 2 bagian → null) dan `ringkasUsulan(usulan, kategori)`.
- Tidak ada mekanisme pecah kedua.

### 4. Tanya AI & ekspor

Tidak berubah. Tanya AI memilih kolom secara eksplisit dan ekspor memakai `KOLOM_EKSPOR`, jadi usulan tidak bocor ke keduanya.

## Pengujian

**`uji:kategori`** (tempat `normalize` sudah diuji):
- `usulanPecah`:
  - skala proporsional dengan diskon dan dengan PPN;
  - sisa pembulatan masuk ke bagian terbesar;
  - Σ = amount;
  - dibuang bila satu kategori, menyimpang lebih dari 25% (tepat 25% masih diterima), kurang dari 2 bagian, lebih dari 10 bagian, atau ada subtotal 0;
  - kategori asing jatuh ke Lainnya.
- `normalize` tanpa `dariStruk` membuang `usulan_pecah`; pinjaman juga.
- `rincianAtauNull` (lewat `normalize`, tidak diekspor): jumlah pas diterima, jumlah tidak pas dibuang, kategori asing jatuh ke Lainnya.
- Prompt per sumber: `"ketik"` tanpa `usulan_pecah`, `"struk"` tanpa `rincian`.

**Dry-run migrasi:**
- mengubah `amount` lewat view mengosongkan `usulan_pecah`, sedangkan mengubah kolom lain tidak;
- insert lewat view menyimpan `usulan_pecah` dan bisa dibaca kembali.

**E2E.** Suite `pecah` di repo (`e2e/pecah.mjs`, `npm run e2e -- pecah`; Edge headless lewat CDP terhadap dev server), dengan usulan disuntik lewat insert langsung tanpa memanggil AI:
- tawaran tampil di detail dengan ringkasan per kategori, dan Pecah membuka lembar terisi (nominal & keterangan barang);
- Simpan menghasilkan bagian yang benar dan tawaran hilang;
- Tutup menghilangkan tawaran;
- ubah nominal menghilangkan tawaran;
- draft tidak menampilkan tawaran (usulan tetap tersimpan);
- usulan berisi kategori yang sudah dihapus tetap bisa disimpan (jatuh ke Lainnya);
- Urungkan hapus mengembalikan transaksi beserta usulannya.

**Ekstraksi sungguhan:** satu struk contoh campuran dicoba manual lewat Catat. Hasilnya dilaporkan, tidak otomatis.

**Regresi:** semua `uji:*`, semua suite E2E, typecheck, `next build`.

## Boundaries

- **Jangan:**
  - memecah otomatis;
  - menawarkan dari teks ketikan;
  - menyimpan usulan tanpa enkripsi;
  - membuat lembar pecah kedua.
- **Tanya dulu:** menawarkan juga untuk struk sekategori yang beda kelompok (mis. nasi biasa + kopi premium).
