# Spec: Penghasilan & tujuan tabungan (lanjutan fase 3)

Status: **diterapkan** · rilis 2.5.0 (25 Oktober 2026, branch `feat/metode-budget`) · disinkronkan dengan kode 1 Nov 2026

Lanjutan SPEC-metode-budget.md. Pemicunya pemakaian nyata:
1. **Gajian akhir bulan.** Metode membagi pemasukan *bulan ini*. Sebelum gajian, yang terbagi hanya uang masuk kecil (Rp 858 rb), jadi semua kelompok tampak lewat ratusan persen.
2. **Uang masuk ≠ penghasilan.** Transfer dari teman, hadiah, refund ikut terbagi.
3. **Beli HP Rp 10 jt dari tabungan setahun** terhitung Keinginan bulan ini (lewat 4157%), padahal uangnya disisihkan sejak lama.

## Keputusan user

- **Basis = penghasilan per bulan** yang disarankan aplikasi dan boleh diubah user; jatahnya tetap sepanjang bulan, kapan pun gajiannya.
- **Penghasilan bawaan:** Gaji, Bonus/THR, Usaha/Jualan, Freelance/Proyek. Pemberian, Cashback/Refund, Bunga/Investasi, Lainnya = uang masuk biasa.
- **Tujuan tabungan dibangun sekarang** (bukan sekadar tanda "dibayar dari tabungan").
- **Tabungan di rekening yang sama** diterima untuk versi ini: kalau uang tujuan sebenarnya masih di BCA (tidak dipindah ke pocket), saldo BCA di aplikasi lebih kecil dari saldo asli di bank, karena sebagian "pindah" ke kantong tujuan. Total aset tetap benar; Profil → Kantong menampilkan baris "Disisihkan ke tujuan".
  - **Terselesaikan oleh SPEC-simpanan §7:** tujuan bisa **"Disimpan di"** kantong uang lain (opsional). Saldo tujuan itu ikut saldo gabungan kantongnya ("BCA Rp 10 jt · Rp 7 jt + Dana darurat Rp 3 jt"), sama dengan m-banking; halaman Tujuan menulis "di BCA". Mengubahnya tidak memindahkan uang. Baris "Disisihkan ke tujuan" di Profil → Kantong hanya menjumlah tujuan yang terpisah.

## A. Penghasilan

- **`categories.penghasilan`** (boolean, hanya pemasukan; jenis lain selalu null):
  - bawaan: semua kategori pemasukan kecuali slug `gift`, `refund`, `investment`, `other` (`private.penghasilan_bawaan`);
  - kategori pemasukan buatan user: **ya** (biasanya sumber penghasilan: kos-kosan, ojol);
  - **Profil → Kategori:** form kategori pemasukan mendapat sakelar **"Dihitung sebagai penghasilan"**.
- **`metode_budget.penghasilan`** (rupiah, null = ikut saran).
- **Saran** (`saranPenghasilan`), dihitung untuk bulan yang dilihat: rerata penghasilan dari 3 bulan penuh sebelum bulan itu yang ada penghasilannya. Tidak ada → penghasilan bulan itu → 0. Profil → Budget dan Beranda memakai bulan berjalan. Penghasilan yang diatur sendiri satu angka untuk semua bulan.
- **Profil → Budget:** di kartu pratinjau, "Penghasilan per bulan Rp 8.000.000" dengan keterangan "Rerata N bulan terakhir" / "Penghasilan bulan ini" / "Belum ada penghasilan tercatat" / "Diatur sendiri", dan tombol **Ubah** (isian nominal + "Pakai saran (Rp …)").
- **Basis metode** (Analitik, Beranda, Tanya AI) = penghasilan per bulan ini. Untuk metode persentase, Tabungan dari sisa: basis − pengeluaran selain tabungan (metode lain: SPEC-metode-lanjutan).

## B. Tujuan tabungan

Mengikuti pola Utang & Piutang, yang mencatat orang sebagai kantong berjenis `orang`:

- **Tujuan = kantong berjenis `tujuan`** dengan **target** (wajib) dan **tenggat** (opsional). Saldonya = yang sudah terkumpul.
- **Menyisihkan = transfer** dari kantong mana pun ke kantong tujuan:
  - lewat Catat: "sisihkan 500rb dari bca ke HP baru" (kantong & tujuan dicocokkan dari nama, SPEC-ai-kantong);
  - bukti transfer ke kantong bank sungguhan (pocket Jago/Blu/SeaBank) yang diberi nama sama/alias juga otomatis masuk.
- **Memakai = pengeluaran dari kantong tujuan.** Pengeluaran ini **tidak dihitung** di jatah bulanan metode (sejak 2.8.0 juga tidak di angka bulanan lain: SPEC-analitik-tujuan), dan ditampilkan sendiri di kartu metode: "Dibayar dari tujuan: HP baru".
- **Total aset** tetap menghitung kantong tujuan (uangnya tetap milikmu).

### Tampilan

