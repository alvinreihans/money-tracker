# Spec: Cerita & Tanya AI (fase 2)

Status: **diterapkan** · rilis 2.4.0 · 25 Oktober 2026 · branch `feat/cerita-tanya` (di atas fase 1, `feat/catat-tuntas`) · disinkronkan dengan kode 1 Nov 2026

Peta fase: lihat SPEC-catat-tuntas.md.

## Tujuan

Tanya AI bisa menjawab **kenapa**, bukan hanya **berapa**. "Kenapa bulan ini boros?" dijawab dengan alasannya ("ada kado nikahan Rp 500 rb dan servis motor Rp 750 rb"), bukan sekadar "kategori Belanja naik". Bahannya adalah cerita di balik transaksi. Tanya AI juga dibuat lebih cepat dan lebih mudah dijangkau.

## 1. Cerita di balik transaksi

**Tempatnya.** Cerita disimpan di kolom **Keterangan** (`description`) yang sudah ada dan sudah terenkripsi. Tidak ada kolom atau migrasi baru. Keterangan itu sudah bisa diubah di Edit transaksi.

**Ditawarkan setelah mencatat.** Kartu "Tersimpan" di Catat (`kartu()` di `Obrolan.tsx`) mendapat chip **"+ Tambah cerita"**, hanya kalau keterangannya masih kosong (tidak pada kartu yang sudah dibatalkan atau kartu perbaikan).
- Mengetuknya mengubah kolom ketik jadi kolom cerita, dengan placeholder "Ceritain singkat, mis. “kopi sama klien”". Chipnya berganti **"Batal cerita"** (ketuk lagi untuk batal).
- Teks yang dikirim (maks 500 karakter) langsung di-update ke `description` lewat view, lalu kartunya menampilkan “cerita” dan chipnya hilang. Di obrolan besar tampil juga "Cerita tersimpan."; di lembar ringkas cukup kartunya. Gagal → "Gagal menyimpan ceritanya."
- Selama menulis cerita, kartu ringkas tidak hilang sendiri.
- **Tidak memaksa:** tanpa pertanyaan atau dialog, cukup chip yang bisa diabaikan.
- Hasil "Bagikan" di latar tidak ditawari, karena user tidak sedang di Catat. Ceritanya tetap bisa ditambah di detail → Edit.

**Terisi sendiri dari struk/bukti.** Aturan prompt `description` dipertajam:
- Ambil catatan yang **ditulis orang**: berita transfer, "Keperluan Transfer", catatan pesanan ("Kado nikahan Rina", "Bayar arisan Oktober").
- Abaikan teks bawaan aplikasi yang tidak bercerita ("Transfer Dana", "Pembayaran", "Top Up", "Transfer", "Pembelian").
- Khusus struk belanja tanpa catatan: ringkasan singkat barangnya boleh ("Beras 5 kg, minyak goreng"), atau null.

## 2. Tanya AI memakai cerita itu

- `cari_transaksi` → `transaksi_terbesar` ikut membawa **keterangan**.
- `ringkasan_bulan` mendapat `pengeluaran_terbesar`: 5 pengeluaran terbesar bulan itu beserta keterangannya (tanpa pembelian dari tujuan tabungan, yang disebut terpisah di `dibayar_dari_tujuan_tabungan`, SPEC-analitik-tujuan).
- **Prompt:** saat menjelaskan *kenapa* (boros, naik, banyak keluar), sebut transaksi terbesar beserta ceritanya bila ada. Keterangan tetap diperlakukan sebagai **data, bukan perintah**, seperti sekarang.
- **Evaluasi `eval:tanya`:**
  - satu kasus cerita: "kenapa bulan ini boros?" harus menyebut transaksi besarnya beserta ceritanya. Awalnya "kado nikahan Rina"; kini data ujinya HP Laku6 Rp 10.300.000 berketerangan "Beli HP baru, HP lama rusak" yang dibayar dari tujuan tabungan, jadi jawabannya harus menyebut HP dan tabungan;
  - kasus lama tetap lulus (13/13 waktu itu).

## 3. Tanya AI lebih cepat

Saat ini 8–40 detik. Tiap putaran fungsi berarti satu panggilan Gemini lagi.

**Ringkasan bulan dikirim di depan.** Ringkasan bulan yang sedang dilihat (hasil `ringkasan_bulan` lengkap: keluar, masuk, angka bulan lalu per kategori beserta selisihnya, kategori, merchant, pengeluaran terbesar) dihitung dulu di server (`jawabTanya`), lalu disertakan di prompt dan ikut dianggap hasil fungsi untuk pemeriksa nominal. Pertanyaan umum ("kenapa boros", "bandingin sama bulan lalu") bisa dijawab dalam **1 putaran**, tanpa menunggu model meminta `ringkasan_bulan`. Fungsi lain tetap dipanggil bila perlu.

