# Spec: Filter Riwayat (fase 2 SPEC-navigasi)

Status: **diterapkan** (header per bulan, total keluar & masuk) · 24 Oktober 2026 · branch `feat/riwayat-filter` (ditumpuk di atas PR #33)

## Masalah

Riwayat sekarang hanya punya chip jenis (Semua / Keluar / Masuk / Pindah kantong) dan kotak cari. Pertanyaan sehari-hari seperti ini belum bisa dijawab:

- "berapa yang keluar dari GoPay bulan lalu?"
- "makan saya minggu ini apa saja?"

Total di header kelompok juga hanya menjumlahkan baris yang sudah termuat, padahal Riwayat memuat 100 baris per sekali muat.

## Rancangan

### Tampilan (pola chip filter One UI, terinspirasi ShopeePay)

```
Riwayat                                  🔍
42 transaksi · keluar Rp 1,2 jt · masuk Rp 500 rb

[Semua] [Keluar] [Masuk] [Pindah kantong]          ← chip jenis (sudah ada)
[📅 Bulan ini ▾] [👛 Kantong ▾] [🏷 Kategori ▾] [Reset]   ← baru, bisa digeser

Oktober 2026                 −Rp 1,2 jt · +Rp 500 rb
  ┌ Warteg Selera Bahari   24 Okt 07.30   Rp 12.000 ┐
  ...
September 2026               −Rp 2,1 jt · +Rp 8 jt
```

**Baris chip filter.**
- **Tampilan chip.** Chip yang aktif berwarna dan menuliskan nilainya. Contoh:
  - "Bulan ini";
  - "1–15 Okt";
  - "GoPay" atau "GoPay +1";
  - "Makan +2".
- **Lembar bawah.** Mengetuk chip membuka lembar bawah (`Lembar`, yang sudah ada) dengan tombol **Hapus** dan **Terapkan**.
- **Chip Reset** muncul hanya kalau ada filter aktif.

**Tanggal.** Pilihan tunggal:
- Semua waktu (bawaan);
- Hari ini;
- 7 hari terakhir;
- Bulan ini;
- Bulan lalu;
- **Pilih rentang**, dengan dua isian tanggal bawaan (kalender sistem di HP).

**Kantong.** Pilihan ganda dari semua kantong, termasuk orang dan kartu kredit.
- Transaksi ikut kalau kantong itu **asal atau tujuan**, jadi "GoPay" juga menampilkan topup ke GoPay.

**Kategori.** Pilihan ganda, dikelompokkan Pengeluaran / Pemasukan.
- Pindah kantong tidak berkategori, jadi ikut tersaring keluar begitu kategori dipilih.

**Ringkasan.**
- **Subjudul AppBar** menampilkan ringkasan seluruh hasil filter: jumlah transaksi, total keluar, dan total masuk.
- **Header kelompok** sekarang **per bulan**, misalnya "Oktober 2026", dengan total keluar dan masuk **bulan itu untuk seluruh hasil filter**, bukan hanya baris yang sudah termuat.
- **Tanggal di baris.** Tiap baris menampilkan tanggal dan jamnya ("Hari ini 07.30", "Kemarin", "24 Okt 07.30").
- Pindah kantong tidak dihitung sebagai keluar maupun masuk, sama seperti di tempat lain.

**Kosong.** "Tidak ada transaksi untuk filter ini" dengan tombol **Hapus filter**.

### Alamat (prinsip SPEC-navigasi)

Semua filter disimpan di URL. Dengan begitu tampilan yang tersaring bisa di-bookmark dan dibagikan, dan tetap utuh saat membuka detail lalu kembali.

| Parameter | Isi |
|---|---|
| `jenis` | `keluar` / `masuk` / `pindah` (pengganti `filter`) |
| `periode` | `hari-ini` / `7-hari` / `bulan-ini` / `bulan-lalu`. Disimpan sebagai **nama**, bukan tanggal, supaya bookmark "Bulan ini" tetap berarti bulan berjalan. |
| `dari`, `sampai` | `YYYY-MM-DD`, khusus **Pilih rentang** |
| `kantong` | id dipisah koma |
| `kategori` | slug dipisah koma |
| `q` | teks cari (sudah ada) |

- **Masukan URL dianggap tidak tepercaya.** Tanggal dicek formatnya, id kantong dan kategori harus milik user, dan jumlah nilainya dibatasi.
- **Membuka tab Riwayat dari navigasi** selalu mulai **tanpa filter**, karena filter tersembunyi bisa membuat data terlihat "hilang".
- **Lend & Borrow.** "Lihat riwayat" seseorang sekarang membuka `/riwayat?kantong=<id>`. Sebelumnya tautan ini mencari teks nama.

### Data

Tidak ada perubahan database.

- **Satu sumber filter.** Daftar dan total memakai pembangun query yang sama (`queryRiwayat` dengan objek filter), jadi keduanya tidak bisa berbeda.
- **Total** dihitung di server dari kolom `amount, type, transaction_date` untuk seluruh hasil filter, diambil per 1.000 baris seperti ekspor.
- `// ponytail:` pindahkan ke RPC SQL kalau riwayat sudah puluhan ribu baris.

## Pengujian

- **Unit (`uji:riwayat`, baru):**
  - membaca dan membersihkan parameter URL (tanggal salah, id asing, terlalu banyak nilai);
  - rentang preset di batas bulan dan tahun, zona WIB;
  - total per bulan, dengan pindah kantong tidak dihitung;
  - label chip.
- **E2E di Edge (360px), akun uji sementara yang langsung dihapus:**
  - tiap filter dan kombinasinya: jumlah, total, dan URL;
  - total bulan benar walau baris belum termuat semua;
  - buka detail lalu kembali, filter tetap;
  - tab Riwayat dibuka ulang, filter kosong;
  - Lend & Borrow ke riwayat orang;
  - tidak ada error di console.
- `uji:*`, typecheck, `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - parameter URL di atas (`filter` diganti `jenis`, tanpa pengalihan);
  - header kelompok per bulan.
- **Tanya dulu:** mengubah database atau menambah filter lain (mis. nominal).
- **Jangan:** mengingat filter diam-diam setelah tab ditutup.

## Pertanyaan terbuka

1. **Header per bulan** menggantikan kelompok "Hari ini / Kemarin / Minggu ini" yang sekarang. Usulnya per bulan, seperti ShopeePay, supaya totalnya jelas. Info "Hari ini" dan "Kemarin" tetap tampil di tanggal tiap baris.
2. **Total di header bulan** diusulkan menampilkan **keluar dan masuk**. Alternatifnya keluar saja, seperti sekarang.
