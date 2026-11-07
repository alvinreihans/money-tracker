# Spec: Deposito jatuh tempo dari rekening koran

Status: **diterapkan, belum dirilis** (K1–K4 usulan diterima user) · 7 November 2026 · branch `feat/deposito-jatuh-tempo` · lanjutan [SPEC-simpanan](SPEC-simpanan.md) §5 dan [SPEC-impor-rekening](SPEC-impor-rekening.md) §8 (butir "Belum diterapkan": deposito jatuh tempo)

## Masalah

Satu kejadian jatuh tempo deposito sekarang bisa tercatat **dua kali**:

1. **Evaluasi di aplikasi** (SPEC-simpanan §5): di hari jatuh tempo user mengetuk **Sesuai** / **Isi yang diterima** / **Cairkan sekarang** → aplikasi mencatat pemasukan bunga, dan untuk deposito yang cair, pindah kantong seluruh saldo deposito → induk.
2. **Impor rekening koran** bulan itu juga mencatat kejadian yang sama dari baris bank:
   - baris bunga & pajak deposito ikut **digabung ke "Bunga <bulan>" harian** rekeningnya (jadi pemasukan kedua);
   - baris pencairan SeaBank ("Time Deposit", uang masuk) dicatat sebagai **pindah kantong deposito → SeaBank** kedua.

Akibatnya saldo induk dan pemasukan bunga bisa dobel. Keduanya tidak saling tahu: evaluasi tidak melihat rekening koran, impor tidak melihat periode deposito.

Masalah sejenis yang sudah tercatat di SPEC-impor-rekening ("Belum diterapkan"): penempatan deposito yang dulu terimpor sebagai **pengeluaran**, lalu depositonya dibuat manual dengan "Sudah termasuk" → penempatan tercatat dua kali (pengeluaran + pindah kantong pembuatan).

## Bentuk di rekening koran (dari data user, dirangkum)

| Bank | Penempatan | Jatuh tempo, diperpanjang pokok + bunga | Jatuh tempo, sekali saja (cair) |
|---|---|---|---|
| **Jago** (laporan bulanan) | kantong "Deposito" sendiri; "Penempatan Dana" Kantong Utama → Deposito | di kantong Deposito, tanggal jatuh tempo: baris **Bunga** (+) dan **Pajak Bunga** (−) di jam yang sama; tidak ada baris pencairan | belum ada contoh |
| **SeaBank** | "Fund Placement", jenis **Time Deposit** (−) di rekening; tabel TIME DEPOSIT (nama, tenor, jatuh tempo, bunga, pokok) | belum ada contoh | **belum ada contoh** (deposito user yang pertama cair belum jatuh tempo) |

Karena contoh pencairan SeaBank belum ada, aturan SeaBank di bawah sengaja **longgar** dan ditandai **perlu dicek ulang** begitu rekening koran bulan cairnya ada.

## Usulan perilaku

### 1. Satu kejadian jatuh tempo = satu catatan; rekening koran menang

Untuk tiap periode deposito (`deposito_periode`) yang jatuh tempo di rentang rekening koran yang diimpor:

| Keadaan periode | Yang dilakukan impor |
|---|---|
| **Belum dievaluasi** | Periode **ditutup dari rekening koran**: angka bunga bersih = bunga − pajak dari baris bank (bukan perkiraan). Hasilnya sama dengan evaluasi (pemasukan bunga, perpanjangan/cair menurut setelan deposito), tapi transaksinya bertaut ke baris bank (`ref_bank`), jadi impor ulang tidak menggandakan. Kartu "Deposito jatuh tempo" di Beranda hilang karena periodenya sudah dicek. |
| **Sudah dievaluasi** di aplikasi | Baris bank **ditautkan** ke transaksi hasil evaluasi (`transaksi_tutup`), tidak dicatat lagi. Bila nominal bunga beda dengan isian user → **K1**. |
| Tidak ada deposito yang cocok | Seperti sekarang (penempatan/pencairan jadi "lain", bunga ikut bunga rekening). |

