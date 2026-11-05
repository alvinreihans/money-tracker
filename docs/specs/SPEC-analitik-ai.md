# Spec: Tanya AI di Analitik (fase 4 SPEC-navigasi)

Status: **diterapkan** · rilis 2.1.0 (panel kanan di layar lebar: 2.2.0) · 24 Oktober 2026 · branch `feat/analitik-insight` · disinkronkan dengan kode 1 Nov 2026

Lanjutan: SPEC-cerita-tanya (cerita, ringkasan di depan, Tanya AI di Beranda), SPEC-ingat-kategori (`usul_ubah_kategori`), SPEC-metode-budget/-lanjutan, SPEC-analitik-tujuan, SPEC-pelunasan (isi tambahan hasil fungsi).

## Tujuan

Pemakai bisa bertanya dengan bahasa sehari-hari tentang keuangannya sendiri, lalu mendapat jawaban singkat yang **angkanya benar** dan bisa ditelusuri. Contoh pertanyaan:

- "Kenapa bulan ini boros?"
- "Berapa total jajan kopi bulan ini?"
- "Bandingin makan bulan ini sama bulan lalu"
- "Utangku ke siapa aja?"
- "Saldo GoPay berapa?"

## Prinsip: database yang menghitung, AI yang menjelaskan

**AI tidak boleh menghitung sendiri.** Model bahasa sering salah menjumlah dan bisa mengarang angka. Karena itu:

1. **AI memanggil fungsi kita** (*function calling*) untuk mendapatkan angka. Semua fungsi berjalan di server dengan sesi user, jadi RLS berlaku dan AI hanya bisa melihat data milik user itu. Fungsinya (`NAMA_FUNGSI` di `src/lib/tanya.ts`):

   | Fungsi | Isi | Memakai |
   |---|---|---|
   | `ringkasan_bulan(bulan)` | keluar, masuk, selisih, angka bulan lalu (keluar, masuk, per kategori), kategori, merchant teratas, hari paling boros, kategori paling naik, proyeksi, `pengeluaran_terbesar`, budget, `metode`, `dibayar_dari_tujuan_tabungan` | `analisisBulan`, `pisahTujuan`, `progresBudget`, `hitungMetode` |
   | `cari_transaksi(dari, sampai, jenis?, kategori?, kantong?, kata?, kecuali?, minimal?, maksimal?)` | jumlah transaksi, total keluar & masuk, total per kategori, 10 transaksi terbesar, `dikecualikan` | `queryRiwayat` + `ringkasRiwayat` (fase 2) |
   | `saldo_kantong()` | `kantong` (saldo tiap kantong selain tujuan), `tujuan_tabungan` (per tujuan: `nama_tujuan`, `terkumpul`, `target`, `tenggat`), `total_semua_tujuan` (jumlah semua tujuan, terpisah supaya tidak dibaca sebagai isi satu tujuan), `total_aset` (kantong uang saja) | `ambilKantong`, `ringkasSaldo` |
   | `pinjaman_cicilan()` | siapa berutang ke siapa, kartu kredit, cicilan yang berjalan & jatuh tempo berikutnya, bunga, strategi & urutan pelunasan | `ringkasanPinjaman`, `statusCicilan`, `daftarUtang`, `urutPelunasan` |
   | `hitung(ekspresi, keterangan?)` | kalkulator (lihat di bawah) | `hitungEkspresi` |
   | `usul_ubah_kategori(merchant, kategori, kelompok?)` | usulan ubah kategori, tanpa mengubah (SPEC-ingat-kategori) | `cariSerupa` |

   Hanya transaksi berstatus `confirmed`. Paling banyak 5.000 baris dijumlah per pemanggilan (`MAKS_BARIS`, perlindungan).

2. **Angka di jawaban diperiksa.** Setiap "Rp …" di jawaban harus muncul di hasil fungsi (`rupiahTakTerverifikasi`; "Rp 1,2 jt" boleh ±0,05 jt, "Rp 450 rb" ±0,5 rb).
   - Kalau ada yang tidak cocok, model diminta mengulang sekali dengan peringatan.
   - Kalau masih tidak cocok, jawaban tetap tampil dengan catatan "⚠️ Ada angka yang belum bisa dipastikan. Cek angkanya di Riwayat." (`ragu: true`).

3. **Jawaban disertai tautan telusur** (`tautanDari`).
   - Setiap pemanggilan `cari_transaksi` menghasilkan tombol **Lihat di Riwayat**, berisi filter yang sama persis dengan yang dipakai AI (filter fase 2). Bila memakai `kecuali`/`minimal`/`maksimal` (Riwayat belum punya filter itu), labelnya **Lihat semua di Riwayat**.
   - `ringkasan_bulan` menghasilkan tombol **Buka Analitik [bulan]**. Ringkasan bulan yang dihitung di depan juga: bila jawabannya memakai nominal dari ringkasan itu, tombolnya ikut ditambahkan (`tautanJawaban`), walau model tidak memanggil fungsi.
   - `saldo_kantong` → **Lihat kantong** (`/profil/kantong`); `pinjaman_cicilan` → **Buka Utang & Piutang** (`/pinjaman`).
   - `hitung` dan `usul_ubah_kategori` tanpa tautan. Tautan yang sama hanya muncul sekali.
   - Dengan begitu, pemakai bisa mengecek sendiri angka yang dijawab.

