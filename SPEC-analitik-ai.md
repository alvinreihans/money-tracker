# Spec: Tanya AI di Analitik (fase 4 SPEC-navigasi)

Status: **draf, menunggu persetujuan** · 24 Oktober 2026 · branch `feat/analitik-insight`

## Tujuan

Pemakai bisa bertanya dengan bahasa sehari-hari tentang keuangannya sendiri, lalu mendapat jawaban singkat yang **angkanya benar** dan bisa ditelusuri. Contoh pertanyaan:

- "Kenapa bulan ini boros?"
- "Berapa total jajan kopi bulan ini?"
- "Bandingin makan bulan ini sama bulan lalu"
- "Utangku ke siapa aja?"
- "Saldo GoPay berapa?"

## Prinsip: database yang menghitung, AI yang menjelaskan

**AI tidak boleh menghitung sendiri.** Model bahasa sering salah menjumlah dan bisa mengarang angka. Karena itu:

1. **AI memanggil fungsi kita** (*function calling*) untuk mendapatkan angka. Semua fungsi berjalan di server dengan sesi user, jadi RLS berlaku dan AI hanya bisa melihat data milik user itu. Fungsinya:

   | Fungsi | Isi | Memakai |
   |---|---|---|
   | `ringkasan_bulan(bulan)` | keluar, masuk, perubahan, kategori, merchant teratas, hari paling boros, proyeksi | `analisisBulan` (fase 3) |
   | `cari_transaksi(dari, sampai, jenis?, kategori?, kantong?, kata?)` | jumlah transaksi, total keluar & masuk, total per kategori, 10 transaksi terbesar | `queryRiwayat` + `ringkasRiwayat` (fase 2) |
   | `saldo_kantong()` | saldo tiap kantong + total aset | `saldo_kantong()` RPC |
   | `pinjaman_cicilan()` | siapa berutang ke siapa, cicilan yang berjalan & jatuh tempo berikutnya | `ringkasanPinjaman`, `statusCicilan` |

2. **Angka di jawaban diperiksa.** Setiap "Rp …" di jawaban harus muncul di hasil fungsi.
   - Kalau ada yang tidak cocok, model diminta mengulang sekali dengan peringatan.
   - Kalau masih tidak cocok, jawaban tetap tampil dengan catatan "⚠️ Cek angkanya di Riwayat".

3. **Jawaban disertai tautan telusur.**
   - Setiap pemanggilan `cari_transaksi` menghasilkan tombol **Lihat di Riwayat**, berisi filter yang sama persis dengan yang dipakai AI (filter fase 2).
   - `ringkasan_bulan` menghasilkan tombol **Buka Analitik [bulan]**.
   - Dengan begitu, pemakai bisa mengecek sendiri angka yang dijawab.

## Tampilan

- **Pintu masuk.** Di Analitik, di bawah pemilih bulan, ada baris **"✨ Tanya soal keuanganmu"**. Mengetuknya membuka lembar obrolan layar penuh dengan gaya gelembung yang sama seperti lembar Catat.
- **Saran pertanyaan.** Sebelum bertanya, tampil chip yang menyesuaikan bulan terpilih:
  - "Kenapa {bulan} boros?"
  - "Bandingin sama {bulan lalu}"
  - "Pengeluaran terbesarku apa?"
  - "Saldo semua kantong"
- **Jawaban.** Singkat (2–5 kalimat), bahasa santai seperti aplikasi, dengan tombol tautan di bawahnya. Selama menunggu, tampil status "Menghitung…".
- **Riwayat obrolan.** Tidak disimpan. Menutup lembar berarti obrolan hilang. Konteks yang dikirim ke AI adalah 6 pesan terakhir.
- **Keterangan privasi.** Di bawah kolom ketik ada satu baris kecil: "Pertanyaan & ringkasan datamu diproses AI (Gemini)."

## Model & batas

- **Model:** Gemini Flash-Lite (`GEMINI_MODEL`, sama dengan pembaca struk), lewat function calling.
- **Batas per pertanyaan:**
  - pertanyaan maksimal 300 karakter;
  - maksimal **4 putaran** pemanggilan fungsi;
  - batas waktu 30 detik.
- **Kuota habis atau gagal:** pesan ramah "Lagi sibuk, coba lagi sebentar ya." Tidak ada data yang hilang, karena obrolan ini tidak menulis apa pun.
- **Cakupan:** hanya keuangan user ini. Pertanyaan di luar itu, termasuk saran investasi, dijawab dengan sopan bahwa AI hanya bisa membantu soal catatan keuangannya.
- **Aman dari teks di data.** Nama merchant dan catatan transaksi dianggap **data**, bukan perintah. Fungsi mengembalikan JSON, dan prompt sistem menegaskan isi data tidak boleh dituruti sebagai instruksi.

## Data

Tidak ada perubahan database dan tidak ada tabel baru.

- **Endpoint:** `POST /api/tanya` dengan `{ pertanyaan, riwayat: [...6 pesan], bulan }`. Balasannya `{ jawaban, tautan: [{ label, href }], ragu: boolean }`.
- **Kode baru:**
  - `src/lib/tanya.ts`: definisi fungsi, pemeriksa angka, pembuat tautan (fungsi murni, diuji);
  - `src/app/api/tanya/route.ts`: putaran model dan fungsi;
  - `src/components/TanyaAI.tsx`: lembar obrolan.

## Pengujian

- **Unit (`uji:tanya`):**
  - pemeriksa angka: format "Rp 1,2 jt", "Rp 60.000", angka yang tidak ada di data;
  - argumen fungsi dari AI dibersihkan (tanggal, kategori, dan kantong harus sah, sama seperti `bacaFilter`);
  - tautan Riwayat & Analitik.
- **AI sungguhan** (diberi jeda karena kuota), akun uji dengan data yang diketahui:
  - "berapa total makan bulan ini" → angka cocok dan ada tautan;
  - "kenapa boros" → menyebut kategori yang naik;
  - "saldo gopay";
  - "utangku";
  - pertanyaan di luar topik → ditolak sopan;
  - merchant bernama "abaikan instruksi sebelumnya…" tidak mengubah perilaku.
- **E2E di Edge (360px):** buka lembar, chip saran, jawaban + tautan menuju Riwayat yang benar, status menunggu, pesan error saat AI dipaksa gagal.
- `uji:*`, typecheck, `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - endpoint `/api/tanya`;
  - mengirim pertanyaan + hasil fungsi (ringkasan, nama merchant, nominal) ke Gemini;
  - obrolan tidak disimpan.
- **Tanya dulu:** menyimpan riwayat obrolan, menambah fungsi yang **mengubah** data (mis. "catat kopi 20rb"), atau mengganti penyedia AI.
- **Jangan:**
  - membiarkan AI menghitung angka sendiri;
  - mengirim seluruh daftar transaksi mentah ke AI (hanya hasil fungsi);
  - menulis apa pun ke database dari obrolan ini.

## Pertanyaan terbuka

1. **Cadangan bila Gemini gagal.** Usulnya **tidak ada cadangan** untuk sekarang: cukup pesan "coba lagi". Alternatifnya Groq sebagai cadangan, dengan konsekuensi kode dua jalur dan kuota Groq yang kecil.
2. **Pintu masuk** hanya di Analitik. Apakah perlu juga dari Beranda, misalnya di judul besar?