Di pratinjau impor, kartu rekeningnya menyebut: **"Deposito <nama> jatuh tempo <tgl>: bunga bersih Rp X (perkiraan Rp Y) · diperpanjang sampai <tgl>"** atau **"… · Rp Z kembali ke SeaBank"**. Selisih dengan perkiraan tampil sebagai peringatan (pola SPEC-perbaikan-uiux #3).

### 2. Bunga deposito tidak ikut "Bunga <bulan>" harian

Baris bunga/pajak yang menjadi milik periode deposito (di bawah) dikeluarkan dari penggabungan bunga harian (SPEC-impor-rekening K2).

### 3. Mengenali baris jatuh tempo

- **Jago:** kantong Jago yang dipetakan ke simpanan **deposito** (lihat **K2**); baris Bunga & Pajak Bunga di kantong itu pada tanggal jatuh tempo periode (± 3 hari) = bunga periode itu.
- **SeaBank (longgar, perlu dicek ulang):** di rekening induk deposito, pada tanggal jatuh tempo ± 3 hari:
  - baris jenis **Time Deposit** uang masuk = pencairan (pokok, atau pokok + bunga bila digabung);
  - baris **Interest/Tax** yang uraiannya bukan "Savings Interest" = bunga/pajak deposito;
  - bunga bersih = total uang masuk deposito − pokok periode (bila bunganya tidak terpisah).
  - Tabel TIME DEPOSIT bulan berikutnya: deposito yang sudah tidak ada di tabel = sudah cair; yang masih ada dengan jatuh tempo baru = diperpanjang.
  - Tidak ada baris yang bisa dikenali padahal jatuh tempo sudah lewat → periode **tidak** ditutup otomatis; kartu evaluasi tetap muncul seperti sekarang.

### 4. Evaluasi sesudah impor

Kartu "Deposito jatuh tempo" hanya untuk periode yang belum ditutup. Periode yang ditutup dari rekening koran bisa **diurungkan** dari detail deposito (RPC `urungkan_tutup_periode` yang sudah ada); baris bank-nya kembali bebas.

### 5. Penempatan yang dulu terimpor sebagai pengeluaran

Deposito dibuat manual dengan "Sudah termasuk", padahal penempatannya sudah terimpor sebagai **pengeluaran** "Fund Placement" → saat deposito dibuat (atau saat impor berikutnya), pengeluaran itu **dihapus/diganti** oleh pindah kantong pembuatan, bukan diubah jadi pindah kantong kedua (**K3**).

## Keputusan user (7 Nov 2026)

| # | Pertanyaan | Keputusan |
|---|---|---|
| K1 | Periode sudah dievaluasi manual, lalu rekening koran menunjukkan bunga yang beda. | **Ikut angka bank** (transaksi bunga diubah ke nominal bank, catatan "disesuaikan dengan rekening koran"), karena saldo harus sama dengan bank. |
| K2 | Kantong Jago "Deposito" sekarang jadi simpanan **tabungan** (rekening koran Jago tidak memuat tenor & bunga %). | Saat impor, kantong Jago yang namanya mengandung "Deposito" ditawarkan **"Jadikan deposito?"** dengan isian tenor, bunga %, perpanjangan (tanggal mulai dari baris Penempatan Dana). Ditolak → tetap tabungan, bunganya ikut bunga bulanan seperti sekarang. |
| K3 | Penempatan ganda (§5). | Pengeluaran lama **dihapus** saat deposito "Sudah termasuk" dibuat dan tanggal + nominalnya sama dengan penempatan itu; ditampilkan di snackbar ("Pengeluaran Fund Placement … diganti"), bisa diurungkan. |
| K4 | Rentang tanggal kecocokan jatuh tempo. | ± 3 hari (libur bank / akhir pekan). |

## Pengujian

- **Unit** (`uji:rekening`, `uji:simpanan`): Jago pokok + bunga (Bunga + Pajak Bunga di kantong deposito → periode ditutup, periode baru dengan pokok + bunga, tidak masuk "Bunga <bulan>"); SeaBank cair sintetis (pencairan pokok + bunga digabung, dan terpisah); periode sudah dievaluasi → ditautkan, tanpa transaksi baru; K1 nominal beda; impor ulang = 0 baru; tidak ada baris dikenali → periode tetap terbuka.
- **E2E** (`simpanan`, `impor-rekening`): evaluasi dulu lalu impor (saldo induk = saldo akhir bank, pemasukan bunga satu); impor dulu lalu kartu evaluasi tidak muncul; urungkan penutupan dari rekening koran.
- **UAT** dengan rekening koran Jago asli user (lokal, tanpa data masuk repo). SeaBank dicek ulang saat rekening koran bulan cairnya ada.

## Belum diterapkan

- Bentuk pencairan SeaBank yang sebenarnya (belum ada contoh). Aturan §3 diterapkan apa adanya (longgar) dan ditandai **perlu dicek ulang** di kode (`src/lib/rekening/rencana.ts`, bagian 3b).
- Bentuk pencairan Jago (deposito sekali saja) juga belum ada contoh: dianggap baris "Pencairan Dana …" keluar dari kantong deposito, perlu dicek ulang.
- Tabel TIME DEPOSIT bulan berikutnya (§3, cair vs diperpanjang) belum dipakai; lihat keputusan 6.

## Keputusan saat implementasi

Hal yang tidak diatur spec, dipilih yang paling kecil dan sejalan dengannya:

1. **Di perencana impor** (`rencanakan`, bagian 3b, sebelum bunga bulanan): murni & diuji di `uji:rekening`. Masukannya deposito user beserta periodenya (yang sudah selesai ikut bila jatuh tempo terakhirnya ≥ awal rekening koran − 3 hari, supaya pencairan yang sudah dievaluasi bisa ditautkan) dan transaksi hasil evaluasinya (`transaksi_tutup`).
2. **Bunga dicatat di tempat barisnya**: Jago → kantong deposito itu (Bunga & Pajak Bunga ada di sana); SeaBank bunga terpisah → rekening induk; SeaBank digabung ke pencairan → deposito, lalu pencairan seluruhnya pindah ke induk (deposito berakhir Rp 0). Pokok periode berikutnya bertambah bunga hanya bila perpanjangannya "dengan bunga" dan bunganya masuk ke deposito.
3. **Cair** hanya bila ada baris pencairan (SeaBank "Time Deposit" uang masuk ≥ pokok; Jago "Pencairan Dana …"). Deposito "Sekali saja" tanpa baris pencairan tidak ditutup otomatis (rekening korannya mungkin berakhir sebelum pencairan); kartu evaluasi tetap muncul.
4. **Pengenal**: transaksi bunga memakai `ref_bank` baris Bunga/Interest pertama; bila bunganya digabung ke pencairan, `<ref pencairan>:bunga`. Baris Pajak tidak disimpan sendiri; impor ulang mengenalinya dari periode yang sudah ditutup (transaksi bunganya sudah berpengenal itu) → 0 baru.
5. **Penutupan dari rekening koran** lewat `impor_rekening` (bagian `tutup`), bukan `tutup_periode_deposito`: tanggal transaksinya tanggal baris bank, bukan hari impor. Hanya periode terakhir yang belum dicek; boleh berantai (perpanjangan 1 bulan yang juga jatuh tempo di rekening koran yang sama). Pindah kantong pencairan yang dibuat impor ikut `transaksi_tutup`, jadi Urungkan (detail deposito → Riwayat periode → "Urungkan penutupan ke-n dari rekening koran", kolom baru `dari_rekening`) mengembalikan saldo deposito juga. Deposito yang sudah selesai tidak tampil di Profil → Kantong, jadi pencairan dari rekening koran tidak bisa diurungkan dari sana.
6. **Tabel TIME DEPOSIT bulan berikutnya** belum dipakai: keputusan cair/diperpanjang cukup dari baris pencairan + setelan perpanjangan; yang tidak jelas dibiarkan terbuka (kartu evaluasi).
7. **"Bunga <bulan>" yang sudah terimpor** sebelum fitur ini (kantong & bulan yang sama): bila isinya hanya baris deposito itu, transaksi itulah yang dipakai sebagai bunga deposito (nominal & keterangannya diperbarui, pengenalnya jadi baris Bunga); bila bercampur bunga lain, periodenya tidak ditutup otomatis (seperti sebelumnya).
8. **Baris yang sudah tersimpan di transaksi lain** (mis. pencairan SeaBank yang dulu terimpor sebagai pemasukan) → periode tidak ditutup otomatis.
9. **K1** juga berlaku bila evaluasi mengisi Rp 0 padahal bank memberi bunga: transaksi bunga baru dibuat dan ditambahkan ke `transaksi_tutup`. Kantong transaksi hasil evaluasi tidak dipindah (mis. evaluasi "tanpa bunga" ke induk sementara bank mengkreditkannya ke kantong deposito Jago) — hanya nominal & keterangannya, dan tanggalnya (keputusan 14).
10. **K2** ditawarkan untuk kantong Jago bukan utama yang namanya mengandung "Deposito" dan belum menjadi deposito. Isian: bunga %/th, tenor (chip), perpanjangan; tanggal mulai & pokok dari baris "Penempatan Dana …" di kantong itu, atau (tanpa baris itu) tanggal mulai diisi user dan pokok = saldo kantong di awal rekening koran. Pajak otomatis menurut pokok. Kantong simpanan tabungan diubah jadi deposito (`macam_simpanan`, kini boleh diubah user), periode ke-1 dibuat, lalu periode itu langsung dicocokkan dengan rekening koran yang sama.
11. **K3 saat deposito dibuat** (form "Sudah termasuk"): RPC `ganti_penempatan` sesudah `buat_simpanan` — pengeluaran "Fund Placement" dari rekening koran di kantong induk, bertanggal = mulai periode ke-1 dan bernominal = pokok, dihapus; pindah kantong pembuatannya mengambil tanggal, jam, dan pengenal baris pengeluaran itu, dan saldo deposito berlaku sejak 00.00 WIB tanggal itu (pola `didanai` di impor). Urungkan di snackbar (`urungkan_ganti_penempatan`) mengembalikan semuanya. **K3 saat impor**: bila pindah kantong pembuatan (tanpa pengenal) sudah ada, pengeluaran itu dihapus dan pengenalnya pindah ke pindah kantong itu (tanggalnya tidak diubah); selain itu tetap diubah jadi pindah kantong seperti sebelumnya.
12. **Pratinjau**: kartu rekening menyebut tiap jatuh tempo ("Deposito Uji jatuh tempo …"; nama yang sudah memuat "Deposito" tidak diulang). Bunga yang beda dengan perkiraan (dibulatkan per rupiah) tampil sebagai peringatan "Bunga deposito beda dengan perkiraan"; K1 sebagai peringatan "Bunga deposito diubah sesuai bank". Tawaran K2 berjudul "Jadikan deposito?" dengan keterangan "Kantong Jago “Deposito” · penempatan 12 Okt 2026 Rp 10.000.000 · …". Pesan selesai impor menyebut "N jatuh tempo deposito dicocokkan".
13. **Migrasi** `20261115000000_deposito_jatuh_tempo.sql`: `deposito_periode.dari_rekening`, grant ubah `user_accounts.macam_simpanan`, `impor_rekening` (+ `hapus`, `jadikan`, `tutup`, `sesuaikan`), `urungkan_tutup_periode` (mengosongkan `dari_rekening`), `ganti_penempatan`, `urungkan_ganti_penempatan` — semuanya security invoker, `search_path` tetap, dicabut dari public/anon, dicek di `uji:isolasi`.
14. **Tanggal hasil evaluasi ikut bank** (ketemu saat E2E): evaluasi di aplikasi mencatat bunga (dan pencairan) bertanggal hari evaluasi — bisa sesudah akhir rekening koran, sehingga saldo akhir periode di pratinjau beda dengan bank dan ditawari "Samakan saldo awal" yang keliru. Saat ditautkan, tanggal & jamnya diubah ke baris bank (`sesuaikan[].tanggal`, hanya transaksi di `transaksi_tutup` periode itu); pratinjau menulis "…, ditautkan ke rekening koran; tanggalnya ikut bank (26 Okt 2026)". Butuh migrasi lanjutan `20261116000000_deposito_tanggal_bank.sql` (`impor_rekening` + `sesuaikan[].tanggal`; kantong yang dijadikan deposito berganti emoji bawaan 🐷 → 💰). Tanpa migrasi itu tanggalnya diabaikan (nominal tetap ikut bank).
15. **E2E**: `impor-rekening` bagian 6 (laporan Jago Oktober buatan `jagoDepositoOkt` di `scripts/contoh-rekening.mjs`): Jadikan deposito? diterima → impor dulu (kartu evaluasi tidak muncul) → Urungkan dari detail → evaluasi dulu dengan isian beda → impor lagi (satu pemasukan bunga, nominal & tanggal ikut bank, saldo = bank), plus area sentuh, fokus, peringatan, tanpa scroll samping di 390 & 1300 px. `simpanan` bagian 12: K3 snackbar & Urungkan.
