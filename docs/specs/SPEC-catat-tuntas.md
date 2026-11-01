# Spec: Catat tuntas (fase 1)

Status: **diterapkan** · rilis 2.4.0 (25 Oktober 2026) · branch `feat/catat-tuntas` · migrasi `20261104000000_arah_transfer.sql` · disinkronkan dengan kode 1 Nov 2026

## Peta fase

Urutannya: data benar dulu, lalu konteks, lalu fitur baru di atasnya. Rincian tiap fase ada di spec-nya.

| Fase | Isi | Spec | Rilis |
|---|---|---|---|
| **1. Catat tuntas** (spec ini) | hasil Bagikan langsung tampil, arah bukti transfer, ketikan Catat tidak hilang, urungkan hapus | SPEC-catat-tuntas | 2.4.0 |
| 2. Cerita & Tanya AI | cerita di balik transaksi, Tanya AI memakai cerita itu, Tanya AI lebih cepat, panel samping tetap terbuka, pintasan di Beranda | SPEC-cerita-tanya | 2.4.0 |
| 3. Metode budgeting I | persen per kelompok (Kebutuhan, Keinginan, Tabungan, Berbagi), preset 50/30/20, 80/20, 70/20/10, kustom; tujuan tabungan | SPEC-metode-budget, SPEC-tujuan-tabungan | 2.5.0 |
| 4. Metode budgeting II & utang | Zero-Based, Pay Yourself First, 6 Jars, Kakeibo, Snowball/Avalanche | PETA-fase4 | 2.8.0 |

## 1. Hasil "Bagikan" langsung tampil

**Masalah.** Struk yang dibagikan dari e-wallet diproses service worker di latar. Hasilnya hanya muncul sebagai notifikasi. Titik di tombol + (kalau bermasalah) dan transaksinya di Riwayat (kalau berhasil) baru tampil setelah refresh.

**Penyebab.** Service worker mengunggah (`unggahLatar`) dan menerima push tanpa pernah mengabari jendela aplikasi yang terbuka. Aplikasi juga tidak mendengarkan pesan apa pun dari service worker.

**Perubahan:**
- Service worker (`public/sw.js`) mengirim pesan `{ jenis: "transaksi-berubah" }` ke semua jendela aplikasi (`clients.matchAll`, termasuk yang belum dikendalikan):
  - setelah **tiap** unggahan latar selesai, berhasil atau tidak;
  - saat push masuk.
- `AppShell` mendengarkannya lalu memanggil `router.refresh()`. Data diperbarui di tempat, posisi gulir tetap, dan isian yang sedang diketik tidak hilang.
- **Cadangan:** saat aplikasi kembali terlihat (`visibilitychange`, mis. pindah dari aplikasi e-wallet), aplikasi menyegarkan sekali, paling sering tiap 10 detik.

## 2. Arah bukti transfer

**Masalah** (laporan user). Bukti transfer kiriman orang lain (Dewi Lestari → Rina, OCBC → SeaBank) tercatat sebagai **pengeluaran**.

**Penyebab.** Prompt (`src/lib/extract.ts`) berbunyi "nama penerima ≠ nama pengirim → expense". Aturan itu menganggap pengunggah selalu pengirimnya, padahal AI tidak tahu siapa user-nya: yang tersimpan cuma email.

### Pembagian tugas baru

**AI hanya membaca fakta.** Untuk bukti transfer antar dua pihak (ada pengirim *dan* penerima), AI mengisi `bukti_transfer: { pengirim: { nama, bank }, penerima: { nama, bank } }`. Arahnya tidak ditebak AI.

**Aplikasi yang memutuskan** lewat fungsi murni `tentukanArah` (`src/lib/arah.ts`, dipanggil `simpanTransaksi`), berurutan:

1. **Nama user yang sudah dikenal** (lihat "Belajar nama"):

   | Pengirim = user? | Penerima = user? | Hasil |
   |---|---|---|
   | ya | ya | **pindah kantong** |
   | tidak | ya | **masuk** |
   | ya | tidak | **keluar** |

2. **Kantong.** Bank dicocokkan dengan kantong user (semua kecuali orang) memakai `kantongBank`: `cocokkanKantong` apa adanya, lalu setelah "Bank …" dan "… Indonesia/Tbk/Persero" dibuang ("BANK SEABANK INDONESIA" → SeaBank).

   | Bank penerima cocok kantong? | Bank pengirim cocok kantong? | Hasil |
   |---|---|---|
   | ya | tidak | **masuk** ke kantong itu |
   | tidak | ya | **keluar** dari kantong itu |
   | ya | ya | tidak bisa disimpulkan → tanya |
   | tidak | tidak | tidak bisa disimpulkan → tanya |