- **Profil → Tujuan tabungan** (`/profil/tujuan`; baris menu "HP baru, liburan, dana darurat"; di layar lebar terbuka di panel kanan Profil, tanpa item sidebar sendiri):
  - app bar: "Rp … terkumpul" dan tombol **+** ("Tujuan baru"); kosong → "Belum ada tujuan" dengan tombol **Buat tujuan**;
  - tiap tujuan: emoji, nama, terkumpul, bilah progres, "dari Rp 10 jt", dan keterangan: "Sisihkan Rp 1 jt/bulan sampai Maret 2027" (ada tenggat; bulan ini ikut dihitung), "Kurang Rp …", "Lewat tenggat, kurang Rp …" (ikon peringatan), atau "Tercapai" (ikon + teks);
  - tujuan yang sudah dipakai habis (saldo ≤ 0 dan pernah dipakai) pindah ke bagian **Selesai** ("Sudah dipakai");
  - ketuk → lembar aksi: **Sisihkan**, **Pakai**, **Lihat riwayat** (Riwayat tersaring ke kantong itu), **Ubah**;
  - form **Tujuan baru / Ubah tujuan**: nama, emoji (saran + ketik), target, tenggat (opsional; paling cepat hari ini — "Tenggatnya paling cepat hari ini." — kecuali tenggat lama tujuan yang sudah lewat dan tidak diubah), "Sudah terkumpul" (saldo awal sebelum memakai aplikasi, berlaku sejak tujuan dibuat). Nama yang sudah dipakai kantong lain (tanpa beda huruf) ditolak dengan menyebut tempatnya.
  - **Hapus tujuan** ada di form Ubah, untuk tujuan mana pun (juga yang punya riwayat). Konfirmasi menyebut akibatnya (`dampakHapusTujuan`): bila bersaldo, "Rp X di tujuan ini ikut hilang dari Total aset. Kalau uangnya masih ada, pakai Pakai dulu untuk memindahkannya."; bila ada riwayat, "n transaksi tetap tercatat, tanpa tujuan ini." Transaksinya tidak dihapus, hanya lepas dari tujuan (pengeluaran dari tujuan itu masuk lagi ke hitungan bulanannya).
- **Sisihkan** dan **Pakai** membuka isian manual Catat yang sudah terisi (pindah ke tujuan / bayar pakai tujuan). Pindah kantong **ke** tujuan tabungan: "Dari kantong" hanya kantong uang tanpa tujuan tabungan (`kantongSumber`; tujuan itu sendiri tidak ditawarkan).
- **Kantong:** tujuan tidak tampil di daftar Profil → Kantong (seperti kantong orang); di sana cukup satu baris "Disisihkan ke tujuan · n tujuan tabungan" yang membuka halaman tujuan. Di pilihan kantong (Catat, edit transaksi) tujuan tampil di daftar yang sama dengan kantong lain (pengeluaran, pemasukan, pindah), kecuali "Dari kantong" saat menyisihkan ke tujuan. Sumber uang di Pinjamkan, Bayar tagihan, dan Bayar cicilan juga tanpa tujuan (SPEC-lend-borrow). Baris "Disisihkan ke tujuan" membungkus teksnya di panel sempit.
- **Kartu metode (Analitik/Beranda):** baris "Disisihkan ke tujuan · Bulan ini" (setoran bersih; negatif → "Ditarik dari tujuan"), kecuali metodenya sudah punya wadah setoran sendiri; dan baris "Dibayar dari tujuan: HP baru · Di luar jatah bulan ini" per tujuan.
- **Tanya AI:** `saldo_kantong` membawa tiap tujuan (terkumpul, target, tenggat); ringkasan bulan membawa `dibayar_dari_tujuan_tabungan` dan `disisihkan_ke_tujuan_tabungan`, jadi "kenapa boros?" bisa dijawab "beli HP baru Rp 10,3 jt dari tabungan HP".

### Transaksi lama: "Dibayar dari tujuan tabungan"

Pembelian yang sudah tercatat dari BCA (seperti HP tadi):
- Detail transaksi pengeluaran (bukan draft) mendapat baris **"Dibayar dari tujuan tabungan"**: pilih tujuan, atau **Tujuan baru** (cukup nama; target = nominalnya, berlaku sejak tanggal belanja).
- Aplikasi lalu:
  - bila saldo tujuan sekarang kurang (atau tujuannya dibuat sesudah tanggal belanja), mencatat **transfer pelengkap** kekurangannya dari kantong asal ke tujuan, di tanggal & jam yang sama (`pelengkap_tujuan` = id pengeluaran);
  - memindahkan kantong pengeluaran itu ke kantong tujuan (bagian pecahan ikut).
- **Tujuan kosong → saldo kantong asal tidak berubah sama sekali.** Tujuan yang sudah berisi ikut terpakai: saldo tujuan turun sebesar itu dan kantong asal naik sebesar itu (uang tujuan dianggap dipakai untuk belanja ini). Pengeluarannya keluar dari jatah bulanan dan tercatat sebagai pemakaian tujuan.
- Snackbar "Dibayar dari tujuan …" dengan **Urungkan**. Sesudahnya, bila ada transfer pelengkap, detail menampilkan "Dibayar dari tujuan … · Di luar jatah bulan ini" dengan tombol **Batalkan** → kantong kembali, transfer pelengkap terhapus. Tanpa pelengkap, kantong asalnya tidak tercatat; pembatalan lewat Urungkan atau mengubah kantong di Ubah transaksi.
- Menghapus pengeluarannya ikut menghapus transfer pelengkapnya.

