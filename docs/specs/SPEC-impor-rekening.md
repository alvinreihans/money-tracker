# Spec: Impor rekening koran (SeaBank, Jago, BRI)

Status: **disetujui** (implementasi menunggu aba-aba user) · 6 November 2026 · branch `feat/impor-rekening` · pasangan [SPEC-lengkapi](SPEC-lengkapi.md)

Rekening koran jadi **sumber kebenaran soal uang** (nominal & kantong yang benar-benar terpotong); screenshot e-wallet dan struk melengkapi detailnya (SPEC-lengkapi). Impor rekening koran pernah ada dan dihapus di 2.0.0 sebagai penyederhanaan tampilan (`89df77f`), bukan karena gagal.

## Data nyata yang jadi acuan

Survei lokal atas data user (Mar–Okt 2026; tidak dikirim ke layanan mana pun):

| | SeaBank | Jago | BRI (BRImo) |
|---|---|---|---|
| File | bulanan, PDF teks | bulanan "Laporan Keuangan Bulanan" (semua kantong) **dan** "Pockets Transactions History" (Kantong Utama saja, sejak 2022) | bulanan "Laporan Transaksi Finansial" |
| Tanggal / jam | `DD MON`, **tanpa jam**, tahun dari periode | tanggal + `HH.MM`; bulan Inggris (bulanan) atau Indonesia (riwayat) | `dd/mm/yy HH:MM:SS` |
| Angka | `1.234.567`; kolom keluar & masuk dibedakan posisi x | `+7.813.240,00` / `-60.000` | `6,143,500.00` |
| Baris per bulan | ±105–115 (±30 bunga harian) | 20–80 (sebagian besar pindah antar kantong) | 6–14 |
| Bagian lain | ringkasan saldo; **deposito** (nama, tenor, jatuh tempo, bunga, pokok) | ringkasan per kantong (Utama, Dana Daruratku, Deposito, GoPay Tabungan, kartu, …) | saldo awal/akhir di halaman terakhir |
| Pengenal baris | (tanggal, nominal, saldo berjalan) | `ID#` | waktu sampai detik |

Semua PDF teks, tidak berpassword; saldo awal + Σ baris = saldo akhir di 779 baris SeaBank yang diperiksa.

## Rancangan

### 1. Mengunggah

- PDF rekening koran diterima di tempat yang sama dengan foto struk: lampiran di **Catat**, seret-lepas di layar lebar, dan **Bagikan** dari aplikasi bank. Beberapa PDF sekaligus boleh.
- **Bank & rekening dikenali dari isi PDF** (judul dokumen + 4 digit akhir nomor rekening). Rekening dipetakan ke kantong:
  - kantong yang 4 digit akhirnya sudah tersimpan → langsung;
  - belum → ditanya sekali "Rekening SeaBank …1234 ini kantong yang mana?" (pilih kantong atau **Buat kantong SeaBank**); 4 digit akhir disimpan di kantong itu (kolom baru `nomor_akhir`).
- Bank yang belum didukung: "Rekening koran dari bank ini belum bisa dibaca." (**K5**).
- PDF tidak disimpan; yang tersimpan hanya transaksi hasilnya.

### 2. Membaca (parser khusus per bank, `src/lib/rekening/`)

- Fungsi murni per format: `seabank`, `jagoBulanan`, `jagoRiwayat`, `bri` → daftar baris seragam: tanggal, jam (bila ada), nominal bertanda, saldo berjalan, uraian, jenis bank (Payment, Interest, Transfer, …), pihak lawan (nama, bank, 4 digit akhir bila ada), pengenal unik, kantong Jago (untuk Jago bulanan).
- **Validasi**: saldo awal + Σ baris = saldo akhir per rekening/kantong. Tidak cocok → impor ditolak dengan pesan, tidak ada yang tersimpan.
- Teks PDF dibaca di server (`pdfjs-dist`), tanpa AI.

### 3. Pratinjau sebelum menyimpan

Satu lembar per rekening: "SeaBank …1234 · 1–30 Sep 2026 · 112 baris", lalu ringkasan:
- **n transaksi baru**;
- **n sudah tercatat** (cocok dengan transaksi yang sudah ada, §5) — tidak dibuat lagi;
- **n pindah kantong** antar rekening sendiri (§6);
- **bunga** (digabung, §4);
- saldo akhir menurut bank vs menurut aplikasi sesudah impor, dengan tawaran menyamakan bila beda (§7).
Tombol **Impor** / **Batal**. Pratinjau tidak mengubah apa pun.

### 4. Menjadi transaksi

- Semua baris jadi transaksi **tercatat** (`confirmed`, ikut saldo), `source = 'statement'`, dengan pengenal baris bank tersimpan (kolom baru `ref_bank`, unik per user) supaya **impor ulang file yang sama atau yang periodenya tumpang tindih tidak menggandakan** (mis. Jago riwayat vs Jago bulanan).
- Kategori dari aturan per jenis baris, tanpa AI:

| Baris | Jadi |
|---|---|
| Bunga / Savings Interest | pemasukan Bunga/Investasi — **digabung satu per bulan per rekening** (**K2**), keterangan "Bunga Sep 2026 (30 hari)" |
| Pajak Bunga / Withholding Tax | pengeluaran Biaya, digabung bersama bunganya per bulan |
| Admin Fee, Monthly Fee ATM, biaya transfer, Fee | pengeluaran Biaya admin (fee transfer menempel ke transfernya sebagai ikutan) |
| Refund | pemasukan Cashback/Refund |
| Pembayaran via e-wallet ("ShopeePay Payment", "Shopee Payment", "Jago Pay", QRIS) | pengeluaran **Lainnya**, merchant dari bank ("ShopeePay"), bertanda **Perlu dilengkapi** (**K3**, SPEC-lengkapi) |
| Transfer ke/dari orang | pengeluaran / pemasukan **Lainnya**, merchant = nama pihak, Perlu dilengkapi |
| Pindah dana ke rekening/e-wallet sendiri | pindah kantong (§6) |
| SPinjam / SPayLater | pinjaman & pembayaran cicilan sesuai SPEC-lend-borrow bila kantong/rencananya ada; selain itu Perlu dilengkapi |

- Jam: dari bank bila ada; SeaBank tanpa jam (urutan baris tetap disimpan untuk mencocokkan, SPEC-lengkapi).

### 5. Transaksi yang sudah tercatat sebelumnya

Baris bank dianggap **sudah tercatat** bila ada transaksi di kantong yang sama dengan nominal sama, tanggal sama (±1 hari), dan belum tertaut baris bank lain. Transaksinya dipertahankan (isinya biasanya lebih lengkap), hanya ditautkan (`ref_bank` diisi). Kalau ada lebih dari satu kandidat, dipilih yang jamnya paling sesuai urutan rekening; yang ragu ditampilkan di pratinjau untuk dipilih.

### 6. Pindah kantong antar rekening sendiri

- Pasangan dikenali bila: dua sisi di kantong milik user, nominal sama persis, tanggal ±1 hari, dan jam sama sampai menit bila keduanya punya jam (contoh: Jago → BRI 5 Okt 14.20 Rp 1,3 jt; BRI → ShopeePay "Top Up Shopee").
- Sisi kedua yang belum diimpor: dicatat sebagai pindah kantong ke kantong itu sekarang; saat rekening koran pasangannya diimpor kemudian, barisnya tertaut ke pindah kantong yang sama (tidak dobel).
- Transfer ke e-wallet sendiri (ShopeePay, DANA, GoPay) dikenali dari uraian ("Top Up Shopee 08xx…", "Isi Saldo Dompet Digital … ShopeePay", "Top Up - eWallet") bila kantong e-wallet itu ada.
- **Jago:** pindah uang antar kantong Jago dicatat sebagai pindah kantong antar simpanan Jago (**K1**), tidak pernah dipasangkan dengan bank lain.

### 7. Saldo kantong

Sesudah impor, saldo kantong menurut aplikasi dibandingkan dengan saldo akhir rekening koran. Bila beda (mis. saldo awal kantong diisi asal), pratinjau menawarkan **"Samakan saldo awal SeaBank supaya akhir September = Rp 150.000"** (mengubah `saldo_awal` dengan tanggal sebelum periode). Baris sebelum tanggal saldo kantong tetap tercatat tapi tidak menggeser saldo (SPEC-saldo-waktu).

### 8. Deposito & kantong Jago (SPEC-simpanan)

- Bagian deposito SeaBank (nama, tenor, jatuh tempo, bunga, pokok) dicocokkan ke simpanan deposito di dalam kantong SeaBank; belum ada → ditawarkan **"Buat deposito Promo 3 bulan, 6%, Rp 5 jt?"**.
- Kantong Jago selain Kantong Utama (Dana Daruratku, Deposito, GoPay Tabungan, …) dipetakan ke **simpanan di dalam Jago** (dibuat bila belum ada) (**K1**).

## Keputusan (6 Nov 2026: K1–K5 semua memakai usulan)

| K | Pertanyaan | Usulan | Alternatif |
|---|---|---|---|
| K1 | Kantong-kantong Jago | Jadi **simpanan di dalam Jago** (pindah antar kantong = pindah antar simpanan) | Hanya Kantong Utama yang diimpor |
| K2 | Bunga harian SeaBank (±30 baris/bulan) | **Digabung satu pemasukan per bulan** (pajak ikut di keterangan) | Satu transaksi per baris |
| K3 | Pembayaran via e-wallet yang belum jelas kategorinya | **Tercatat** (ikut saldo) sebagai Lainnya dengan tanda **Perlu dilengkapi** | Jadi draft "Belum selesai" (tidak ikut saldo sampai dilengkapi) |
| K4 | Saldo kantong beda dengan rekening koran | **Tawarkan menyamakan saldo awal** | Biarkan; hanya tampilkan selisihnya |
| K5 | Bank lain (BCA, Mandiri, …) | **Belum didukung**; parser ditambah per bank bila dibutuhkan | AI sebagai cadangan (kurang andal, makan kuota) |

## Pengujian

- **Unit** (`uji:rekening`): tiap parser terhadap potongan teks contoh yang **disamarkan** (bukan data asli user di repo): multi-baris SeaBank, kolom keluar/masuk dari posisi x, bulan Indonesia/Inggris Jago, angka BRI, validasi saldo, pengenal baris, aturan kategori, penggabungan bunga, pasangan pindah kantong, pencocokan "sudah tercatat".
- **E2E** (`impor-rekening`): PDF contoh buatan (bukan data user) → pratinjau → impor → impor ulang tidak menggandakan → saldo.
- **Uji dengan data asli** hanya lokal, lewat skrip diagnostik yang membaca folder di luar repo dan tidak menyimpan apa pun.

## Boundaries

- Data asli user tidak pernah masuk repo, tes, atau log.
- Tidak ada AI di jalur impor rekening koran.

## Belum diterapkan

Seluruh spec ini (implementasi menunggu aba-aba user).
