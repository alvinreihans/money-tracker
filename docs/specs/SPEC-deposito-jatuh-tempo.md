# Spec: Deposito jatuh tempo dari rekening koran

Status: **disetujui** (K1–K4 usulan diterima user) · 7 November 2026 · branch `feat/deposito-jatuh-tempo` · lanjutan [SPEC-simpanan](SPEC-simpanan.md) §5 dan [SPEC-impor-rekening](SPEC-impor-rekening.md) §8 (butir "Belum diterapkan": deposito jatuh tempo)

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

- Bentuk pencairan SeaBank yang sebenarnya (belum ada contoh).
