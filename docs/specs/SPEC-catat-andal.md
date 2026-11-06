# Spec: Catat yang lebih andal (Gemini dulu, gambar dikompres, deteksi duplikat)

Status: **diterapkan** · rilis 2.1.0 (25 Okt 2026) · 24 Oktober 2026 · branch `feat/catat-andal` (ditumpuk di atas `feat/navigasi`) · migrasi `20261103000000_catat_andal.sql` · disinkronkan dengan kode 1 Nov 2026

## Masalah

1. **OCR (Tesseract) tidak konsisten.** Hasilnya bergantung pada model Groq yang kebetulan dapat giliran. Contohnya:
   - nominal promo terambil ("s.d Rp100.000");
   - harga sebelum diskon terambil ("Total Pembelian");
   - baris yang terpecah ("SPayLater - 1 / Bulan");
   - merchant kosong.

   Selain itu, kuota Groq gratis hanya **8.000 token/menit (± 2 struk/menit)**, jadi saat banyak struk dikirim berturut-turut, hasilnya jadi draft.
2. **Gemini (fallback sekarang) memakai `gemini-flash-latest`.** Alias ini sekarang menunjuk ke `gemini-3.8-flash` dengan kuota gratis **20 permintaan/hari**. Kuota itu habis tanggal 24 Oktober, dan panggilan pertama hari itu makan **64 detik**.
3. **Transaksi tercatat dua kali** kalau bukti yang sama terunggah lagi. Contohnya "Bunga SeaBank Rp 30" yang terunggah 2 kali dengan jarak 69 detik. Tidak ada yang memperingatkan.
4. **Biaya admin/cashback tertinggal.** Contoh: transaksi diubah dari "Pindah kantong" jadi "Masuk", tapi "Biaya admin Rp 30"-nya tetap ada dan memotong saldo SeaBank.

## Hasil uji (24 Okt, 3 struk sungguhan)

| | Waktu | Nominal benar | Merchant/metode |
|---|---|---|---|
| Tesseract + Groq (sekarang) | 3,9–5,7 dtk | 2/3 (BP lama terbaca 35.680) | 2/3 |
| `gemini-3.8-flash` | 64 dtk, lalu 429 | — | — |
| **Flash-Lite, gambar asli** | 3,9–5,0 dtk | **3/3** | 2/3 |
| **Flash-Lite, 1080px JPEG q80** | **2,7–3,0 dtk** | **3/3** | **3/3**, kecuali gambar thumbnail kecil di screenshot chat |
| Flash-Lite, 720px JPEG q70 | 2,3–2,7 dtk | 3/3 | 1/3 (merchant & paylater hilang, "BP"→"SP") |

Ukuran file turun ± 80% (415 KB → 81 KB) pada 1080px.

## Keputusan model

**`gemini-3.5-flash-lite`**, ditulis persis (tanpa alias `-latest`). Alias `-latest` bisa berganti model, dan bersama model ikut berganti kuota maupun perilakunya, tanpa pemberitahuan. Itu yang membuat fallback sekarang tiba-tiba hanya dapat 20/hari.

Ditulis di `src/lib/gemini.ts` (`GEMINI_MODEL`). Nama model bisa diganti lewat env `GEMINI_MODEL` di Vercel tanpa mengubah kode. Model yang sama dipakai cadangan teks (SPEC-ai-kantong) dan, bawaannya, Tanya AI (`GEMINI_MODEL_CHAT`).

**Rekomendasi: aktifkan billing (paid tier) di Google AI Studio.**

- **Privasi.** Untuk free tier, Google memakai isi permintaan untuk melatih modelnya, dan isinya bisa dibaca reviewer manusia. Ketentuannya sendiri meminta *"Do not submit sensitive, confidential, or personal information to the Unpaid Services."* Bukti transfer memuat nama, nomor rekening, dan nominal. Di paid tier: "Used to improve our products: **No**".
- **Kuota.** Jauh lebih longgar daripada free tier (Tier 1), jadi tidak lagi habis setelah beberapa puluh struk.
- **Biaya** (perkiraan dari harga resmi $0,30/1 juta token input, $2,50/1 juta token output): ± 4.500 token masuk dan ± 400 token keluar per struk, jadi ± **$0,002 (≈ Rp 35) per struk**. 100 struk/bulan ≈ Rp 3.500; 1.000 struk/bulan ≈ Rp 35.000.

Kalau tetap memakai free tier, aplikasi tetap jalan. Begitu kuota Gemini habis, otomatis turun ke Tesseract + Groq. Batas harian Flash-Lite untuk akun ini bisa dicek di https://aistudio.google.com/rate-limit.

## Rancangan

### 1. Alur unggah gambar

