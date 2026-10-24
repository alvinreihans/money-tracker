# Spec: Catat yang lebih andal (Gemini dulu, gambar dikompres, deteksi duplikat)

Status: **draf, menunggu persetujuan** · 24 Oktober 2026 · branch `feat/catat-andal` (ditumpuk di atas `feat/navigasi`)

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

Nama model bisa diganti lewat env `GEMINI_MODEL` di Vercel tanpa deploy ulang.

**Rekomendasi: aktifkan billing (paid tier) di Google AI Studio.**

- **Privasi.** Untuk free tier, Google memakai isi permintaan untuk melatih modelnya, dan isinya bisa dibaca reviewer manusia. Ketentuannya sendiri meminta *"Do not submit sensitive, confidential, or personal information to the Unpaid Services."* Bukti transfer memuat nama, nomor rekening, dan nominal. Di paid tier: "Used to improve our products: **No**".
- **Kuota.** Jauh lebih longgar daripada free tier (Tier 1), jadi tidak lagi habis setelah beberapa puluh struk.
- **Biaya** (perkiraan dari harga resmi $0,30/1 juta token input, $2,50/1 juta token output): ± 4.500 token masuk dan ± 400 token keluar per struk, jadi ± **$0,002 (≈ Rp 35) per struk**. 100 struk/bulan ≈ Rp 3.500; 1.000 struk/bulan ≈ Rp 35.000.

Kalau tetap memakai free tier, aplikasi tetap jalan. Begitu kuota Gemini habis, otomatis turun ke Tesseract + Groq. Batas harian Flash-Lite untuk akun ini bisa dicek di https://aistudio.google.com/rate-limit.

## Rancangan

### 1. Alur unggah gambar

```
Foto/gambar
  → kompres: sisi lebar maks 1080px, JPEG q80, putar sesuai EXIF   (server, sharp)
  → Gemini Flash-Lite (gambar)                                     ← utama
      gagal / kuota habis / hasil tidak valid
  → Tesseract + Groq (alur lama)                                   ← cadangan
      gagal
  → draft + ditanya di obrolan                                     (seperti sekarang)
```

- **Pengaman yang sudah ada tetap jalan di semua jalur:**
  - nominal dari baris promo ditolak;
  - tenor paylater dibaca dari teks;
  - nama penyedia diseragamkan.
- **Kompres di HP.** Ini ditambahkan juga agar unggahan di data seluler lebih cepat. Foto kamera (± 3–5 MB) dikecilkan ke 1080px sebelum dikirim, lewat canvas yang sudah ada di `CameraCapture`. Gambar dari galeri dan "Bagikan" tetap dikompres di server, jadi semua jalur dijamin sama.
- **Ketikan biasa tetap lewat Groq.** Teks kecil dan cepat, dan tidak butuh gambar.

### 2. Deteksi duplikat (keputusan tetap di tangan user)

**Yang dianggap mirip.** Sebelum transaksi dari foto/teks disimpan, aplikasi mencari transaksi yang sudah tercatat dengan:
- nominal sama, jenis sama, tanggal sama;
- kantong sama (kalau ada);
- **jam selisih ≤ 5 menit**, atau salah satunya tanpa jam.

**Kalau ketemu,** transaksinya disimpan sebagai **draft** (belum dihitung), lalu obrolan bertanya:

> Sepertinya ini sudah tercatat:
> **Bunga SeaBank · Rp 30 · 24 Okt 01.50 · SeaBank**
> Catat lagi?
> **(Ya, catat lagi)** **(Bukan, buang)**

- **Ya, catat lagi**: tersimpan seperti biasa, karena user memang bisa saja bayar dua kali.
- **Bukan, buang**: draft dihapus, dan pesan penutupnya "Oke, tidak dicatat."
- Kalau draft dibiarkan, ia menunggu di "Belum selesai" seperti draft lain.

**Batasan.** Isian manual (form) **tidak** dicek, karena user mengisinya sendiri dengan sadar. Pembayaran cicilan dan Lend & Borrow juga tidak dicek.

### 3. Biaya admin/cashback yang tidak cocok lagi ikut terhapus

Ini aturan database: begitu jenis transaksi induk berubah, anak yang tidak cocok lagi dihapus.

- Induk bukan "Pindah kantong" lagi → **biaya admin** dihapus.
- Induk bukan "Keluar" lagi → **cashback** dihapus.

Aturan ini satu tempat untuk semua jalur: edit, koreksi obrolan, dan jawaban.

**Data yang sudah ada.** Ada 1 sisa di akun utama: "Biaya admin Rp 30" milik "Bunga SeaBank". Ini ikut dibersihkan oleh migrasi.

## Data

Satu migrasi:
- trigger penghapus anak yang tidak cocok;
- pembersihan data lama.

Deteksi duplikat tidak butuh kolom baru. Ia memakai pertanyaan baru `duplikat` di obrolan, dan penandanya disimpan di draft lewat `raw_ocr_text`/status yang sudah ada. Detail teknisnya ditentukan saat implementasi.

## Pengujian

- **Unit:**
  - aturan "mirip" untuk duplikat (nominal, tanggal, jam ±5 menit, kantong, tanpa jam);
  - ukuran hasil kompres.
- **AI sungguhan:**
  - kumpulan struk/bukti yang pernah bermasalah (byU, SPayLater diskon, BP lama, bunga SeaBank, Kopi Kenangan cashback) lewat Gemini terkompres;
  - jatuh ke Groq saat Gemini dipaksa gagal.
- **Migrasi diuji kering:**
  - anak terhapus saat jenis induk berubah;
  - saldo kantong lain tidak berubah.
- **E2E dengan akun uji sementara:**
  - unggah bukti yang sama dua kali → ditanya;
  - "Ya" → tercatat 2;
  - "Bukan" → tetap 1.

## Boundaries

- **Disetujui lewat spec ini:**
  - urutan Gemini → Groq;
  - kompres 1080px;
  - pertanyaan duplikat;
  - trigger penghapus anak.
- **Tanya dulu:** mengganti model ke selain Flash-Lite, atau mengirim teks ketikan ke Gemini.
- **Jangan:** memblokir transaksi yang mirip tanpa bertanya.

## Pertanyaan terbuka

1. **Paid tier atau tetap free tier?** Rekomendasinya paid (≈ Rp 35/struk), karena privasi dan kuota. Kode tetap sama di keduanya; bedanya hanya pengaturan billing di AI Studio.
2. **Jarak jam untuk duplikat** diusulkan **5 menit**. Lebih lebar menangkap lebih banyak, tapi pertanyaan juga lebih sering muncul.
