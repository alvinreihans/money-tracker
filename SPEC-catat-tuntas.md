# Spec: Catat tuntas (fase 1)

Status: **diterapkan** (pertanyaan terbuka memakai usulan: minimal 2 kata, "Lainnya", teks bertahan) · 25 Oktober 2026 · branch `feat/catat-tuntas` · rilis 2.4.0

## Peta fase

Urutannya: data benar dulu, lalu konteks, lalu fitur baru di atasnya. Rinciannya ada di bagian "Rencana" CHANGELOG.

| Fase | Isi |
|---|---|
| **1. Catat tuntas** (spec ini) | hasil Bagikan langsung tampil, arah bukti transfer, ketikan Catat tidak hilang, urungkan hapus |
| 2. Cerita & Tanya AI | cerita di balik transaksi, Tanya AI memakai cerita itu, Tanya AI lebih cepat, panel samping tetap terbuka, pintasan di Beranda |
| 3. Metode budgeting I | persen per kelompok: needs/wants/saving, preset 50/30/20, 80/20, 70/20/10, kustom |
| 4. Metode budgeting II & utang | Zero-Based, Jar/Kakeibo, Snowball/Avalanche, onboarding utang & cicilan |

## 1. Hasil "Bagikan" langsung tampil

**Masalah.** Struk yang dibagikan dari e-wallet diproses service worker di latar. Hasilnya hanya muncul sebagai notifikasi. Titik di tombol + (kalau bermasalah) dan transaksinya di Riwayat (kalau berhasil) baru tampil setelah refresh.

**Penyebab.** Service worker mengunggah (`unggahLatar`) dan menerima push tanpa pernah mengabari jendela aplikasi yang terbuka. Aplikasi juga tidak mendengarkan pesan apa pun dari service worker.

**Perubahan:**
- Service worker mengirim pesan `transaksi-berubah` ke semua jendela aplikasi:
  - setelah **tiap** unggahan latar selesai, berhasil atau tidak;
  - saat push masuk.
- `AppShell` mendengarkannya lalu memanggil `router.refresh()`. Data diperbarui di tempat, posisi gulir tetap, dan isian yang sedang diketik tidak hilang.
- **Cadangan:** saat aplikasi kembali terlihat (pindah dari aplikasi e-wallet), aplikasi menyegarkan sekali, paling sering tiap 10 detik.

## 2. Arah bukti transfer

**Masalah** (laporan user). Bukti transfer kiriman orang lain (Dewi Lestari → Rina, OCBC → SeaBank) tercatat sebagai **pengeluaran**.

**Penyebab.** Prompt (`src/lib/extract.ts`) berbunyi "nama penerima ≠ nama pengirim → expense". Aturan itu menganggap pengunggah selalu pengirimnya, padahal AI tidak tahu siapa user-nya: yang tersimpan cuma email.

### Pembagian tugas baru

**AI hanya membaca fakta.** Untuk bukti transfer antar dua pihak (ada pengirim *dan* penerima), AI mengisi `bukti_transfer: { pengirim: { nama, bank }, penerima: { nama, bank } }`. Arahnya tidak ditebak AI.

**Aplikasi yang memutuskan** lewat fungsi murni `tentukanArah`, berurutan:

1. **Nama user yang sudah dikenal** (lihat "Belajar nama"):

   | Pengirim = user? | Penerima = user? | Hasil |
   |---|---|---|
   | ya | ya | **pindah kantong** |
   | tidak | ya | **masuk** |
   | ya | tidak | **keluar** |

2. **Kantong.** Bank dicocokkan dengan kantong user memakai `cocokkanKantong`, yang sudah dipakai untuk metode bayar.

   | Bank penerima cocok kantong? | Bank pengirim cocok kantong? | Hasil |
   |---|---|---|
   | ya | tidak | **masuk** ke kantong itu |
   | tidak | ya | **keluar** dari kantong itu |
   | ya | ya | tidak bisa disimpulkan → tanya |
   | tidak | tidak | tidak bisa disimpulkan → tanya |

3. **Masih ragu → tanya.** Transaksi disimpan sebagai "belum selesai" dengan pertanyaan baru `arah`: *"Ini kamu yang kirim ke Rina, atau terima dari Dewi?"*
   - Chip "Aku kirim" dan "Aku terima".
   - Chip "Pindah antar rekeningku" ditambahkan bila kedua bank cocok dengan kantong user.
   - Dari Bagikan, pertanyaan ini muncul lewat titik di + dan notifikasi "perlu dicek" yang sudah ada.

