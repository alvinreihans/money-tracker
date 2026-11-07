# UAT: Impor rekening koran & Lengkapi dengan data asli (agregat)

Uji penerimaan untuk [SPEC-impor-rekening](../specs/SPEC-impor-rekening.md) dan [SPEC-lengkapi](../specs/SPEC-lengkapi.md), branch `feat/impor-rekening`, 7 November 2026. Dijalankan dengan **data asli user atas persetujuannya**: gambar lewat jalur AI aplikasi yang biasa (Gemini), PDF dibaca di server tanpa AI. Dokumen ini hanya memuat angka agregat dan jenis transaksi — tanpa nama, nomor rekening/HP, cabang toko, Order SN, nomor bon, atau daftar transaksi.

- **Akun:** akun uji sementara (dibuat lewat admin API, dihapus sesudahnya — terverifikasi tidak tersisa).
- **Kantong awal:** Tunai (bawaan), SeaBank (bank, saldo awal sengaja asal-asalan sejak 1 Sep, tanpa 4 digit akhir), ShopeePay (e-wallet, saldo 0 sejak 1 Sep).
- **Cara:** dev server lokal, Edge headless lewat `e2e/kepala.mjs`, semua langkah lewat tampilan (lampiran galeri di Catat). Respons `/api/upload-receipt` hanya diamati (tidak diubah) untuk analisis.
- **Data:** rekening koran SeaBank September 2026 (1 PDF), 37 screenshot ShopeePay 13–29 Sep, 15 struk Alfamart bertanggal September (dipilih dari tanggal di nomor bon; berkas "(1)" yang identik ternyata bertanggal Agustus, jadi uji gambar ganda memakai satu struk September yang dikirim ulang).

## Skenario & hasil

| Langkah | Diharapkan | Hasil | |
|---|---|---|---|
| 1. Impor PDF lewat Catat | Ditanya "kantong yang mana?" sekali; pratinjau; tawaran Samakan saldo awal; saldo SeaBank = saldo akhir rekening koran | Ditanya sekali (pilihan: kantong yang ada + "Buat kantong SeaBank"). Pratinjau: 108 baris → **78 transaksi baru**, **77 perlu dilengkapi**, **bunga 1 transaksi (30 baris digabung)**, 0 sudah tercatat, 0 pindah kantong; tawaran deposito tampil (tidak dicentang). Sebelum Samakan: aplikasi ≠ bank; sesudah dicentang: "sama dengan aplikasi". Impor → 79 transaksi, saldo SeaBank = saldo akhir rekening koran (selisih Rp 0) | ✓ |
| 2. 37 screenshot ShopeePay (satu batch) | Yang didanai SeaBank hampir semua melengkapi otomatis; Saldo ShopeePay → transaksi baru; SPayLater → cicilan | Ringkasan: **"37 struk: 33 melengkapi transaksi, 3 dicatat baru, 1 perlu dicek"** (149 dtk). 33/33 screenshot berdana SeaBank melengkapi = **semua 33 baris "ShopeePay Payment" 13–29 Sep**; 3 dibayar Saldo ShopeePay → baru di kantong ShopeePay; 1 isi saldo ShopeePay dari rekening bank lain → perlu dicek; 0 SPayLater di periode ini | ✓ |
| 3. 15 struk Alfamart September | Struk QRIS melengkapi baris rekening koran (juga yang sudah dilengkapi screenshot) | Ringkasan: **"15 struk: 13 melengkapi transaksi, 1 dicatat baru, 1 perlu dicek"** (62 dtk). 13 melengkapi (8 baris yang masih Perlu dilengkapi, 5 baris yang sudah dilengkapi screenshot); 1 dibayar kartu debit bank lain → perlu dicek; **1 struk QRIS ≥ 22.00 tidak menemukan pasangannya → dicatat baru (temuan T1)** | ✗ (T1, sudah diperbaiki) |
| 3b. Struk yang sama dikirim lagi | "Struk ini sudah dipakai …", tanpa AI | "Struk ini sudah dipakai untuk melengkapi transaksi ini, jadi tidak dicatat lagi: Alfamart · … · SeaBank"; tidak ada panggilan AI | ✓ |

### Pemeriksaan isian (sampel, disamarkan)

