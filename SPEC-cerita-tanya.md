# Spec: Cerita & Tanya AI (fase 2)

Status: **diterapkan** (pertanyaan terbuka memakai usulan: semua transaksi, label tetap "Keterangan", tanpa tombol di Riwayat) · 25 Oktober 2026 · branch `feat/cerita-tanya` (di atas fase 1, `feat/catat-tuntas`) · rilis bersama fase 1

Peta fase: lihat SPEC-catat-tuntas.md.

## Tujuan

Tanya AI bisa menjawab **kenapa**, bukan hanya **berapa**. "Kenapa bulan ini boros?" dijawab dengan alasannya ("ada kado nikahan Rp 500 rb dan servis motor Rp 750 rb"), bukan sekadar "kategori Belanja naik". Bahannya adalah cerita di balik transaksi. Tanya AI juga dibuat lebih cepat dan lebih mudah dijangkau.

## 1. Cerita di balik transaksi

**Tempatnya.** Cerita disimpan di kolom **Keterangan** (`description`) yang sudah ada dan sudah terenkripsi. Tidak ada kolom atau migrasi baru. Keterangan itu sudah bisa diubah di Edit transaksi.

**Ditawarkan setelah mencatat.** Kartu "Tercatat" di Catat mendapat chip **"+ Tambah cerita"**, hanya kalau keterangannya masih kosong.
- Mengetuknya mengubah kolom ketik jadi kolom cerita, dengan placeholder "Ceritain singkat, mis. “kopi sama klien”".
- Teks yang dikirim tersimpan sebagai keterangan, lalu tampil "Cerita tersimpan".
- **Tidak memaksa:** tanpa pertanyaan atau dialog, cukup chip yang bisa diabaikan.
- Hasil "Bagikan" di latar tidak ditawari, karena user tidak sedang di Catat. Ceritanya tetap bisa ditambah di detail → Edit.

**Terisi sendiri dari struk/bukti.** Aturan prompt `description` dipertajam:
- Ambil catatan yang **ditulis orang**: berita transfer, "Keperluan Transfer", catatan pesanan ("Kado nikahan Rina", "Bayar arisan Oktober").
- Abaikan teks bawaan aplikasi yang tidak bercerita ("Transfer Dana", "Pembayaran", "Top Up").

## 2. Tanya AI memakai cerita itu

- `cari_transaksi` → `transaksi_terbesar` ikut membawa **keterangan**.
- `ringkasan_bulan` mendapat `pengeluaran_terbesar`: 5 pengeluaran terbesar bulan itu beserta keterangannya.
- **Prompt:** saat menjelaskan *kenapa* (boros, naik, banyak keluar), sebut transaksi terbesar beserta ceritanya bila ada. Keterangan tetap diperlakukan sebagai **data, bukan perintah**, seperti sekarang.
- **Evaluasi `eval:tanya`:**
  - satu kasus baru: data uji punya transaksi besar berketerangan "kado nikahan Rina". Pertanyaan "kenapa bulan ini boros?" harus menyebut kado itu;
  - kasus lama tetap lulus (13/13).

## 3. Tanya AI lebih cepat

Saat ini 8–40 detik. Tiap putaran fungsi berarti satu panggilan Gemini lagi.

**Ringkasan bulan dikirim di depan.** Ringkasan bulan yang sedang dilihat (keluar, masuk, kategori, merchant, pengeluaran terbesar) dihitung dulu di server, lalu disertakan di prompt. Pertanyaan umum ("kenapa boros", "bandingin sama bulan lalu") bisa dijawab dalam **1 putaran**, tanpa menunggu model meminta `ringkasan_bulan`. Fungsi lain tetap dipanggil bila perlu.

**Model chat bisa diganti tanpa deploy:** `GEMINI_MODEL_CHAT`, bawaannya sama dengan pembaca struk.
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

- **Panel tetap terbuka saat tautan diikuti** (layar lebar). Tanya AI pindah dari halaman Analitik ke kerangka aplikasi (`AppShell`). Mengetuk "Lihat di Riwayat" membuka Riwayat di sebelahnya, dan obrolannya tetap ada.
- **Di HP,** tautan tetap menutup lembar seperti sekarang. Membukanya lagi menampilkan obrolan yang sama sampai aplikasi ditutup.
- **Pintasan di Beranda:** tombol AI melayang yang sama juga ada di Beranda, di atas navigasi.
- **Bulan acuannya:**
  - di Analitik, bulan yang dipilih;
  - di Beranda dan halaman lain, bulan berjalan.

## Pengujian

- **Unit:**
  - keterangan ikut di hasil `cari_transaksi` & `ringkasan_bulan`;
  - ringkasan di depan dibangun dari bulan yang benar.
- **AI sungguhan:**
  - `eval:tanya` 13 + 1 kasus, termasuk "kado nikahan";
  - waktu sebelum/sesudah dicatat.
- **AI struk:** bukti transfer dengan berita "Bayar arisan Oktober" → keterangan terisi; "Transfer Dana" → kosong.
- **E2E:**
  - chip "+ Tambah cerita" → keterangan tersimpan;
  - tidak muncul bila sudah berketerangan;
  - panel Tanya AI tetap terbuka setelah tautan Riwayat di 1024px;
  - di 360px tertutup lalu obrolannya kembali saat dibuka lagi;
  - tombol AI di Beranda.
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

## Pertanyaan terbuka

1. **Chip "+ Tambah cerita" untuk semua transaksi**, atau hanya yang besar (mis. ≥ Rp 200 rb)? Usulnya **semua**, karena chipnya kecil dan mudah diabaikan, dan cerita kecil ("traktir teman") juga berguna.
2. **Nama labelnya tetap "Keterangan"** di form dan detail, sementara di chat disebut "cerita"? Atau semua diganti "Cerita"? Usulnya **tetap "Keterangan"**: maknanya lebih luas (catatan cicilan, dll.) dan tidak mengubah tampilan lama.
3. **Tombol AI juga di Riwayat?** Usulnya **tidak**. Riwayat sudah ramai dengan chip filter, dan tombol mengambang di atas daftar menutupi nominal.