**Pencocokan nama.**
- Huruf besar/kecil, tanda baca, dan gelar diabaikan.
- Dua nama dianggap sama kalau semua kata nama yang lebih pendek ada di nama yang lebih panjang, minimal 2 kata (atau namanya memang satu kata).
- Nama tersamar ("ALV\*\*\* REI\*\*\*") dicocokkan per awalan kata.

### Hasil per arah

| Arah | type | merchant | Kantong | Kategori |
|---|---|---|---|---|
| **masuk** | income | nama pengirim | kantong bank penerima | pemasukan "Lainnya", bisa diubah |
| **keluar** | expense | nama penerima | bank pengirim | seperti sekarang |
| **pindah** | transfer | — | asal: bank pengirim, tujuan: bank penerima | — |

### Belajar nama

- Begitu user menjawab "Aku terima", nama **penerima** disimpan sebagai nama user. "Aku kirim" menyimpan nama **pengirim**; "Pindah" menyimpan keduanya.
- Disimpan di `user_metadata.nama_rekening`, maksimal 5 nama.
- Bukti transfer berikutnya dengan nama itu langsung diputuskan, tanpa bertanya.
- Profil mendapat baris **"Nama di rekening"**: lihat, hapus, dan tambah manual.

### Data

- **Migrasi:** kolom baru `bukti_transfer_enc` (JSON nama & bank, **terenkripsi** seperti `merchant`) di `private.transaksi_data`, ditambahkan ke view dan trigger tulis.
- Kolom ini terisi selama arahnya belum dipastikan, lalu dikosongkan setelah dijawab.
- Nama tidak pernah disimpan sebagai teks biasa.

**Catatan penerapan.** Gemini Flash-Lite sering melewatkan `bukti_transfer` selama isian itu opsional di skema: 0 dari 3 percobaan terisi. Isian itu dijadikan **wajib (boleh null)**. Hasilnya 5 dari 5 terisi dengan bank yang sudah diringkas ("SeaBank"), sementara struk biasa (SPayLater, by.U) tetap `null`.

**Tidak berubah:** teks yang diketik ("terima transferan dari budi") memang sudah benar arahnya.

## 3. Ketikan di Catat tidak hilang

Menutup lembar Catat dengan teks yang belum dikirim tidak lagi membuangnya. Pembukaan berikutnya terisi lagi, seperti draf di Samsung Messages.
- Disimpan di `localStorage` (teks saja), jadi tetap ada walau aplikasi ditutup.
- Dihapus begitu dikirim.
- Foto yang dilampirkan hanya bertahan selama aplikasi terbuka.
- Tidak memakai dialog "Buang perubahan?": ini kolom obrolan, bukan form.

## 4. Urungkan hapus

Setelah menghapus transaksi yang **sudah selesai**, snackbar menampilkan *"Transaksi dihapus · **Urungkan**"* selama 6 detik.
- **Urungkan** memasukkan lagi barisnya dengan `id` dan `created_at` yang sama, beserta cashback/biaya admin yang menempel.
- Trigger menyesuaikan saldo seperti biasa.
- Transaksi **belum selesai** tetap memakai konfirmasi tanpa urungkan, karena foto struknya tidak bisa dipulihkan.
- Berlaku dari halaman detail maupun panel detail Riwayat. Snackbar hidup di kerangka aplikasi, jadi tetap tampil setelah kembali ke daftar.

## Pengujian

- **Unit:**
  - `tentukanArah`: semua baris tabel di atas, termasuk nama tersamar, nama satu kata, dan kedua bank cocok;
  - pencocokan nama.
- **AI sungguhan:** gambar bukti transfer dari laporan (OCBC → SeaBank), akun uji sementara.
  - Ada kantong SeaBank → tercatat **masuk** ke SeaBank.
  - Tanpa kantong yang cocok → ditanya → jawab "Aku terima" → masuk, dan nama tersimpan.
  - Unggah kedua → langsung masuk tanpa bertanya.
- **E2E:**
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

## Pertanyaan terbuka

1. **Ketat-longgar pencocokan nama.** Usulnya minimal 2 kata yang sama. Lebih longgar (1 kata, mis. "Rina") bisa salah kalau pengirimnya Rina lain.
2. **Kategori pemasukan dari transfer masuk.** Usulnya "Lainnya". Alternatifnya, AI menebak (mis. "Hadiah" bila keperluannya "kado").
3. **Teks Catat bertahan setelah aplikasi ditutup** (`localStorage`) atau cukup selama aplikasi terbuka? Usulnya bertahan.
