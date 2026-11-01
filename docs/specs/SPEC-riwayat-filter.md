# Spec: Filter Riwayat (fase 2 SPEC-navigasi)

Status: **diterapkan · rilis 2.1.0** (header per bulan + per hari, total keluar & masuk) · disinkronkan dengan kode 1 Nov 2026 · branch awal `feat/riwayat-filter`

## Masalah

Riwayat dulu hanya punya chip jenis (Semua / Keluar / Masuk / Pindah kantong) dan kotak cari. Pertanyaan sehari-hari seperti ini belum bisa dijawab:

- "berapa yang keluar dari GoPay bulan lalu?"
- "makan saya minggu ini apa saja?"

Total di header kelompok juga hanya menjumlahkan baris yang sudah termuat, padahal Riwayat memuat 100 baris per sekali muat.

## Rancangan

### Tampilan (pola chip filter One UI, terinspirasi ShopeePay)

```
Riwayat                                  🔍
42 transaksi · keluar Rp 1,2 jt · masuk Rp 500 rb

[Semua] [Keluar] [Masuk] [Pindah kantong]          ← chip jenis
[📅 Bulan ini ▾] [👛 Kantong ▾] [🏷 Kategori ▾] [✕ Reset]   ← bisa digeser

Oktober 2026 ··········· −Rp 1,2 jt · +Rp 500 rb
  Hari ini ············· −Rp 37 rb
  ┌ Warteg Selera Bahari   07.30 · Makan · GoPay   Rp 12.000 ┐
  Senin, 20 Okt ········ −Rp 25 rb
  ...
September 2026 ········· −Rp 2,1 jt · +Rp 8 jt
```

**Baris chip filter.**
- **Tampilan chip.** Tanpa nilai, chip menulis nama filternya ("Tanggal", "Kantong", "Kategori"). Chip yang aktif (`aria-pressed`) berwarna dan menuliskan nilainya. Contoh:
  - "Bulan ini", "7 hari terakhir";
  - "1 Okt – 15 Okt" (`fmtTanggalPendek`, tahun ikut bila bukan tahun berjalan);
  - "GoPay" atau "GoPay +1";
  - "Makan +2".
- **Lembar bawah.** Mengetuk chip membuka lembar bawah (`Lembar`) dengan tombol **Hapus** dan **Terapkan**. Pilihan di lembar baru berlaku saat Terapkan.
- **Chip kelompok** (dari kartu metode di Analitik, [SPEC-metode-budget](SPEC-metode-budget.md)): tampil hanya bila `kelompok` aktif, mis. "Keinginan ✕"; diketuk untuk melepasnya.
- **Chip Reset** muncul hanya kalau ada filter tanggal/kantong/kategori/kelompok aktif (`adaFilter`). Reset mempertahankan jenis dan teks cari.

**Tanggal.** Pilihan tunggal:
- Semua waktu (bawaan);
- Hari ini;
- 7 hari terakhir (hari ini dan 6 hari sebelumnya);
- Bulan ini;
- Bulan lalu;
- **Pilih rentang**: kalender rentang sendiri ala Kalender Samsung (`KalenderRentang`: ketuk awal lalu akhir, pita di antaranya, minggu mulai Senin, Minggu merah, hari ini bercincin, bisa dengan panah keyboard), sama di HP dan desktop. Satu tanggal saja = rentang sehari.

**Kantong.** Pilihan ganda dari semua kantong (`user_accounts`), termasuk orang, kartu kredit, dan tujuan tabungan. Subjudul lembar: "Transaksi dari atau ke kantong ini."
- Transaksi ikut kalau kantong itu **asal atau tujuan**, jadi "GoPay" juga menampilkan topup ke GoPay.

**Kategori.** Pilihan ganda, dikelompokkan Pengeluaran / Pemasukan.
- Pindah kantong tidak berkategori, jadi ikut tersaring keluar begitu kategori dipilih.

**Ringkasan.**
- **Subjudul AppBar** menampilkan ringkasan seluruh hasil filter: jumlah transaksi ("42 transaksi", atau "N hasil untuk “kopi”" saat mencari), total keluar, dan total masuk. Total yang nol tidak ditulis.
- **Header kelompok per bulan**, misalnya "Oktober 2026", dengan total keluar dan masuk **bulan itu untuk seluruh hasil filter**, bukan hanya baris yang sudah termuat.
- **Subheader per hari** di dalam bulan ("Hari ini", "Kemarin", "Senin, 20 Okt"), juga dengan total keluar & masuk hari itu untuk seluruh hasil filter.
- **Kartu transaksi** cukup menampilkan jam ("07.30", bila ada), lalu kategori dan kantong; tanggalnya sudah di subheader hari.
- Pindah kantong tidak dihitung sebagai keluar maupun masuk, sama seperti di tempat lain.
- Hanya transaksi terkonfirmasi yang tampil (yang belum selesai ada di lembar Catat).

**Kosong.**
- Dengan filter/jenis: "Tidak ada transaksi untuk filter ini" dengan tombol **Hapus filter** (ke `/riwayat`, semua filter dan jenis dilepas).
- Saat mencari: "Nggak ketemu “…”" — "Coba kata lain, atau cek filter yang aktif."
- Tanpa filter: "Belum ada transaksi di sini".