Dari 33 transaksi yang dilengkapi screenshot: semua mendapat merchant/penerima dan jam; 28 mendapat ikutan cashback (total ±Rp 1 rb), **semuanya di kantong ShopeePay**; tidak ada nominal/tanggal/kantong/tipe yang berubah (0 dari 79). Kategori: makan 12, belanja harian 10, lainnya 7 (semuanya transfer ke orang, keterangan "Kirim ke <nama> · <bank> …<4 digit>"), tagihan 1, transportasi 1, pendidikan 1, belanja 1.

| Sampel | Hasil |
|---|---|
| Minimarket (screenshot) | merchant toko, jam, belanja harian, cashback di ShopeePay; nominal/tanggal/SeaBank tetap |
| Warung makan (screenshot) | merchant, jam, makan, cashback; uang tetap |
| Transfer ke orang (screenshot) | merchant = penerima, keterangan "Kirim ke … · bank …4 digit", jam; kategori tetap Lainnya |
| Pulsa/paket data (screenshot) | merchant operator, tagihan, jam |
| Minimarket (screenshot lalu struk) | struk mengganti merchant dengan nama toko, mengisi rincian barang di keterangan, kategori belanja harian; jam dari screenshot tetap (5 dari 5 kasus sama: jam & nominal cocok) |

Catatan kecil (bukan galat): pangkas rambut dikategorikan "belanja", toko fotokopi "pendidikan", satu minimarket QRIS "makan" — pilihan kategori AI. Keterangan transaksi bayar yang dilengkapi screenshot tetap teks bank ("ShopeePay") karena screenshot tidak membawa keterangan.

## Invarian sesudah semua langkah

| Invarian | Hasil | |
|---|---|---|
| Saldo SeaBank = saldo akhir rekening koran (Lengkapi tidak mengubah uang) | Sama sesudah langkah 1, 2, dan 3 | ✓ |
| Tidak ada transaksi SeaBank terhitung dua kali | SeaBank tetap 79 transaksi (semua `statement`); Σ pemasukan = Σ kolom masuk rekening koran (termasuk bunga bersih, tidak ada baris pajak bulan ini), Σ pengeluaran = Σ kolom keluar; pemasukan − pengeluaran = saldo akhir − saldo awal. Tidak ada baris pindah kantong (top up ke ShopeePay tidak terjadi dari SeaBank bulan ini; transfer dari rekening Jago sendiri jadi pemasukan Perlu dilengkapi karena akun uji tidak punya kantong Jago — sesuai keputusan 6) | ✓ |
| Tidak ada belanja terhitung dua kali di semua kantong | **1 belanja terhitung dua kali** (sebelum perbaikan T1; sesudahnya 0): baris SeaBank (masih Perlu dilengkapi) + transaksi baru di kantong ShopeePay dari struknya (T1) | ✗ |
| Perlu dilengkapi turun sebanyak yang dilengkapi | 77 → 44 (−33, screenshot) → 36 (−8, struk) | ✓ |
| Sisa Perlu dilengkapi = jenis yang memang tanpa gambar | 36 sisa: 28 "ShopeePay Payment" 1–12 Sep (screenshot baru ada sejak 13 Sep; 8 dari 36 baris periode itu sudah dilengkapi struk), 4 checkout Shopee, 1 tagihan internet, 3 transfer (masuk dari orang, keluar ke orang, masuk dari rekening sendiri). Semua sesuai survei, kecuali 1 baris yang seharusnya dilengkapi struk T1 | ✓ (−T1, sudah diperbaiki) |
| Gambar yang sama → sudah dipakai, tanpa AI | Ya | ✓ |

## Dibanding harapan survei

| | Harapan | Hasil |
|---|---|---|
| Screenshot berdana SeaBank | hampir semua melengkapi | 33/33 |
| Screenshot Saldo ShopeePay | transaksi baru | 3/3 baru di kantong ShopeePay |
| Screenshot SPayLater | cicilan | tidak ada di periode ini |
| Struk QRIS ShopeePay | semua melengkapi (sebagian +1 hari bila ≥ 22.00) | 13/14 (gagal: yang ≥ 22.00 — T1, sudah diperbaiki: 14/14 sesudah perbaikan) |

## Temuan