```
Foto/gambar
  → kompres: lebar maks 1080px, JPEG q80 (mozjpeg), putar sesuai EXIF  (server, sharp: kompresGambar)
  → Gemini Flash-Lite (gambar, skema JSON, prompt "struk")             ← utama
      gagal / kuota habis / hasil tidak valid
  → Tesseract + Groq (alur lama, gambar asli)                          ← cadangan
      teks OCR tak lolos gerbang kualitas → Groq dilewati
      gagal
  → draft + ditanya di obrolan (hasil Gemini yang tidak valid dipakai lebih dulu daripada hasil Groq)
```

- **Pengaman yang sudah ada tetap jalan di semua jalur:**
  - nominal dari baris promo ditolak;
  - tenor paylater dibaca dari teks;
  - nama penyedia diseragamkan.
- **Kompres di HP.** Ini ditambahkan juga agar unggahan di data seluler lebih cepat. Foto kamera (± 3–5 MB) dikecilkan ke lebar 1080px (JPEG q92) sebelum dikirim, lewat canvas di `CameraCapture`. Gambar dari galeri dan "Bagikan" tetap dikompres di server, jadi semua jalur dijamin sama.
- **Gemini bisa dimatikan** lewat env `DISABLE_VISION_FALLBACK=1` (mis. saat kuotanya habis): gambar langsung ke OCR + Groq.
- **Coba ulang Gemini:** galat sesaat (429/5xx, "high demand") diulang hingga 3 kali (jeda 1,5 lalu 3 detik) sebelum turun ke OCR + Groq.
- **Ketikan biasa lewat Groq**, dengan Gemini sebagai cadangan (sekali) bila seluruh rantai Groq gagal (ditambahkan di 2.9.0, SPEC-ai-kantong) atau hasilnya tidak sah, mis. nominal 0 (SPEC-perbaikan-temuan K7).

### 2. Deteksi duplikat (keputusan tetap di tangan user)

**Yang dianggap sama persis** (keputusan 24 Okt: tanpa jendela waktu). Sebelum hasil AI (foto/teks) yang sudah lengkap disimpan, `simpanTransaksi` mencari transaksi **terkonfirmasi** yang bukan ikutan (biaya admin/cashback) dengan isian berikut **sama persis** (kosong dianggap sama dengan kosong):
- nominal;
- jenis;
- tanggal;
- **jam (sampai menit)**;
- kantong (dan kantong tujuan untuk "Pindah kantong").

Merchant **tidak** ikut dibandingkan. AI membacanya berbeda-beda antar unggahan; contohnya bunga SeaBank yang sama terbaca "Tanpa nama" dan "SeaBank".

Ketikan bertanggal hari ini tanpa jam mendapat jam saat dicatat (`jamTransaksi`, SPEC-saldo-waktu), jadi "kopi 20rb" yang diketik dua kali di menit berbeda tidak dianggap duplikat. Ketikan bertanggal lain tanpa jam (jam kosong) atau dengan bagian hari ("tadi pagi" → jam perkiraan yang sama) bisa dianggap duplikat bila isian lainnya sama.

Hasil AI yang sudah jadi draft karena hal lain (kantong, nominal, jam, dll.) tidak dicek.

**Penanda.** Draft yang dicurigai duplikat menyimpan id transaksi yang mirip di kolom baru `duplikat_dari`. Dengan begitu, pertanyaannya tetap muncul saat draft dibuka lagi dari "Belum selesai" (label daftar: "Mungkin sudah tercatat" — sejak SPEC-lengkapi; dulu "Mungkin tercatat dua kali"). Pertanyaan duplikat diajukan paling akhir, setelah nominal, kantong, kantong tujuan, dan jam terjawab.

**Kalau ketemu,** transaksinya disimpan sebagai **draft** (belum dihitung), lalu obrolan bertanya:

> Sepertinya ini sudah tercatat: Bunga SeaBank · Rp 30 · 24 Okt 01.50 · SeaBank. Catat lagi?
> **(Lengkapi yang sudah ada)** **(Ya, catat lagi)** **(Bukan, buang)**

(Transaksi aslinya sudah terhapus atau tak terbaca → "Sepertinya ini sudah tercatat. Catat lagi?")