## Peningkatan 25 Okt (AI kurang pintar)

Pemicunya: "kalau Laku6 tidak dihitung, bagaimana kondisi keuanganku?" ditolak karena AI dilarang berhitung.

- **Kalkulator `hitung(ekspresi)`.** Aritmetika (+ − × ÷, kurung, maks 200 karakter) diurai sendiri, tanpa `eval`. Angka ≥ 1.000 harus sudah ada di hasil fungsi atau percakapan, jadi kalkulator tidak bisa dipakai untuk angka karangan. Hasil dibulatkan 2 desimal dan ikut diperiksa seperti hasil fungsi lain.
- **`cari_transaksi` diperluas** dengan `kecuali` (merchant/keterangan) dan `minimal` / `maksimal` nominal. Bagian yang dikecualikan dilaporkan supaya bisa disebut di jawaban.
- **Periode bawaan.** `cari_transaksi` tanpa tanggal memakai bulan yang sedang dilihat, bukan semua waktu (`lengkapiArgumen`). Sebelumnya "bulan ini" yang lupa diberi tanggal ikut menjumlah bulan lain. Bulan yang tidak sah atau di masa depan jatuh ke bulan berjalan.
- **Prompt.**
  - "Kondisi keuangan" = masuk vs keluar + selisih + total aset + utang, lalu satu kalimat kesimpulan.
  - Pertanyaan "tanpa X" diawali asumsinya.
  - "Di atas/di bawah N" memakai batas nominal.
  - Semua fungsi yang perlu dipanggil sekaligus dalam satu giliran.
  - Teks biasa tanpa markdown; nama fungsi dan JSON tidak disebut.
- **Nominal dari percakapan dianggap sah.** Termasuk jawaban sebelumnya dan angka yang diketik user. Tanpa ini, pertanyaan lanjutan selalu dianggap mengarang lalu diminta ulang sampai waktu habis.
- **Batas waktu 55 detik** (`maxDuration` 60, batas Vercel Hobby). Setelah 8 detik, obrolan menampilkan "Masih menghitung, pertanyaan ini butuh beberapa langkah…".
- **Inti dipindah ke `jawabTanya()`** (`src/lib/tanya-server.ts`) supaya bisa dijalankan skrip evaluasi/debug.
- **Evaluasi `npm run eval:tanya`**: pertanyaan sulit dengan jawaban diketahui, akun uji sementara. Skor 25 Okt: **13/13**. Waktu jawab 8–40 detik, sebagian besar waktu tunggu Gemini (free tier). Kini 20 kasus (ditambah spec lanjutan).

## Tampilan

- **Pintu masuk** (diubah 24 Okt, permintaan user): **tombol melayang** di kanan bawah Analitik (dan Beranda, SPEC-cerita-tanya), tepat di atas navigasi, seperti tombol AI di WhatsApp. Bentuknya kotak membulat dengan ikon sparkle bergradasi buatan sendiri (bukan logo Meta), label aksesibel "Tanya AI soal keuanganmu". Mengetuknya membuka lembar "Tanya AI": layar penuh di HP, panel di kanan di layar lebar (≥ 840px) supaya grafik tetap terlihat.
- **Tampilan ala ChatGPT** (diubah 24 Okt):
  - layar kosong: ikon, sapaan "Mau tahu apa soal keuanganmu?", keterangan "Pengeluaran, saldo, utang, atau cicilan. Angkanya kuambil langsung dari catatanmu.", dan 4 kartu saran di atas kolom ketik;
  - pesan user berupa gelembung abu di kanan;
  - jawaban AI berupa teks biasa selebar layar, tanpa gelembung, dengan tautan berbentuk chip;
  - kolom ketik berbentuk kapsul ("Tanya soal keuanganmu", tumbuh mengikuti isi, Enter = kirim) dengan tombol kirim bulat, selalu di bawah layar.
- **Saran pertanyaan.** Sebelum bertanya, tampil kartu (judul + keterangan) yang menyesuaikan bulan acuan:
  - "Kenapa {bulan} boros?" · Cari penyebabnya
  - "Bandingin sama {bulan lalu}" · Naik atau turun
  - "Pengeluaran terbesarku" · di {bulan}
  - "Saldo semua kantong" · dan total aset
- **Jawaban.** Singkat (2–5 kalimat), bahasa santai seperti aplikasi, dengan tombol tautan di bawahnya. Selama menunggu, tampil animasi titik (status "Menghitung" untuk pembaca layar).
- **Riwayat obrolan.** Tidak disimpan ke server. Obrolan hidup di `TanyaProvider` (kerangka aplikasi), jadi bertahan saat lembar ditutup atau pindah halaman, dan hilang saat aplikasi ditutup/dimuat ulang (SPEC-cerita-tanya). Konteks yang dikirim ke AI adalah 6 pesan terakhir, tanpa pesan galat.
- **Keterangan privasi.** Di bawah kolom ketik ada satu baris kecil: "Pertanyaan & ringkasan datamu diproses AI (Gemini)."