**T1 — Struk ≥ 22.00 dicocokkan ke arah tanggal yang salah (kode) — diperbaiki.** Struk QRIS bertanggal D jam 22.00 (dibaca AI dengan benar: tanggal, jam, nominal, "CPM QRIS SHOPEEPAY") tidak menemukan baris rekening koran yang bertanggal **D − 1** (satu-satunya baris bernominal itu, tanpa screenshot karena di luar rentang screenshot). Akibatnya dicatat baru di kantong ShopeePay → belanja terhitung dua kali dan baris SeaBank tetap Perlu dilengkapi. Penyebab: `src/lib/lengkapi.ts:157` menambahkan tanggal struk **+1 hari** sebagai kandidat (`geserHari(b.tanggal, 1)`), padahal survei ("2 bertanggal +1 hari: belanja ≥ 22.00, tanggal bisnis kasir") dan data ini menunjukkan **struk yang +1 hari dibanding rekening koran**, jadi kandidatnya tanggal struk **−1 hari**. Uji unit `scripts/uji-lengkapi.mts:100-104` mengunci arah yang sama, jadi tidak menangkapnya. Bukan kesalahan baca AI; bukan alasan data.

*Diperbaiki (7 Nov 2026, rilis 2.12.0), terverifikasi ulang dengan data asli.* Dua tempat: `cariPasangan` memakai tanggal struk −1 hari (`src/lib/lengkapi.ts`), dan kueri kandidat di server mengambil tanggal struk −1 hari sampai tanggal struk (`src/lib/lengkapi-server.ts`; percobaan pertama yang hanya mengubah `cariPasangan` masih gagal karena kueri ini hanya mengambil tanggal struk sampai +1 hari, sehingga baris D − 1 tidak pernah sampai ke pencocokan). Verifikasi ulang: akun uji baru, rekening koran SeaBank September diimpor (79 transaksi, 77 Perlu dilengkapi, saldo = saldo akhir), lalu hanya struk T1 lewat Catat (1 panggilan AI; screenshot pembelian yang sama tidak ada karena di luar rentang screenshot). Hasil: kartu "Lengkapi transaksi ini?" untuk baris SeaBank **sehari sebelum** tanggal struk (merchant toko, jam, Belanja harian, rincian barang, nomor bon, tawaran pecah; "Nominal, tanggal, dan kantongnya tetap") → Lengkapi: **1 dilengkapi, 0 transaksi baru, Perlu dilengkapi 77 → 76**, nominal/tanggal/kantong transaksi mana pun tidak berubah, saldo SeaBank tetap = saldo akhir rekening koran. Regresi ditambahkan ke E2E `lengkapi` (§6: baris rekening 12 Sep + hasil AI struk 13 Sep 22.05 disuntik → kartu Lengkapi untuk baris 12 Sep, dilengkapi, tidak ada transaksi baru); E2E `lengkapi` dan `impor-rekening` lulus semua.

**T2 — Isi saldo ShopeePay dari rekening bank lain → "perlu dicek" (data, sesuai rancangan).** Screenshot top up dengan sumber dana bank yang tidak punya kantong di akun uji jadi draft pindah kantong tanpa kantong asal. Wajar; di akun asli yang punya kantong bank itu akan jadi pindah kantong.

**T3 — Struk dibayar kartu debit bank lain → "perlu dicek" (data, sesuai rancangan).** Sumber dana kartu bank yang tidak ada kantongnya: tidak ada pasangan, draft menanyakan kantong. Tidak ada baris SeaBank yang cocok, jadi benar tidak dilengkapi.

**T4 — Saldo kantong ShopeePay negatif (data uji).** Kantong ShopeePay dibuat bersaldo 0 sejak 1 Sep tanpa top up tercatat, jadi 3 belanja Saldo ShopeePay (dan transaksi T1) membuatnya minus. Bukan galat aplikasi.

**T5 — Kategori AI (minor).** 3 dari 46 isian kategori kurang tepat (pangkas rambut → belanja, fotokopi → pendidikan, minimarket → makan). Tidak menyentuh uang.

## AI

53 panggilan `/api/upload-receipt` (37 + 15 + 1 ulang tanpa AI): 52 dibaca Gemini, **0 gagal, 0 "Lagi sibuk"/429**, tidak ada yang perlu dicoba ulang; tidak ada pasangan ragu (tidak ada pengiriman ulang dengan peringkat). Semua nominal "Kamu Membayar", tanggal, jam, sumber dana (SeaBank 33, Saldo ShopeePay 3, bank lain 1) dan e-wallet terbaca benar pada sampel yang dicek; satu struk dengan voucher terbaca voucher-nya dan nominal net cocok dengan baris bank.

## Catatan teknis UAT

- Satu gambar lewat galeri Catat dilampirkan ke obrolan (bukan antrean, sesuai keputusan 15 SPEC-impor-rekening), jadi uji 3b memakai tombol Kirim.
- Dev server dihentikan dan akun uji dihapus sesudah uji; tidak ada kode aplikasi yang diubah.
