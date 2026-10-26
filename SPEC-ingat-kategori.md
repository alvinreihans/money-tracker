# Spec: Ingat kategori per merchant

Status: **diterapkan** · 26 Oktober 2026 · branch `feat/ingat-kategori` · rilis 2.6.0

## Masalah

AI menebak kategori dari nol di setiap unggahan. Contoh dari pemakaian nyata:

- **"Dnid Ridx Dana":** akun DANA pemilik warteg (tidak punya akun merchant, jadi dibayar lewat transfer). AI menebak **Lainnya**.
- **"WAITENJOY":** tempat laundry. AI menebak **Makan**. Salah tebak sekali tidak masalah; masalahnya, setelah dibetulkan, unggahan berikutnya **lupa lagi**.

## Keputusan user

- **Belajar dari semua riwayat**, bukan hanya yang dibetulkan. Tanpa migrasi; langsung bekerja dengan data yang sudah ada.
- **Saat membetulkan kategori, tawarkan** untuk ikut membetulkan transaksi lama dari merchant yang sama.

## A. Mengingat saat mencatat

- **Kapan:** transaksi dari AI (struk, bukti bayar, Bagikan, ketikan) berjenis pengeluaran atau pemasukan, dengan merchant.
- **Apa yang dicari:** transaksi **terakhir** (menurut tanggal transaksi) dengan merchant yang sama dan jenis yang sama, yang kategorinya bukan **Lainnya**. "Lainnya" tidak memberi informasi, jadi tebakan AI yang spesifik lebih baik.
- **Hasilnya:** kategori dan kelompoknya **menggantikan tebakan AI**.
- **Merchant dianggap sama:**
  - setelah huruf kecil semua dan tanpa spasi atau tanda baca ("WAITENJOY.CO" = "waitenjoy co");
  - atau yang satu awalan yang lain, minimal 6 huruf. Nama yang terpotong ("WAITENJOY.CO…" vs "WAITENJOY.COM") tetap cocok;
  - atau semua kata nama yang lebih pendek ada di nama yang lain, minimal 5 huruf. AI sering membuang kata seperti "Toko": "qwrtz" = "Toko Qwrtz", "Dnid Ridx" = "Dnid Ridx Dana". "Kopi" dan "Kopi Kenangan" tetap tidak cocok (terlalu pendek).
- **Tidak berlaku untuk:**
  - pindah kantong, pinjaman, cicilan/paylater (kategorinya ditentukan alurnya sendiri);
  - belanja yang dipecah dari rincian ketikan;
  - bagian pecahan (kategorinya sengaja beda dari transaksi aslinya);
  - kategori lama yang sudah dihapus user.
- **Batas pencarian:** 300 transaksi terakhir dalam setahun.
  - Merchant disimpan terenkripsi, jadi pencocokan dilakukan di server setelah didekripsi lewat view; tidak ada daftar merchant polos yang disimpan.
  - `ponytail:` naikkan batasnya atau pindahkan ke indeks bila user mencatat lebih dari 300 transaksi setahun dan merchant lama terlupa.
- **Merchant beragam** (mis. Shopee, kadang belanja kadang makan) ikut transaksi terakhirnya. Kalau keliru, dibetulkan sekali dan itu yang diingat berikutnya.

## B. Membetulkan transaksi lama

Setelah kategori sebuah transaksi diubah dan disimpan (Ubah transaksi):

- Aplikasi mencari transaksi lain dari **merchant yang sama**, dengan **jenis yang sama** dan **kategori yang berbeda** dari yang baru dipilih.
- Kalau ada, muncul konfirmasi: **"Ubah juga 4 transaksi WAITENJOY lain jadi Laundry?"** dengan tombol **Ubah** / **Biarkan**.
- **Ubah:**
  - mengganti kategorinya;
  - kelompoknya ikut pilihan transaksi ini (atau ikut kategori);
  - snackbar "4 transaksi diubah" dengan **Urungkan**.
- **Biarkan:** tidak ada yang berubah. Unggahan berikutnya tetap mengikuti transaksi ini, karena transaksi inilah yang terakhir.
- **Bagian pecahan tidak ikut diubah.**

## C. Membetulkan lewat obrolan Catat

Koreksi di obrolan sudah ada: setelah transaksi tersimpan, user mengetik "bukan, itu laundry" dan AI memperbarui kategorinya (`/api/transaksi/[id]/koreksi`, dengan "Batalkan perubahan").

- **Ingatan:** tidak perlu langkah tambahan. Koreksi itu menjadi transaksi terakhir merchant tersebut, jadi unggahan berikutnya mengikutinya.
- **Baru:** kalau koreksinya mengubah kategori, obrolan menawarkan hal yang sama seperti bagian B: "Ubah juga 3 transaksi WAITENJOY lain jadi Laundry?" dengan tombol **Ubah** / **Biarkan**, memakai lembar konfirmasi yang sama dengan bagian B (di atas obrolan).
- **Belum termasuk:** koreksi transaksi lama lewat obrolan (hanya transaksi yang barusan tersimpan).

## D. Minta perbaikan ke Tanya AI

User bisa menulis ke Tanya AI: "waitenjoy itu laundry, tolong betulkan" atau "transfer ke Dnid Ridx Dana itu makan di warteg".

- **AI hanya mengusulkan, user yang menyetujui.** Tanya AI tetap tidak mengubah data sendiri.
- **Fungsi baru `usul_ubah_kategori(merchant, kategori, kelompok?)`:**
  - server mencari transaksi dengan merchant yang sama (aturan cocok bagian A, semua jenis pengeluaran/pemasukan, tanpa bagian pecahan);
  - mengembalikan usulan: merchant, kategori tujuan, jumlah transaksi & totalnya, contoh 3 transaksi.