## Data (migrasi)

`20261106000000_penghasilan_tujuan.sql`:
- `categories.penghasilan boolean` + isian awal sesuai bawaan; trigger kategori (bawaan untuk user baru & isian baru) ikut mengisinya.
- `metode_budget.penghasilan numeric(14,2) null check (> 0)`.
- Jenis kantong baru `tujuan`; `user_accounts.target numeric(14,2) null`, `user_accounts.tenggat date null`. Constraint `user_accounts_target_check`: `tujuan` wajib `coalesce(target > 0, false)`; jenis lain target & tenggat null. Grant kolom insert/update `target, tenggat`.
- `transaksi_data.pelengkap_tujuan uuid null references transaksi_data on delete cascade` (+ indeks), dibawa view & trigger tulis.

## Pengujian

- **Unit** (`uji:metode`):
  - saran penghasilan: rerata 3 bulan penuh (gajian akhir bulan), cadangan bulan ini, kategori non-penghasilan tidak dihitung;
  - basis dari penghasilan diatur sendiri;
  - pengeluaran dari kantong tujuan tidak masuk realisasi wadah;
  - setoran bersih ke tujuan;
  - progres tujuan & "perlu Rp X/bulan" dari tenggat.
- **E2E** (`e2e/tujuan.mjs`, akun sementara): lihat Hasil.
- **Tanya AI:** `eval:tanya` ("kenapa bulan ini boros?" menyebut HP dibayar dari tabungan).
- **Regresi:** semua `uji:*` & E2E, typecheck, `next build`.

## Boundaries

- **Jangan:** mengeluarkan tujuan dari total aset; mengubah saldo kantong asal saat "Dibayar dari tujuan tabungan" ke tujuan yang kosong.
- **Tanya dulu:** mengubah arti "bulan" (periode gajian).
- ~~Tujuan yang punya riwayat tidak bisa dihapus.~~ Sejak SPEC-perbaikan-temuan (C5): boleh dihapus kapan saja, konfirmasi menyebut saldo & transaksi yang terdampak.

## Hasil

- **Migrasi** `20261106000000_penghasilan_tujuan.sql`. Uji kering di transaksi yang di-rollback, termasuk sebagai role `authenticated`; sesudah migrasi dicek lagi lewat API sebagai user biasa.
  - Uji kering menangkap satu celah: tujuan tanpa target lolos, karena `null > 0` bernilai null dan constraint menganggap null lolos. Diperbaiki dengan `coalesce(target > 0, false)`.
- **Berbeda dari rancangan:**
  - **Tidak ada item sidebar.** Halaman tujuan ada di dalam Profil, jadi di layar lebar sudah terbuka di panel kanan Profil.
  - ~~**Tujuan yang punya riwayat tidak bisa dihapus.**~~ Diganti SPEC-perbaikan-temuan C5: boleh dihapus, dengan konfirmasi yang menyebut akibatnya (menghapusnya melepas pengeluaran dari kantong tujuan, sehingga pembelian itu masuk lagi ke jatah bulan itu). Tujuan yang sudah dipakai habis pindah ke bagian **Selesai**.
  - **"Sisihkan" dan "Pakai" membuka isian manual Catat** yang sudah terisi (pindah ke tujuan / bayar pakai tujuan), bukan form baru.
  - **"Batalkan" hanya muncul bila ada transfer pelengkap.** Bila saldo tujuan cukup (tanpa pelengkap), kantong asalnya tidak tercatat; pembatalan lewat snackbar "Urungkan" atau mengubah kantong di Ubah transaksi.
  - **Pilihan kantong tidak dikelompokkan**: tujuan tampil di daftar yang sama.
- **E2E** (akun sementara, 15 cek): penghasilan saran Rp 8 jt dari rerata gaji akhir bulan (bukan Rp 858.211 uang masuk bulan ini); Ubah lalu Pakai saran; sakelar penghasilan kategori; tujuan baru dengan tenggat ("Sisihkan Rp 1 jt/bulan"); Sisihkan lewat isian manual; Catat teks "sisihkan 200rb dari bca ke Liburan" (AI) masuk ke tujuan; HP Rp 10,3 jt → "Dibayar dari tujuan tabungan" (tujuan baru) → Keinginan Rp 0, baris "Dibayar dari tujuan: HP baru", saldo BCA tidak berubah; Batalkan; pindah lagi lalu hapus + Urungkan (pelengkap ikut kembali); Kantong menampilkan "Disisihkan ke tujuan" dan total aset tetap; Profil memakai nama Utang & Piutang.
- **Utang & Piutang:** nama baru Lend & Borrow (Lend → Piutang, Borrow → Utang) di semua teks aplikasi. Alamat `/pinjaman` dan nama di kode tetap.

## Belum diterapkan

- Pilihan kantong dikelompokkan dengan judul "Tujuan tabungan".
