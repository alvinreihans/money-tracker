# Spec: Impor rekening koran (SeaBank, Jago, BRI)

Status: **diterapkan · rilis 2.12.0** · 6 November 2026 (diterapkan 7 November 2026) · branch `feat/impor-rekening` · migrasi `20261112000000_impor_rekening.sql` & `20261112000001_impor_rekening_deposito.sql` · pasangan [SPEC-lengkapi](SPEC-lengkapi.md) (fase 2)

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
- saldo akhir menurut bank vs menurut aplikasi sesudah impor; bila beda tampil sebagai **peringatan** ("Saldo akhir tidak sama") dengan tawaran menyamakan tepat di bawahnya (§7, SPEC-perbaikan-uiux #4). Nominal minus ditulis "−Rp".
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

Baris bank dianggap **sudah tercatat** bila ada transaksi di kantong yang sama dengan nominal sama, tanggal sama (±1 hari), dan belum tertaut baris bank lain. Transaksinya dipertahankan (isinya biasanya lebih lengkap), hanya ditautkan (`ref_bank` diisi). Kalau ada lebih dari satu kandidat, dipilih yang jamnya paling sesuai urutan rekening; yang ragu ditampilkan di pratinjau untuk dipilih ("Mungkin sudah tercatat": daftar pilihan radio per baris bank — jam, merchant, lalu tanggal bila beda hari — plus "Bukan, catat sebagai baru").

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

## Hasil uji data asli (lokal, 7 Nov 2026)

`npm run cek:rekening -- <folder>` membaca PDF dari luar repo dan hanya mencetak angka. Data user (Mar–Okt 2026 + riwayat Jago sejak 2022):

| | SeaBank | Jago | BRI |
|---|---|---|---|
| Berkas | 8 | 9 (8 bulanan, 1 riwayat) | 8 |
| Rekening/kantong × berkas | 8 | 57 | 8 |
| Baris | 775 | 741 | 65 |
| Validasi saldo | 8/8 lolos | 9/9 lolos | 8/8 lolos |
| Bunga & pajak → transaksi bunga bulanan | 246 → 8 | 127 → 65 | 0 |

Semua berkas sekaligus (kantong rekaan): 1.452 baris unik (129 baris dobel antar-berkas dilewati, Jago riwayat vs bulanan); pasangan pindah kantong dua sisi Jago→SeaBank 7, Jago→BRI 5, SeaBank→Jago 2, BRI→SeaBank 1, antar kantong Jago 55; tidak ada pindah kantong satu sisi yang rekening koran lawannya ikut diunggah; saldo akhir 10/10 kantong = rekening koran; impor ulang semua berkas: 0 transaksi baru.

Deposito SeaBank: didanai baris penempatan, saldo = pokok; tanpa baris penempatan (berkas Oktober saja): uang baru, saldo = pokok; 0 penempatan tercatat sebagai pengeluaran.

## Temuan UAT (7 Nov 2026, dari UAT SPEC-deposito-jatuh-tempo, data asli lokal)

Disetujui user untuk diperbaiki sebelum rilis berikutnya ("oke perbaiki dulu").

| # | Temuan | Diharapkan | Status |
|---|---|---|---|
| R1 | Rekening koran beberapa bulan sudah diimpor, lalu bulan berikutnya diimpor sendiri: pratinjau menulis **"Saldo akhir tidak sama"** + tawaran **Samakan saldo awal** di 5 dari 7 kartu Jago, padahal sesudah impor saldonya sama dengan bank (pratinjau ulang berkas yang sama, 0 baris baru, tetap memperingatkan). Menerima Samakan merusak `saldo_awal`. | Saldo "menurut aplikasi" di pratinjau = saldo kantong di akhir periode berkas **sesudah** impor ini (transaksi yang sudah ada + yang akan dibuat/ditautkan/diubah), sama dengan yang terlihat sesudah impor. Peringatan & Samakan hanya muncul bila memang beda. | **Diperbaiki** (keputusan 21) |
| R2 | Rekening A (Jago) diimpor saat kantong rekening B (SeaBank) belum ada: transfer A ↔ B tercatat sebagai pengeluaran/pemasukan biasa (Lainnya, Perlu dilengkapi). Lalu B diimpor: baris B dicatat sebagai **pindah kantong baru**, transaksi lama di A tetap → A dobel (UAT: meleset Rp 7.950.000 dari bank, 9 baris). | Pelengkap §6: saat rekening koran B diimpor, baris B yang cocok (aturan pasangan §6: nominal sama, ±1 hari, jam sama bila ada, ada tanda rekening sendiri) dengan transaksi rekening koran A yang tercatat sebagai pengeluaran/pemasukan biasa → transaksi A **diubah jadi pindah kantong** A ↔ B (pola `jadiPindah`, `ref_bank_tujuan` diisi baris B), tidak ada transaksi baru. Pratinjau B menyebutnya ("n transaksi di Jago diubah jadi pindah kantong"). Saldo A & B sama dengan bank sesudahnya, impor ulang 0 baru. | **Diperbaiki** (keputusan 22; migrasi `20261117000000_pindah_antarbank.sql`) |

## Keputusan saat implementasi

Hal yang tidak diatur spec, dipilih yang paling kecil dan sejalan dengannya:

1. **Satu lembar pratinjau per unggahan**, berisi satu kartu per rekening (kantong Jago masing-masing satu kartu; beberapa berkas rekening yang sama digabung, "· 2 berkas"), dan satu tombol Impor. Dengan begitu pasangan pindah kantong antar-berkas langsung terlihat.
2. **Satu berkas gagal = seluruh unggahan ditolak** (§2): pesan per berkas, tanpa tombol Impor, tidak ada yang tersimpan. Sama untuk bank yang belum didukung (K5) dan berkas yang bukan PDF.
3. **Pengenal baris (`ref_bank`)**: SeaBank tanggal + nominal bertanda + saldo sesudahnya; BRI tanggal & jam (detik) + nominal + saldo; **Jago bukan `ID#`**: di data asli transfer BI-Fast punya `ID#` berbeda di laporan bulanan dan riwayat, jadi dipakai nomor kantong + tanggal + jam + nominal + saldo (sama di kedua format). Pengenal kembar di satu rekening koran (transfer gagal, dikembalikan, lalu diulang di menit yang sama) diberi "#2". Pindah kantong menyimpan pengenal sisi asal di `ref_bank` dan sisi tujuan di `ref_bank_tujuan`; keduanya unik per user (bukan global, supaya tidak membocorkan baris akun lain).
4. **Bunga (K2)**: satu **pemasukan bersih** (bunga − pajak) per bulan per rekening/kantong Jago, kategori Bunga/Investasi, tanggal & jam baris bunga terakhir bulan itu, keterangan "Bunga Sep 2026 (30 hari) · kotor Rp 480, pajak Rp 40" (seperti bunga deposito di SPEC-simpanan). Pajak tidak jadi transaksi terpisah: ikutan biaya hanya untuk pindah kantong (`ikutan_sesuai_jenis`). Rekening koran yang lebih lengkap untuk bulan yang sama memperbarui nominalnya bila lebih besar (pengenal `<bank>:<4 digit>:bunga:<bulan>`).
5. **Biaya transfer** jadi ikutan pindah kantongnya: BRI (waktu & uraian sama, ≤ Rp 10.000 — biaya BI-Fast), SeaBank (baris "Fee" sesudah top up/transfer di hari yang sama), Jago ("Biaya Transfer Keluar" di menit yang sama). Bila transaksi induknya bukan pindah kantong, biaya dicatat sendiri sebagai Biaya admin.
6. **Pindah kantong (§6) butuh tanda rekening sendiri**: 4 digit akhir nomor lawan = `nomor_akhir` kantong (dan nama bank lawan tidak menyebut kantong lain — nomor HP e-wallet bisa kebetulan sama), **atau** nama lawan = pemilik rekening (huruf tersamar "X" dan kata terakhir yang terpotong dianggap cocok) dan nama bank/e-wallet-nya cocok dengan nama/alias kantong. Dua sisi di unggahan yang sama dipasangkan bila nominal sama persis, tanggal ±1 hari, dan menit sama bila keduanya berjam. Tanpa tanda itu: Lainnya, Perlu dilengkapi.
7. **Pemetaan**: hanya rekening utama yang ditanya; kantong Jago lain mengikuti kantong Jago-nya, dicocokkan ke simpanan di dalamnya lewat `nomor_akhir` (nomor kantong Jago) atau nama, selain itu dibuat sebagai simpanan **tabungan/pocket** (termasuk kantong "Deposito" Jago — bunga & tenornya tidak tertulis) bersaldo awal = saldo sebelumnya di periode pertama, sejak awal periode itu. Kantong Jago kosong (tanpa baris, saldo 0) tidak dibuat. Kantong lawan yang hanya disebut di riwayat → simpanan bersaldo 0 sejak saat impor; kantong yang sudah ditutup (tanpa nama, "Tarik Uang Kantong") → Lainnya, Perlu dilengkapi.
8. **Buat kantong SeaBank**: nama bank (atau "SeaBank …1234" bila nama itu sudah dipakai), saldo awal = saldo awal rekening koran paling awal, berlaku sejak 00.00 tanggal awal periodenya, 4 digit akhir tersimpan.
9. **Saldo (§7)**: saldo kantong menurut aplikasi di akhir periode terakhir (sesudah impor); bila saldo kantong diisi sesudah periode, dihitung mundur dari saldo itu. **Samakan** (kotak centang, bawaan tidak): `saldo_sejak` = 00.00 WIB tanggal awal periode paling awal, `saldo_awal` = saldo akhir bank − jumlah transaksi kantong itu dalam periode (sesudah impor), jadi akhir periodenya tepat sama dengan bank.
10. **Deposito SeaBank (§8)**: dicocokkan dengan nama ke simpanan deposito di kantong SeaBank itu; tawaran berupa kotak centang (bawaan tidak). Dibuat lewat `buat_simpanan` (perpanjangan "sekali saja", mulai = jatuh tempo − tenor, pajak bawaan SPEC-simpanan). Bila **baris penempatan** ("Time Deposit / Fund Placement") ada di rekening koran — di unggahan ini atau sudah terimpor sebelumnya — deposito dibuat **bersaldo 0 sejak 00.00 WIB tanggal penempatan** dan diisi oleh pindah kantong penempatannya (seperti "sudah termasuk" di SPEC-simpanan); tanpa baris penempatan, deposito dibuat sebagai uang baru (saldo = pokok sejak saat impor). Baris penempatan dicocokkan ke deposito yang sudah ada di kantong itu walau rekening koran tersebut tidak memuat tabel deposito (pokok sama lebih dulu); penempatan yang dulu terimpor sebagai pengeluaran (sebelum depositonya ada) diubah jadi pindah kantong ke deposito itu. Tanpa deposito sama sekali: Lainnya, Perlu dilengkapi. Jadi deposito selalu = pokok, total aset tidak bertambah dua kali, dan penempatan tidak pernah jadi pengeluaran.
11. **Sudah tercatat (§5)**: kandidat = transaksi tercatat di kantong yang sama (uang masuk lewat pindah kantong: sisi tujuannya), nominal sama, ±1 hari, sisinya belum tertaut; tanggal paling dekat dulu, lalu jam paling dekat; baris tanpa jam memakai urutan jam kandidat. **Ragu** hanya bila baris tanpa jam punya lebih banyak kandidat di hari itu daripada baris bernominal sama; pilihan bawaan kandidat berjam paling awal, bisa diganti atau "Bukan, catat sebagai baru".
12. **Aturan kategori tambahan**: "Refund - …", Cashback Jago, dan pembatalan transaksi kartu/QRIS Jago ("…-R") → Cashback/Refund (tidak Perlu dilengkapi); Adjustment SeaBank → Lainnya (merchant SeaBank, tidak Perlu dilengkapi); Admin Fee/Monthly Fee ATM/Biaya → Biaya admin; baris lain yang tidak dikenali → Lainnya, Perlu dilengkapi. Merchant = nama pihak lawan, atau teks bank; keterangan = uraian bank (+ Catatan Jago), terenkripsi seperti keterangan lain. Kategori bawaan yang sudah dihapus user → Lainnya.
13. **SPinjam / SPayLater**: hanya bagian kantongnya — pindah kantong ke/dari kantong orang/kartu yang namanya memuat SPinjam/SPayLater; rencana cicilan belum ditautkan (lihat Belum diterapkan).
14. **Perlu dilengkapi**: lencana di daftar transaksi, keterangan di detail; hilang begitu user menyimpan Edit transaksi. Riwayat mendapat chip "Perlu dilengkapi · n" (alamat `?lengkapi=1`), tampil bila ada yang bertanda.
15. **Unggah**: galeri Catat menerima PDF dan beberapa berkas (PDF → pratinjau; gambar pertama dilampirkan, sisanya diproses di latar seperti Bagikan); seret-lepas memisahkan gambar & PDF; Bagikan meneruskan PDF ke halaman lewat Cache Storage (tidak diunggah di latar, karena butuh pratinjau). Batas: 10 PDF, 4 MB per kiriman (batas permintaan Vercel), 200 halaman.
16. **Server**: `pdfjs-dist` 6 build legacy, modul worker-nya dimuat di proses yang sama (tanpa worker thread), `serverExternalPackages` + `outputFileTracingIncludes`. Pratinjau dan Impor membaca ulang PDF yang sama (disimpan di memori browser) dan menyusun ulang rencana dengan pilihan yang sama, lalu Impor menulis lewat satu RPC `impor_rekening` (security invoker, lewat view & trigger tulis); bentrok pengenal → "Sebagian baris rekening koran ini sudah diimpor barusan." Migrasi lanjutan `20261112000001_impor_rekening_deposito.sql` (`didanai`, `jadi_pindah`). `uji:bundle` memastikan pdfjs-dist terbaca dari bundle standalone.
17. **Jam**: SeaBank tanpa jam (`waktu` kosong); pindah kantong memakai jam sisi yang punya jam.
18. **Data untuk fase 2** disiapkan di migrasi yang sama: `ref_bukti` (Order SN / nomor bon) dan indeks `perlu_dilengkapi`.
19. **Deposito dibuat manual dengan "Sudah termasuk"** (pindah kantong induk → deposito saat dibuat), lalu rekening koran bulan penempatannya diimpor: baris penempatan ditautkan (`ref_bank`) ke pindah kantong pembuatan itu — pasangan kantong (induk → deposito di kantong itu) dan nominal sama, tanggal berapa pun, yang tanggalnya paling dekat — jadi tidak ada pindah kantong kedua dan saldo induk tidak berkurang dua kali. Tanggal pindah kantongnya tetap tanggal pembuatan (7 Nov 2026, fase 2).
20. **Urutan baris disimpan** (fase 2, SPEC-lengkapi): transaksi hasil impor ber-`created_at` = saat impor + posisi barisnya di rekening koran (milidetik), lewat `impor_rekening` versi migrasi `20261113000000_lengkapi_urutan.sql`.
21. **R1 — penyebab**: rencana hanya memuat transaksi sejak sehari sebelum periode berkas (supaya ringan), tapi saldo akhir periode dihitung dari `saldo_awal` kantong + transaksi yang dimuat saja. Kantong yang saldonya berlaku sejak bulan-bulan sebelumnya (dibuat dari rekening koran bulan pertama) kehilangan semua transaksi sebelum periode → saldo "menurut aplikasi" kurang, peringatan & Samakan palsu. **Perbaikan**: server juga mengambil saldo tiap kantong sekarang (`saldo_kantong`); bagian yang tidak dimuat = saldo sekarang − (`saldo_awal` + transaksi yang dimuat, aturan `ikutSaldo` yang sama), lalu ditambahkan. Saldo pratinjau juga memakai keadaan **sesudah** impor: transaksi yang dihapus (K3), diubah jadi pindah kantong (`jadiPindah`, R2), dan bunga yang diperbarui ikut dihitung. Tanpa migrasi.
22. **R2 — penyebab**: pasangan satu sisi (§6) hanya dicari di antara pindah kantong lama; transaksi rekening koran A yang dulu jadi pengeluaran/pemasukan biasa (kantong B belum ada) tidak dilihat, jadi baris B jadi pindah kantong baru di sampingnya. **Perbaikan**: sebelum membuat pindah kantong satu sisi, dicari transaksi rekening koran (`source = statement`) di kantong lawan: uang masuk di B ↔ pengeluaran di A, uang keluar di B ↔ pemasukan di A; nominal sama, ±1 hari, menit sama bila keduanya berjam, belum bertujuan, bukan ikutan; tanggal terdekat dulu. Tanda rekening sendiri tetap wajib (baris B harus dikenali menuju kantong A lewat 4 digit akhir atau nama pemilik + nama bank, keputusan 6), jadi transfer ke/dari orang lain tidak pernah diubah. Transaksi A diubah di tempat (`impor_rekening` bagian `ubah_pindah`): jadi pindah kantong, kategori Lainnya, tidak lagi Perlu dilengkapi, merchant "Pindah ke/dari …", sisi asal di `ref_bank` dan sisi tujuan di `ref_bank_tujuan` (bila B mengirim ke A, kantong asalnya jadi B dan pengenal A pindah ke `ref_bank_tujuan`). Kartu rekening B: "n transaksi di Jago diubah jadi pindah kantong", dihitung sebagai pindah kantong.

## Belum diterapkan

- SPinjam / SPayLater ditautkan ke rencana cicilan (SPEC-lend-borrow / SPEC-paylater); sekarang hanya pindah kantong ke kantong orang/kartu bila ada.
- **Dikerjakan di [SPEC-deposito-jatuh-tempo](SPEC-deposito-jatuh-tempo.md):** Deposito SeaBank yang jatuh tempo: pencairan & bunganya di rekening koran belum dicocokkan dengan evaluasi jatuh tempo SPEC-simpanan (bisa tercatat dua kali bila keduanya dipakai).
- Biaya transfer yang tertulis **sebelum** transaksi induknya tidak ditempelkan (dicatat sendiri sebagai Biaya admin).
- **Dikerjakan di [SPEC-deposito-jatuh-tempo](SPEC-deposito-jatuh-tempo.md) (K3):** Penempatan deposito yang dulu terimpor sebagai pengeluaran lalu depositonya dibuat manual dengan "Sudah termasuk": pengeluaran itu diubah jadi pindah kantong (keputusan 10) di samping pindah kantong pembuatan — belum ditangani.