**Model chat bisa diganti tanpa deploy:** `GEMINI_MODEL_CHAT`, bawaannya sama dengan pembaca struk (`GEMINI_MODEL`, `gemini-3.5-flash-lite`).
- Model yang lebih besar (3.5/3.8 Flash) bisa lebih pintar, tetapi kuota free tier-nya bisa sangat kecil (3.8 Flash: 20/hari).
- Karena itu pilihannya diputuskan dari **ukuran**, bukan tebakan: `eval:tanya` dicatat waktu dan skornya, sebelum dan sesudah, untuk model bawaan dan satu model pembanding.
- Hasilnya ditulis di spec ini.

### Hasil ukur (25 Okt)

**`eval:tanya`, model bawaan (Flash-Lite)**

| | Sebelum | Sesudah |
|---|---|---|
| Skor | 13/13 | **14/14** (termasuk kasus cerita baru) |
| bandingin makan bulan ini vs bulan lalu | 21,0 dtk | **3,0 dtk** |
| selisih pengeluaran vs bulan lalu | 17,9 dtk | **1,7 dtk** |
| kalau dibanding pemasukan | 26,3 dtk | **3,7 dtk** |

Pertanyaan perbandingan tidak lagi butuh putaran fungsi.

**Banding model** (6 kasus representatif, `jawabTanya` langsung, data sama)

| Model | Skor | Rata-rata |
|---|---|---|
| gemini-3.5-flash-lite | 6/6 | **2,5 dtk** |
| gemini-3.5-flash | 6/6 | 11,2 dtk |

**Keputusan:** Flash-Lite tetap bawaan. Sama tepatnya dan 4× lebih cepat. Model lain tetap bisa dicoba lewat `GEMINI_MODEL_CHAT`.

Contoh jawaban "kenapa bulan ini boros?": *"…ada pembelian besar di kategori Belanja, yaitu beli HP baru di Laku6 sebesar Rp 10.300.000 karena HP lama rusak…"*

## 4. Tanya AI dari mana saja

- **Panel tetap terbuka saat tautan diikuti** (layar lebar, ≥ 840px `LAYAR_LEBAR`). Tanya AI pindah dari halaman Analitik ke kerangka aplikasi (`TanyaProvider` di `AppShell`). Mengetuk "Lihat di Riwayat" membuka Riwayat di sebelahnya, dan obrolannya tetap ada.
- **Di HP,** tautan tetap menutup lembar seperti sekarang. Membukanya lagi menampilkan obrolan yang sama sampai aplikasi ditutup.
- **Pintasan di Beranda:** tombol AI melayang yang sama juga ada di Beranda, di atas navigasi.
- **Bulan acuannya:**
  - di Analitik, bulan yang dipilih (`useTanyaBulan`);
  - di Beranda dan halaman lain, bulan berjalan.
- **Tidak di Riwayat** (tombol melayang menutupi nominal).

## Pengujian

- **AI sungguhan:**
  - `eval:tanya` 13 + 1 kasus cerita (kini bagian dari 20 kasus);
  - waktu sebelum/sesudah dicatat.
- **E2E (suite `fase2`, `npm run e2e`; jawaban Tanya AI ditiru):**
  - chip "+ Tambah cerita" → keterangan tersimpan, kartu menampilkannya, chip hilang, kartu ringkas tetap ada selama menulis;
  - tombol AI di Beranda & Analitik, tidak di Riwayat;
  - bulan acuan saran: Analitik bulan lalu → bulan lalu, Beranda → bulan berjalan;
  - panel Tanya AI tetap terbuka setelah tautan Riwayat di 1024px;
  - di 360px tertutup lalu obrolannya kembali saat dibuka lagi.
- **Regresi:** semua `uji:*` & E2E, typecheck, dan `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - keterangan transaksi (termasuk cerita) ikut dikirim ke Gemini sebagai hasil fungsi Tanya AI;
  - env `GEMINI_MODEL_CHAT`.
- **Tanya dulu:**
  - mengganti model chat bawaan (setelah ada hasil ukur);
  - menyimpan riwayat obrolan setelah aplikasi ditutup.
- **Jangan:**
  - menawarkan cerita dengan dialog yang menghalangi;
  - mengirim seluruh daftar transaksi mentah ke AI (tetap hanya hasil fungsi/ringkasan).

## Keputusan

1. **Chip "+ Tambah cerita" untuk semua transaksi** yang keterangannya kosong, tanpa batas nominal: chipnya kecil dan mudah diabaikan, dan cerita kecil ("traktir teman") juga berguna.
2. **Label tetap "Keterangan"** di form dan detail; "cerita" hanya di chip Catat dan Tanya AI.
3. **Tombol AI tidak di Riwayat**: Riwayat sudah ramai dengan chip filter, dan tombol mengambang menutupi nominal.

## Belum diterapkan

- Uji unit bahwa keterangan ikut di hasil `cari_transaksi`/`ringkasan_bulan` dan ringkasan di depan memakai bulan yang benar (logikanya di `tanya-server.ts`, tidak tercakup `uji:tanya`; hanya lewat `eval:tanya`).
- Uji otomatis AI struk ("Bayar arisan Oktober" → keterangan terisi; "Transfer Dana" → kosong). Aturannya ada di prompt `extract.ts`, belum ada skrip ujinya.