- **Jawaban AI** menjelaskan usulannya ("Ada 4 transaksi WAITENJOY, total Rp 64.000, sekarang Makan"). Di bawahnya muncul **kartu konfirmasi**:
  - "Ubah 4 transaksi WAITENJOY jadi Laundry?" dengan **Ubah** / **Batal**;
  - AI tidak boleh berkata "sudah diubah" sebelum user menekan Ubah.
- **Ubah** → `POST /api/tanya/ubah-kategori`:
  - server mencari ulang transaksinya (id dari browser tidak dipercaya) lalu memperbaruinya;
  - kartunya berganti "4 transaksi diubah" dengan **Urungkan** (kategori & kelompok lama dikembalikan).
- **Kategori yang belum ada** ("Laundry"):
  - usulan menawarkan **membuat kategori pengeluaran baru** dengan nama itu;
  - kelompoknya disarankan AI (laundry → Kebutuhan), ikon & warnanya bawaan dan bisa diubah di Profil → Kategori;
  - kartunya: "Buat kategori Laundry dan pindahkan 4 transaksi WAITENJOY?".
- **Setelah diubah, otomatis diingat:** transaksi itu menjadi yang terakhir dari merchant tersebut (bagian A).
- **Di luar cakupan:** mengubah nominal, tanggal, kantong, atau menghapus transaksi lewat Tanya AI.

## Hasil

- **Tanpa migrasi.** Pencocokan merchant di server (`src/lib/ingat.ts`), satu API bersama untuk B, C, dan D (`/api/kategori-merchant`).
- **Berbeda dari rancangan:**
  - **Aturan cocok ditambah "semua kata ada"** (lihat bagian A). E2E pertama menemukan AI mencatat "qwrtz" untuk "Toko Qwrtz", sehingga ingatan dan tawarannya tidak bekerja.
  - **"Terakhir" menurut tanggal transaksi**, bukan waktu kategorinya diubah (tidak ada stempel waktu ubah tanpa migrasi). Membetulkan transaksi lama lalu memilih Biarkan berarti unggahan berikutnya mengikuti transaksi yang lebih baru.
  - **Kartu Tanya AI memakai nama merchant seperti yang ditulis user**, yang mencakup semua variasi bacaan AI-nya.
- **E2E** (akun sementara, AI sungguhan, 12 cek):
  - WAITENJOY dibetulkan jadi Laundry → catat "waitenjoy.co 18rb" langsung Laundry;
  - Dnid Ridx Dana dibetulkan jadi Makan → tawaran untuk 1 transaksi lama → Ubah → Urungkan;
  - catat lagi → Makan;
  - Tanya AI: kartu usulan tanpa mengaku sudah mengubah → Ubah → Urungkan;
  - kategori baru "Jajan" dibuat dari usulan;
  - pertanyaan biasa tanpa kartu;
  - koreksi obrolan "bukan, itu laundry" → tawaran → Toko Qwrtz lama ikut Laundry.
- **`eval:tanya`:** dua kasus baru lulus 2/2. Saat diukur, Gemini sedang lambat (14–22 dtk untuk pertanyaan satu kata, biasanya < 1 dtk), jadi semua jawaban lebih lama dari biasanya.

## Kode

- **`src/lib/ingat.ts` (baru):**
  - `kunciMerchant(nama)`: huruf kecil, tanpa spasi/tanda baca;
  - `merchantSama(a, b)`;
  - `ingatKategori(baris, merchant, type)`: fungsi murni; baris diurutkan dari yang terbaru.
- **`simpanTransaksi`:** setelah validasi kategori, sebelum cek duplikat, satu query riwayat (`merchant, category, kelompok, type`) lalu `ingatKategori`.
- **Ubah transaksi:** setelah simpan berhasil dan kategorinya berubah, cari yang serupa (query yang sama, di browser) lalu tampilkan `Konfirmasi`.

## Pengujian

- **Unit `uji:ingat`:**
  - normalisasi;
  - cocok persis, terpotong, dan terlalu pendek (tidak cocok);
  - jenis berbeda tidak dipakai;
  - yang terbaru menang;
  - kategori terhapus diabaikan.
- **E2E (akun sementara, AI sungguhan):**
  - catat "waitenjoy 16rb seabank" → kategori tebakan AI;
  - ubah jadi Laundry (kategori buatan user);
  - tawaran untuk 1 transaksi lama yang sama → Ubah → berubah;
  - koreksi lewat obrolan ("bukan, itu laundry") → tawaran yang sama muncul di obrolan;
  - Tanya AI "waitenjoy itu laundry, tolong betulkan" → kartu konfirmasi (dengan membuat kategori Laundry) → Ubah → semua transaksi WAITENJOY jadi Laundry → Urungkan mengembalikan;
  - catat lagi "WAITENJOY 18rb" → langsung Laundry;
  - transaksi merchant lain tidak terpengaruh;
  - Urungkan mengembalikan kategori lama.
- **`eval:tanya` + 2 kasus:**
  - "waitenjoy itu laundry, tolong betulkan" → memanggil `usul_ubah_kategori` dan tidak mengaku sudah mengubah;
  - "berapa pengeluaran laundry?" tetap menjawab biasa (tidak mengusulkan apa pun).
- **Regresi:** semua `uji:*` & E2E, typecheck, `next build`.

## Boundaries

- **Tanpa migrasi** dan tanpa tabel baru.
- **Jangan:**
  - menyimpan nama merchant polos di luar kolom terenkripsi;
  - mengubah transaksi lama tanpa persetujuan user;
  - mengubah jenis transaksi (arah bukti transfer tetap diputuskan `lib/arah`).