3. **Masih ragu → tanya.** Transaksi disimpan sebagai "belum selesai" tanpa kantong (`payment_method` kosong) dengan pertanyaan baru `arah`: *"Ini kamu yang kirim ke Rina, atau terima dari Dewi?"* (nama depan; tanpa nama: "Ini uang keluar atau masuk?").
   - Chip "Aku kirim ke Rina" dan "Aku terima dari Dewi" (tanpa nama: "Uang keluar" / "Uang masuk"). Jawaban ketik juga dibaca (`bacaArah`: "terima/masuk/dapet…", "kirim/keluar/bayar…", "pindah/antar/rekeningku").
   - Chip "Pindah antar rekeningku" ditambahkan bila kedua bank cocok dengan kantong user.
   - Pertanyaan arah diajukan sebelum kantong; setelah dijawab, kantongnya dicocokkan dari bank di sisi user, dan yang belum cocok ditanya berikutnya.
   - Dari Bagikan, pertanyaan ini muncul lewat titik di + dan push "Struk barusan belum lengkap".
   - Halaman detail draft menjelaskan: "Ini bukti transfer antara …. Kamu yang kirim atau yang terima? Jawab di Catat (titik di tombol +), atau betulkan di sini."

**Pencocokan nama.**
- Huruf besar/kecil, tanda baca, angka, dan gelar (Bapak, Ibu, Sdr, H, Hj, Dr, Ir, Prof, dll.) diabaikan.
- Dua nama dianggap sama kalau semua kata nama yang lebih pendek ada di nama yang lebih panjang, minimal 2 kata (atau kedua nama memang satu kata).
- Nama tersamar ("ALV\*\*\* REI\*\*\*") dan inisial ("R") dicocokkan per awalan kata; kata yang seluruhnya tersamar ("\*\*\*") tidak dihitung.

### Hasil per arah

| Arah | type | merchant | Kantong | Kategori |
|---|---|---|---|---|
| **masuk** | income | nama pengirim (dirapikan: "DEWI LESTARI" → "Dewi Lestari") | kantong bank penerima | pemasukan "Lainnya" (`other`), bisa diubah |
| **keluar** | expense | nama penerima (dirapikan) | bank pengirim | tebakan AI |
| **pindah** | transfer | — | asal: bank pengirim, tujuan: bank penerima | — |

### Belajar nama

- Begitu user menjawab "Aku terima", nama **penerima** disimpan sebagai nama user. "Aku kirim" menyimpan nama **pengirim**; "Pindah" menyimpan keduanya.
- Disimpan di `user_metadata.nama_rekening` (`supabase.auth.updateUser`), maksimal 5 nama (`MAKS_NAMA`): nama yang sudah sama tidak ditambah, yang terbaru di depan, yang lebih lama terbuang.
- Bukti transfer berikutnya dengan nama itu langsung diputuskan, tanpa bertanya.
- Profil mendapat baris **"Nama di rekening"** (`NamaRekening.tsx`): lihat, hapus, dan tambah manual (isian tambah hilang saat sudah 5).

### Data

- **Migrasi** `20261104000000_arah_transfer.sql`: kolom baru `bukti_transfer_enc bytea` (JSON nama & bank, **terenkripsi** `pgp_sym_encrypt` seperti `merchant`) di `private.transaksi_data`, didekripsi sebagai `bukti_transfer` di view `public.transactions` dan ditulis lewat trigger tulis.
- Kolom ini terisi selama arahnya belum dipastikan, lalu dikosongkan setelah dijawab.
- Nama tidak pernah disimpan sebagai teks biasa.

**Catatan penerapan.** Gemini Flash-Lite sering melewatkan `bukti_transfer` selama isian itu opsional di skema: 0 dari 3 percobaan terisi. Isian itu dijadikan **wajib (boleh null)**. Hasilnya 5 dari 5 terisi dengan bank yang sudah diringkas ("SeaBank"), sementara struk biasa (SPayLater, by.U) tetap `null`.

Aturan `bukti_transfer` hanya ada di prompt `struk` (gambar & OCR), tidak di prompt ketikan (SPEC-ai-kantong). Pinjaman tidak pernah membawa `bukti_transfer`.

