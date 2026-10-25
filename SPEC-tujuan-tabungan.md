# Spec: Penghasilan & tujuan tabungan (lanjutan fase 3)

Status: **diterapkan** · 25 Oktober 2026 · branch `feat/metode-budget` · ikut rilis 2.5.0

Lanjutan SPEC-metode-budget.md. Pemicunya pemakaian nyata:
1. **Gajian akhir bulan.** Metode membagi pemasukan *bulan ini*. Sebelum gajian, yang terbagi hanya uang masuk kecil (Rp 858 rb), jadi semua kelompok tampak lewat ratusan persen.
2. **Uang masuk ≠ penghasilan.** Transfer dari teman, hadiah, refund ikut terbagi.
3. **Beli HP Rp 10 jt dari tabungan setahun** terhitung Keinginan bulan ini (lewat 4157%), padahal uangnya disisihkan sejak lama.

## Keputusan user

- **Basis = penghasilan per bulan** yang disarankan aplikasi dan boleh diubah user; jatahnya tetap sepanjang bulan, kapan pun gajiannya.
- **Penghasilan bawaan:** Gaji, Bonus/THR, Usaha/Jualan, Freelance/Proyek. Pemberian, Cashback/Refund, Bunga/Investasi, Lainnya = uang masuk biasa.
- **Tujuan tabungan dibangun sekarang** (bukan sekadar tanda "dibayar dari tabungan").

## A. Penghasilan

- **`categories.penghasilan`** (boolean, hanya pemasukan):
  - bawaan sesuai daftar di atas;
  - kategori pemasukan buatan user: **ya** (biasanya sumber penghasilan: kos-kosan, ojol), kecuali Lainnya;
  - **Profil → Kategori:** form kategori pemasukan mendapat sakelar **"Dihitung sebagai penghasilan"**.
- **`metode_budget.penghasilan`** (rupiah, null = ikut saran).
- **Saran:** rerata penghasilan 3 bulan penuh terakhir yang ada penghasilannya. Belum ada riwayat sebulan penuh → penghasilan bulan ini → bulan lalu → 0.
- **Profil → Budget:** baris **"Penghasilan per bulan Rp 8.000.000"** di kartu pratinjau, dengan keterangan "rerata 3 bulan terakhir" atau "diatur sendiri", dan tombol **Ubah** (isian nominal + "Pakai saran").
- **Basis metode** (Analitik, Beranda, Tanya AI) = penghasilan per bulan ini. Tabungan tetap dari sisa: basis − pengeluaran selain tabungan.

## B. Tujuan tabungan

Mengikuti pola Lend & Borrow, yang mencatat orang sebagai kantong berjenis `orang`:

- **Tujuan = kantong berjenis `tujuan`** dengan **target** (wajib) dan **tenggat** (opsional). Saldonya = yang sudah terkumpul.
- **Menyisihkan = transfer** dari kantong mana pun ke kantong tujuan:
  - lewat Catat: "sisihkan 500rb dari bca ke HP baru" (kantong dicocokkan dari nama, seperti sekarang);
  - bukti transfer ke kantong bank sungguhan (pocket Jago/Blu/SeaBank) yang diberi nama sama/alias juga otomatis masuk.
- **Memakai = pengeluaran dari kantong tujuan.** Pengeluaran ini **tidak dihitung** di jatah bulanan metode, dan ditampilkan sendiri di kartu metode: "Dari tujuan tabungan: HP baru Rp 10,3 jt".
- **Total aset** tetap menghitung kantong tujuan (uangnya tetap milikmu).

### Tampilan

- **Profil → Tujuan tabungan** (baru; di layar lebar terbuka di panel kanan Profil, jadi tidak perlu item sidebar sendiri):
  - tiap tujuan: emoji, nama, bilah progres, "Rp 6 jt dari Rp 10 jt", dan bila ada tenggat: "Sisihkan Rp 1 jt/bulan agar tercapai Maret";
  - tercapai → tanda "Tercapai" (ikon + teks);
  - ketuk → detail: riwayat setoran & pemakaian (Riwayat tersaring ke kantong itu), ubah, hapus;
  - tombol **"+ Tujuan baru"**: nama, emoji, target, tenggat, saldo awal (yang sudah terkumpul sebelum memakai aplikasi).
- **Tombol cepat di detail tujuan:** **Sisihkan** (form transfer dengan tujuan terisi) dan **Pakai** (form pengeluaran dengan kantong terisi).
- **Kantong:** tujuan tidak tampil di daftar Profil → Kantong (seperti kantong orang), tapi muncul di pilihan kantong (Catat, edit transaksi) di kelompok "Tujuan tabungan".
- **Kartu metode (Analitik/Beranda):** baris Tabungan menambah "Rp 800 rb ke tujuan bulan ini"; baris terpisah untuk pemakaian dari tujuan.
- **Tanya AI:** ringkasan membawa daftar tujuan (terkumpul, target, tenggat) dan pemakaian dari tujuan bulan itu, jadi "kenapa boros?" bisa dijawab "beli HP baru Rp 10,3 jt dari tabungan HP".

### Transaksi lama: "Dibayar dari tabungan"

Pembelian yang sudah tercatat dari BCA (seperti HP tadi):
- Detail transaksi pengeluaran mendapat aksi **"Dibayar dari tujuan tabungan"**: pilih tujuan, atau buat baru dengan target = nominalnya.
- Aplikasi lalu:
  - memindahkan kantong pengeluaran itu ke kantong tujuan;
  - bila saldo tujuan kurang, mencatat transfer kekurangannya dari kantong asal ke tujuan, di waktu yang sama, sebelum pengeluaran.