## Model & batas

- **Model:** `GEMINI_MODEL_CHAT` (bawaan = `GEMINI_MODEL`, `gemini-3.5-flash-lite`, sama dengan pembaca struk), lewat function calling.
- **Batas per pertanyaan:**
  - pertanyaan maksimal 300 karakter (juga `maxLength` di kolom ketik); kosong → 400 "Pertanyaannya masih kosong.", terlalu panjang → 400 "Maksimal 300 karakter ya.";
  - maksimal **4 putaran** pemanggilan fungsi;
  - tiap pesan riwayat dipotong 1.000 karakter;
  - batas waktu 55 detik.
- **Kuota habis, waktu habis, atau gagal:** 503 dengan pesan ramah "Lagi sibuk, coba lagi sebentar ya." Tidak ada data yang hilang, karena obrolan ini tidak menulis apa pun. Model tidak mengembalikan teks → "Hmm, aku belum bisa menjawab itu. Coba tanya lebih spesifik ya."
- **Cakupan:** hanya keuangan user ini. Pertanyaan di luar itu, termasuk saran investasi, dijawab dengan sopan bahwa AI hanya bisa membantu soal catatan keuangannya.
- **Aman dari teks di data.** Nama merchant dan catatan transaksi dianggap **data**, bukan perintah. Fungsi mengembalikan JSON, dan prompt sistem menegaskan isi data tidak boleh dituruti sebagai instruksi.

## Data

Tidak ada perubahan database dan tidak ada tabel baru.

- **Endpoint:** `POST /api/tanya` (login wajib, 401 bila tidak) dengan `{ pertanyaan, riwayat: [{ peran: "saya" | "ai", teks }] (6 terakhir), bulan: "YYYY-MM" }`. Bulan tidak sah → bulan berjalan. Balasannya `{ jawaban, tautan: [{ label, href }], ragu: boolean, nominal_ragu?: number[], usulan? }`.
- **Kode:**
  - `src/lib/tanya.ts`: deklarasi fungsi, pembersih argumen, pemeriksa angka, kalkulator, pembuat tautan (fungsi murni, diuji);
  - `src/lib/tanya-server.ts`: `jalankanFungsi` (keempat fungsi data), `usulUbahKategori`, dan `jawabTanya` (prompt, putaran model dan fungsi, pemeriksaan & minta ulang). Riwayat pesan dikelola sendiri lewat `generateContent`, bukan `startChat`: SDK `@google/generative-ai` mengirim hasil fungsi dengan role "function" yang ditolak model Gemini baru;
  - `src/app/api/tanya/route.ts`: login, validasi, batas waktu;
  - `src/components/TanyaAI.tsx`: `TanyaProvider`, `TombolTanya`, lembar obrolan, `KartuUsulan`.

## Pengujian

- **Unit (`uji:tanya`):**
  - pemeriksa angka: format "Rp 1,2 jt", "Rp 60.000", angka yang tidak ada di data;
  - argumen fungsi dari AI dibersihkan (tanggal, kategori, dan kantong harus sah, sama seperti `bacaFilter`); bulan tidak sah/masa depan;
  - tautan Riwayat & Analitik; kalkulator tanpa tautan, pencarian berpengecualian → "Lihat semua";
  - kalkulator: urutan operasi, kurung, angka besar karangan ditolak.
- **AI sungguhan (`eval:tanya`)**, diberi jeda karena kuota, akun uji dengan data yang diketahui: total & "kenapa boros", kopi, "tanpa Laku6", di atas/di bawah N, saldo, total aset, piutang, perbandingan & lanjutan, saham (ditolak sopan, tanpa tautan), metode budget, usulan kategori, strategi pelunasan, isi satu tujuan tabungan ("berapa isi dana darurat?" → saldo tujuan itu saja, bukan jumlah semua tujuan).
- **E2E (`npm run e2e`, Edge headless):** suite `fase2` (jawaban AI ditiru): tombol di Beranda & Analitik, bulan acuan saran, tautan di 1024px & 360px.
- `uji:*`, typecheck, `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - endpoint `/api/tanya`;
  - mengirim pertanyaan + hasil fungsi (ringkasan, nama merchant, keterangan, nominal) ke Gemini;
  - obrolan tidak disimpan.
- **Tanya dulu:** menyimpan riwayat obrolan, menambah fungsi yang **mengubah** data (mis. "catat kopi 20rb"), atau mengganti penyedia AI. (`usul_ubah_kategori` hanya mengusulkan; perubahannya lewat tombol user, SPEC-ingat-kategori.)
- **Jangan:**
  - membiarkan AI menghitung angka sendiri;
  - mengirim seluruh daftar transaksi mentah ke AI (hanya hasil fungsi);
  - menulis apa pun ke database dari `/api/tanya`.

## Keputusan

1. **Cadangan bila Gemini gagal:** tidak ada cadangan (Groq tidak dipakai); cukup pesan "coba lagi".
2. **Pintu masuk:** Analitik dan Beranda (SPEC-cerita-tanya), tidak di Riwayat.