- **Ya, catat lagi** (atau ketik "ya/iya/oke/catat/lanjut"): `duplikat_dari` dikosongkan lewat `/api/draft/[id]/jawab`, lalu tersimpan seperti biasa, karena user memang bisa saja bayar dua kali.
- **Bukan, buang** (atau ketik "bukan/tidak/ga/nggak/jangan…"): draft dihapus, dan pesan penutupnya "Oke, tidak dicatat."
- **Lengkapi yang sudah ada** (SPEC-lengkapi §4, hanya draft dari gambar): merchant, keterangan, jam (bila kosong), kategori (bila Lainnya), usulan pecah, pengenal bukti, dan cashback draft dipindah ke transaksi lama; nominal, tanggal, kantongnya tetap; draft dihapus. Bila ada beberapa transaksi yang mungkin pasangannya (pasangan ragu dari unggah banyak), pertanyaannya "Sepertinya ini salah satu transaksi yang sudah tercatat. Lengkapi yang mana, atau catat lagi?" dengan satu tombol **Lengkapi: …** per transaksi.
- Jawaban lain → "Pilih “Ya, catat lagi” atau “Bukan, buang” ya."
- Kalau draft dibiarkan, ia menunggu di "Belum selesai" seperti draft lain.
- Struk dari "Bagikan" di latar yang dicurigai duplikat dikabari lewat push "Struk barusan sepertinya sudah tercatat".

**Batasan.** Isian manual (`/api/catat-manual`) **tidak** dicek, karena user mengisinya sendiri dengan sadar. Ini termasuk form bayar cicilan dan form Utang & Piutang. Pinjaman dan bayar cicilan yang **diketik/difoto** tetap dicek seperti hasil AI lain. Belanja paylater yang langsung jadi rencana cicilan tidak dicek.

### 3. Biaya admin/cashback yang tidak cocok lagi ikut terhapus

Ini aturan database (trigger `ikutan_sesuai_jenis`, `after update of type` pada `private.transaksi_data`, hanya untuk induk): begitu jenis transaksi induk berubah, anak yang tidak cocok lagi dihapus.

- Induk bukan "Pindah kantong" lagi → **biaya admin** (anak `expense` berkategori `fees`) dihapus.
- Induk bukan "Keluar" lagi → **cashback** (anak `income` berkategori `refund`) dihapus.

Aturan ini satu tempat untuk semua jalur: edit, koreksi obrolan, dan jawaban.

**Data yang sudah ada.** Ada 1 sisa di akun utama: "Biaya admin Rp 30" milik "Bunga SeaBank". Ini ikut dibersihkan oleh migrasi.

## Data

Satu migrasi (`20261103000000_catat_andal.sql`):
- kolom baru `private.transaksi_data.duplikat_dari uuid references private.transaksi_data(id) on delete set null` (kosong lagi kalau transaksi itu dihapus), ikut ke view `public.transactions` dan trigger tulisnya;
- trigger `ikutan_sesuai_jenis` penghapus anak yang tidak cocok;
- pembersihan data lama.

Belakangan: indeks `idx_transaksi_duplikat` (`20261107000000_normalisasi.sql`); rujukan `duplikat_dari` ke transaksi akun lain ditolak (`20261109000000_isolasi_rujukan.sql`).

## Pengujian

- **Unit (`uji:draft`):** pertanyaan duplikat muncul untuk draft bertanda `duplikat_dari`, dan baru setelah nominal terjawab.
- **AI sungguhan:**
  - kumpulan struk/bukti yang pernah bermasalah (byU, SPayLater diskon, BP lama, bunga SeaBank, Kopi Kenangan cashback) lewat Gemini terkompres;
  - jatuh ke Groq saat Gemini dimatikan (`npm run test:receipt -- <folder> --no-vision`, yang memasang `DISABLE_VISION_FALLBACK=1`).
- **Migrasi diuji kering:**
  - anak terhapus saat jenis induk berubah;
  - saldo kantong lain tidak berubah.
- **E2E dengan akun uji sementara** (dilakukan manual saat rilis; belum ada skrip di `e2e/`):
  - unggah bukti yang sama dua kali → ditanya;
  - "Ya" → tercatat 2;
  - "Bukan" → tetap 1.

## Boundaries

- **Disetujui lewat spec ini:**
  - urutan Gemini → Groq;
  - kompres 1080px;
  - pertanyaan duplikat;
  - trigger penghapus anak.
- **Tanya dulu:** mengganti model ke selain Flash-Lite.
- **Sudah diputuskan (SPEC-ai-kantong, 2.9.0; SPEC-perbaikan-temuan K7):** teks ketikan dikirim ke Gemini sebagai cadangan saat rantai Groq gagal atau hasilnya tidak sah.
- **Jangan:** memblokir transaksi yang mirip tanpa bertanya.

## Pertanyaan terbuka

1. **Paid tier atau tetap free tier?** Rekomendasinya paid (≈ Rp 35/struk), karena privasi dan kuota. Kode tetap sama di keduanya; bedanya hanya pengaturan billing di AI Studio.

## Belum diterapkan

- Uji unit ukuran hasil kompres dan skrip E2E duplikat (di "Pengujian" di atas) belum ada sebagai skrip.