**Tidak berubah:** teks yang diketik ("terima transferan dari budi") memang sudah benar arahnya.

## 3. Ketikan di Catat tidak hilang

Menutup lembar Catat dengan teks yang belum dikirim tidak lagi membuangnya. Pembukaan berikutnya terisi lagi, seperti draf di Samsung Messages.
- Disimpan di `localStorage` kunci `catat-draf` (teks saja), jadi tetap ada walau aplikasi ditutup. Penyimpanan diblokir (mode privat) → drafnya hanya hilang.
- Hanya ketikan transaksi baru; jawaban atas pertanyaan, ketikan di draft yang dibuka, dan cerita tidak disimpan.
- Dihapus begitu dikirim.
- Foto yang dilampirkan tidak disimpan: hilang begitu lembar ditutup.
- Tidak memakai dialog "Buang perubahan?": ini kolom obrolan, bukan form.

## 4. Urungkan hapus

Hapus tetap dikonfirmasi lewat dialog bawah ("Hapus transaksi ini?"). Setelah menghapus transaksi yang **sudah selesai** (keterangan dialog: "Masih bisa diurungkan sesaat setelah dihapus."), snackbar menampilkan *"Transaksi dihapus · **Urungkan**"* selama 6 detik.
- Sebelum dihapus, `DeleteTransactionButton` menyalin barisnya beserta yang ikut terhapus: cashback/biaya admin (`induk_id`), bagian pecahan (`pecahan_dari`), dan transfer pelengkap tujuan tabungan (`pelengkap_tujuan`).
- **Urungkan** memasukkan lagi semuanya (induk dulu) dengan `id` dan `created_at` yang sama → "Transaksi dikembalikan"; gagal → "Gagal mengurungkan: …".
- Trigger menyesuaikan saldo seperti biasa.
- Transaksi **belum selesai** tidak bisa diurungkan, karena foto struknya tidak bisa dipulihkan. Keterangan dialognya: "Nggak bisa dibalikin. Kalau ini dari struk, kamu harus foto ulang."
- Berlaku dari halaman detail maupun panel detail Riwayat. Snackbar hidup di kerangka aplikasi, jadi tetap tampil setelah kembali ke daftar.

## Pengujian

- **Unit (`uji:arah`):**
  - `tentukanArah`: semua baris tabel di atas, termasuk nama tersamar, nama satu kata, dan kedua bank cocok;
  - pencocokan nama.
- **AI sungguhan:** gambar bukti transfer dari laporan (OCBC → SeaBank), akun uji sementara.
  - Ada kantong SeaBank → tercatat **masuk** ke SeaBank.
  - Tanpa kantong yang cocok → ditanya → jawab "Aku terima" → masuk, dan nama tersimpan.
  - Unggah kedua → langsung masuk tanpa bertanya.
- **E2E** (`e2e/arah.mjs` memakai gambar bukti transfer di `archive/`, tidak di repo):
  - pesan service worker → titik di + dan baris Riwayat muncul tanpa muat ulang;
  - kembali ke aplikasi → data segar;
  - teks Catat bertahan setelah ditutup/dibuka/dimuat ulang dan hilang setelah dikirim;
  - hapus → Urungkan → transaksi (dan cashback-nya) kembali, saldo sama;
  - Profil "Nama di rekening": tambah & hapus.
- **Regresi:** `uji:*`, E2E yang sudah ada, typecheck, dan `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - migrasi kolom `bukti_transfer_enc`;
  - menyimpan nama di `user_metadata`;
  - pertanyaan baru `arah`.
- **Tanya dulu:**
  - menebak arah tanpa bertanya ketika nama & kantong tidak memberi jawaban;
  - menyimpan nama tanpa jawaban user.
- **Jangan:**
  - menyimpan nama pengirim/penerima tanpa enkripsi;
  - mengubah alur teks ketikan.

## Keputusan

1. **Ketat-longgar pencocokan nama:** minimal 2 kata yang sama (kecuali kedua nama satu kata). Lebih longgar (1 kata, mis. "Rina") bisa salah kalau pengirimnya Rina lain.
2. **Kategori pemasukan dari transfer masuk:** "Lainnya" (`other`). AI tidak menebak dari keperluannya.
3. **Teks Catat bertahan setelah aplikasi ditutup** (`localStorage`).

## Belum diterapkan

- Fase 4: onboarding utang & cicilan (di peta fase awal) tidak dibuat; utang & cicilan tetap ditambah dari Utang & Piutang.