- **Saldo kantong asal tidak berubah sama sekali.** Yang berubah hanya: pengeluaran itu keluar dari jatah bulanan dan tercatat sebagai pemakaian tujuan.
- Bisa dibatalkan ("Batalkan dari tujuan") → kantong kembali, transfer pelengkapnya terhapus.

## Data (migrasi)

- `categories.penghasilan boolean` + isian awal sesuai daftar; trigger kategori bawaan untuk user baru ikut mengisinya.
- `metode_budget.penghasilan numeric null`.
- Jenis kantong baru `tujuan`; `user_accounts.target numeric null`, `user_accounts.tenggat date null` (hanya untuk jenis `tujuan`, dicek constraint).
- `transaksi_data.pelengkap_tujuan uuid null` → pengeluaran yang dilengkapi (transfer pelengkap dari aksi "Dibayar dari tujuan tabungan"; `on delete cascade`, jadi ikut terhapus bersama pengeluarannya).

## Pengujian

- **Unit:**
  - saran penghasilan: rerata 3 bulan penuh, cadangan bulan ini/lalu, kategori non-penghasilan tidak dihitung;
  - basis dari penghasilan diatur sendiri;
  - pengeluaran dari kantong tujuan tidak masuk realisasi wadah;
  - setoran bulan ini per tujuan;
  - "perlu Rp X/bulan" dari tenggat.
- **E2E:**
  - Budget menampilkan penghasilan saran, lalu Ubah → jatah ikut berubah;
  - kategori pemasukan: sakelar penghasilan tersimpan;
  - buat tujuan "HP baru" Rp 10 jt dengan tenggat;
  - sisihkan lewat Catat → progres naik, total aset tetap;
  - pakai dari tujuan → kartu metode tidak lewat, baris "Dari tujuan tabungan" muncul;
  - transaksi lama Rp 10,3 jt dari BCA → "Dibayar dari tujuan tabungan" → saldo BCA sama, Keinginan turun, batalkan → kembali seperti semula.
- **Tanya AI:** `eval:tanya` + 1 kasus ("kenapa bulan ini boros?" menyebut HP dibayar dari tabungan).
- **Regresi:** semua `uji:*` & E2E, typecheck, `next build`.

## Boundaries

- **Disetujui lewat spec ini:** migrasi di atas; halaman & entri navigasi Tujuan tabungan.
- **Tanya dulu:** mengubah arti "bulan" (periode gajian); menghapus tujuan yang masih bersaldo (aplikasi meminta saldonya dipindah dulu).
- **Jangan:** mengubah saldo kantong asal saat "Dibayar dari tujuan tabungan"; mengeluarkan tujuan dari total aset.

## Hasil

- **Migrasi** `20261106000000_penghasilan_tujuan.sql`. Uji kering di transaksi yang di-rollback, termasuk sebagai role `authenticated`; sesudah migrasi dicek lagi lewat API sebagai user biasa.
  - Uji kering menangkap satu celah: tujuan tanpa target lolos, karena `null > 0` bernilai null dan constraint menganggap null lolos. Diperbaiki dengan `coalesce(target > 0, false)`.
- **Berbeda dari rancangan:**
  - **Tidak ada item sidebar.** Halaman tujuan ada di dalam Profil, jadi di layar lebar sudah terbuka di panel kanan Profil.
  - **Tujuan yang punya riwayat tidak bisa dihapus.** Menghapusnya melepas pengeluaran dari kantong tujuan, sehingga pembelian itu masuk lagi ke jatah bulan itu. Tujuan yang sudah dipakai habis pindah ke bagian **Selesai**.
  - **"Sisihkan" dan "Pakai" membuka isian manual Catat** yang sudah terisi (pindah ke tujuan / bayar pakai tujuan), bukan form baru.
  - **"Batalkan dari tujuan" hanya muncul bila ada transfer pelengkap.** Bila saldo tujuan cukup (tanpa pelengkap), kantong asalnya tidak tercatat; pembatalan lewat snackbar "Urungkan" atau mengubah kantong di Ubah transaksi.
- **E2E** (akun sementara, 15 cek): penghasilan saran Rp 8 jt dari rerata gaji akhir bulan (bukan Rp 858.211 uang masuk bulan ini); Ubah lalu Pakai saran; sakelar penghasilan kategori; tujuan baru dengan tenggat ("Sisihkan Rp 1 jt/bulan"); Sisihkan lewat isian manual; Catat teks "sisihkan 200rb dari bca ke Liburan" (AI) masuk ke tujuan; HP Rp 10,3 jt → "Dibayar dari tujuan tabungan" (tujuan baru) → Keinginan Rp 0, baris "Dibayar dari tujuan: HP baru", saldo BCA tidak berubah; Batalkan; pindah lagi lalu hapus + Urungkan (pelengkap ikut kembali); Kantong menampilkan "Disisihkan ke tujuan" dan total aset tetap; Profil memakai nama Utang & Piutang.
- **Utang & Piutang:** nama baru Lend & Borrow (Lend → Piutang, Borrow → Utang) di semua teks aplikasi. Alamat `/pinjaman` dan nama di kode tetap.

## Pertanyaan terbuka

1. **Tabungan di rekening yang sama** (diputuskan: diterima untuk versi ini, dengan baris "Disisihkan ke tujuan" di Profil → Kantong). Kalau uang tujuan sebenarnya masih di BCA (tidak dipindah ke pocket), saldo BCA di aplikasi jadi lebih kecil dari saldo asli di bank, karena sebagian "pindah" ke kantong tujuan. Total aset tetap benar. Usul: terima untuk versi ini, dan di Profil → Kantong tulis "Rp 10 jt disisihkan ke tujuan" di bawah totalnya. Opsi "tujuan ini disimpan di BCA" (saldo BCA menampilkan gabungannya) menyusul bila terasa membingungkan.