**Cari.** Tombol 🔍 di AppBar membuka kotak cari; hasil diperbarui 300 ms setelah berhenti mengetik (`router.replace`). Yang dicari: merchant, keterangan, dan metode bayar (`ilike`). Esc atau ✕ menutup dan melepas cari.

**Muat lagi.** Server memuat 100 pertama (`PER_MUAT`); "Muat lagi · N transaksi lebih lama" mengambil 100 berikutnya dari browser dan menyambungnya tanpa pindah halaman.

### Alamat (prinsip SPEC-navigasi)

Semua filter disimpan di URL. Dengan begitu tampilan yang tersaring bisa di-bookmark dan dibagikan, dan tetap utuh saat membuka detail lalu kembali.

| Parameter | Isi |
|---|---|
| `jenis` | `keluar` / `masuk` / `pindah` (pengganti `filter`; tanpa parameter = semua) |
| `periode` | `hari-ini` / `7-hari` / `bulan-ini` / `bulan-lalu`. Disimpan sebagai **nama**, bukan tanggal, supaya bookmark "Bulan ini" tetap berarti bulan berjalan. Bila ada, `dari`/`sampai` diabaikan. |
| `dari`, `sampai` | `YYYY-MM-DD`, khusus **Pilih rentang** |
| `kantong` | id dipisah koma |
| `kategori` | `<jenis>:<slug>` dipisah koma, mis. `expense:food,income:salary` (slug sama bisa ada di kedua jenis) |
| `kelompok` | kelompok budgeting dipisah koma (`kebutuhan`, `keinginan`, …), dicocokkan ke `kelompok_efektif` |
| `q` | teks cari |
| `id` | transaksi yang dibuka di panel kanan (layar lebar, SPEC-layar-lebar) |

- **Masukan URL dianggap tidak tepercaya** (`bacaFilter`). Tanggal harus tanggal sungguhan (`2026-02-30` dibuang); `dari` > `sampai` ditukar; id kantong dan kategori harus milik user; kelompok harus salah satu yang dikenal; nilai ganda dibuang dan dibatasi 50 per filter; `q` dibersihkan dari `, ( ) % * \ : "` dan dipotong 50 huruf (`bersihkanCari`).
- **Membuka tab Riwayat dari navigasi** selalu mulai **tanpa filter** (`href="/riwayat"`), karena filter tersembunyi bisa membuat data terlihat "hilang".
- **Utang & Piutang** dan **Tujuan tabungan**: "Lihat riwayat" membuka `/riwayat?kantong=<id>`. Sebelumnya tautan ini mencari teks nama.

### Data

Tidak ada perubahan database.

- **Satu sumber filter.** Daftar (server dan "Muat lagi") dan total memakai pembangun query yang sama (`queryRiwayat(supabase, filter, hariIni, kolom)` di `src/lib/riwayat.ts`), jadi keduanya tidak bisa berbeda. Urutan: tanggal, jam, waktu catat, induk sebelum ikutannya, lalu id.
- **Total** (`ringkasRiwayat`: keseluruhan, per bulan, per hari) dihitung di server dari kolom `amount, type, transaction_date` untuk seluruh hasil filter, diambil per 1.000 baris seperti ekspor.
- `// ponytail:` pindahkan ke RPC SQL kalau riwayat sudah puluhan ribu baris.

## Pengujian

- **Unit (`uji:riwayat`):**
  - membaca dan membersihkan parameter URL (tanggal salah, id asing, kelompok, nilai karangan);
  - alamat bolak-balik utuh;
  - rentang preset di batas bulan dan tahun, zona WIB;
  - total per bulan, dengan pindah kantong tidak dihitung;
  - grid & ketukan kalender rentang.
- **E2E permanen** (`e2e/regresi-riwayat.mjs`, `e2e/regresi-kalender.mjs`; Edge 360px, akun uji sementara yang langsung dihapus):
  - lembar tanggal (termasuk kalender rentang & keyboard), kantong, kategori, dan Reset: URL dan isi;
  - jumlah benar untuk 125 baris (lebih dari satu kali muat), lewat chip maupun URL langsung; parameter sampah diabaikan; pesan kosong + Hapus filter;
  - buka detail lalu kembali, filter tetap;
  - tab Riwayat dibuka ulang, filter kosong;
  - tidak ada error di console.
- `uji:*`, typecheck, `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - parameter URL di atas (`filter` diganti `jenis`, tanpa pengalihan);
  - header kelompok per bulan.
- **Tanya dulu:** mengubah database atau menambah filter lain (mis. nominal).
- **Jangan:** mengingat filter diam-diam setelah tab ditutup.

## Keputusan

1. **Header per bulan** menggantikan kelompok "Hari ini / Kemarin / Minggu ini" di Riwayat, dengan subheader per hari di dalamnya ("Hari ini", "Kemarin", "Senin, 20 Okt"). Beranda tetap memakai kelompok waktu lama.
2. **Total di header** bulan dan hari menampilkan **keluar dan masuk** ("−Rp 1,2 jt · +Rp 500 rb"; yang nol tidak ditulis).
