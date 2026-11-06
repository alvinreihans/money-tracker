# UAT: Simpanan (deposito & pocket) dan tujuan "disimpan di"

Uji penerimaan untuk [SPEC-simpanan](../specs/SPEC-simpanan.md), branch `feat/simpanan` (stacked di atas `fix/temuan-2.9.0`). Tiap skenario adalah perjalanan pengguna yang utuh, dijalankan lewat tampilan aplikasi di akun baru yang bersih.

- **Data awal tiap skenario:** akun baru dengan Tunai (bawaan), SeaBank (bank, Rp 2.500.000), BCA (bank, Rp 10.000.000), ShopeePay (e-wallet, Rp 500.000).
- **Waktu dipercepat:** jatuh tempo tidak ditunggu. Untuk melihatnya, tanggal mulai & jatuh tempo periode deposito digeser ke lampau lewat database (satu-satunya langkah di luar tampilan), lalu aplikasi dibuka ulang.
- **Lebar layar:** HP 390 px.
- **Lulus** bila semua "Diharapkan" terpenuhi dan tidak ada galat di layar maupun console.

## UAT-S1 · Deposito yang sudah ada di dalam SeaBank
1. Profil → Kantong → tambah **Simpanan**: nama "Deposito", di dalam SeaBank, macam Deposito, pokok Rp 2.000.000, bunga 4,5%/th, tenor 1 bulan, mulai hari ini, perpanjangan "sekali saja", **sudah termasuk di saldo SeaBank: ya**.
2. Lihat pratinjau sebelum menyimpan.
3. Simpan, lihat Profil → Kantong dan Beranda.

**Diharapkan:** pratinjau menunjukkan jatuh tempo 1 bulan lagi (tanggal yang sama), bunga kotor = pokok × 4,5% × hari ÷ 365 (mis. 30 hari ≈ Rp 7.397), pajak Rp 0 (pokok ≤ Rp 7,5 jt). Baris SeaBank **Rp 2.500.000** dengan rincian "Rp 500.000 + Deposito Rp 2.000.000"; deposito tampil menjorok di bawahnya. Total aset Beranda tidak berubah (Rp 13.000.000).

## UAT-S2 · Deposito flash sale 14 hari sampai cair
1. Tambah simpanan "Flash Sale" di BCA, deposito Rp 5.000.000, bunga 7%/th, tenor **14 hari**, sekali saja, **belum termasuk** (uang baru).
2. (Waktu dipercepat) geser periodenya sehingga jatuh tempo hari ini.
3. Buka Beranda: kartu "Deposito jatuh tempo".
4. Ketuk **Isi yang diterima**, isi Rp 13.400.
5. Lihat Profil → Kantong dan Riwayat.

**Diharapkan:** setelah langkah 1 total aset naik Rp 5.000.000; jatuh tempo = mulai + 14 hari. Kartu menunjukkan estimasi bunga kotor Rp 13.425 (5 jt × 7% × 14 ÷ 365), pajak Rp 0, bersih Rp 13.425. Setelah diisi: pesan selisih "beda −Rp 25"; BCA bertambah Rp 5.013.400 (pokok kembali + bunga); deposito **hilang** dari daftar; Riwayat berisi pemasukan bunga Rp 13.400 (Bunga/Investasi) dan pindah kantong Flash Sale → BCA Rp 5.000.000. Sebelum langkah 4, deposito masih tampil dengan "menunggu cek bunga".

## UAT-S3 · Deposito bulanan diperpanjang dengan bunga
1. Tambah simpanan "Deposito Bulanan" di BCA, Rp 8.000.000 (sudah termasuk di saldo BCA), bunga 6%/th, tenor 1 bulan, perpanjangan **diperpanjang dengan bunga**.
2. (Waktu dipercepat) jatuh tempo hari ini → Beranda → **Sesuai**.
3. Buka detail deposito.

**Diharapkan:** pajak bawaan 20% (pokok > Rp 7,5 jt). Setelah Sesuai, saldo deposito = Rp 8.000.000 + bunga bersih, deposito tetap tampil dengan periode ke-2 berpokok baru dan jatuh tempo bulan berikutnya di tanggal yang sama; riwayat periode menunjukkan periode ke-1 sudah dicek. Gabungan BCA = saldo BCA + deposito.

## UAT-S4 · Pocket sebagai sumber bayar
1. Tambah simpanan "Liburan" di SeaBank, macam **Tabungan/pocket**, Rp 1.000.000, sudah termasuk.
2. Catat: `bayar hotel 300rb pakai liburan` (bila ditanya kantong, pilih Liburan).
3. Buka form manual: lihat pilihan "Bayar pakai".

**Diharapkan:** transaksi tercatat dari pocket Liburan; pilihan kantong menampilkan "Liburan · di SeaBank" dan **tidak** menampilkan deposito mana pun; gabungan SeaBank turun Rp 300.000 (Rp 2.200.000), rincian "… + Liburan Rp 700.000".

## UAT-S5 · Dana darurat yang uangnya tetap di BCA
1. Tujuan tabungan baru "Dana darurat", target Rp 10.000.000, **Disimpan di: BCA**.
2. Sisihkan Rp 3.000.000 dari BCA.
3. Lihat Profil → Kantong, Beranda, dan halaman Tujuan.

**Diharapkan:** baris BCA tetap **Rp 10.000.000** dengan rincian "Rp 7.000.000 + Dana darurat Rp 3.000.000"; total aset tidak berubah; halaman Tujuan menulis "di BCA" dan progres 30%.

## UAT-S6 · Cairkan lebih awal & hapus
1. Buat deposito "Cair Awal" di SeaBank Rp 1.000.000 (sudah termasuk), 3 bulan.
2. Detail deposito → **Cairkan sekarang**, bunga Rp 0.
3. Buat pocket "Sementara" di SeaBank Rp 200.000 (sudah termasuk), lalu hapus pocket itu.
4. Coba hapus kantong SeaBank selagi masih berisi simpanan (buat pocket lain bila perlu).

**Diharapkan:** setelah cair, Rp 1.000.000 kembali ke SeaBank (gabungan tetap), deposito hilang. Hapus pocket: konfirmasi "Rp 200.000 kembali ke SeaBank…", saldonya kembali ke SeaBank. Hapus SeaBank ditolak dengan pesan bahwa SeaBank masih berisi simpanan.

## UAT-S7 · Bertanya ke Tanya AI
1. Dengan data seperti UAT-S1, tanya: "berapa saldo seabank?"
2. Tanya: "kapan deposito saya jatuh tempo?"

**Diharapkan:** jawaban 1 menyebut Rp 2.500.000 (boleh beserta rinciannya); jawaban 2 menyebut tanggal jatuh tempo deposito yang benar.

## Hasil

Dijalankan 6 Nov 2026 lewat browser otomatis (Edge headless, `e2e/kepala.mjs`) di dev server lokal, branch `feat/simpanan`, dengan AI sungguhan dan akun uji baru per skenario (semua dihapus sesudahnya). Tidak ada galat di layar maupun console.

| Skenario | Hasil | Bukti utama |
|---|---|---|
| UAT-S1 | **Lulus** | Pratinjau "Jatuh tempo 6 Des 2026 (30 hari) · bunga ± Rp 7.397 · pajak Rp 0"; SeaBank "Rp 500.000 + Deposito Rp 2.000.000 · Rp 2.500.000"; total aset tetap Rp 13.000.000. |
| UAT-S2 | **Lulus** | 14 hari → jatuh tempo 20 Nov; total aset naik ke Rp 18.000.000; "menunggu cek bunga" sebelum dicek; isi Rp 13.400 → "beda −Rp 25 dari perhitungan"; BCA +Rp 5.013.400; deposito hilang; Riwayat berisi bunga & pencairan. |
| UAT-S3 | **Lulus** | Pajak bawaan 20%; Sesuai → "Bunganya ditambahkan ke pokok: Rp 8.031.562 sampai 6 Des 2026"; periode ke-2 dihitung ulang (bunga Rp 39.608, pajak Rp 7.922). |
| UAT-S4 | **Lulus** | "bayar hotel 300rb pakai liburan" langsung dari pocket; pilihan "Liburan · di SeaBank", tanpa deposito; SeaBank "Rp 1.500.000 + Liburan Rp 700.000 · Rp 2.200.000". |
| UAT-S5 | **Lulus** | BCA "Rp 7.000.000 + Dana darurat Rp 3.000.000 · Rp 10.000.000"; total aset tetap; Tujuan "di BCA", progres 30%. |
| UAT-S6 | **Lulus** | Cairkan sekarang → Rp 1.000.000 kembali ke SeaBank, deposito hilang; hapus pocket mengembalikan Rp 200.000; hapus SeaBank ditolak "SeaBank masih berisi 1 simpanan…". |
| UAT-S7 | **Lulus** (dengan catatan) | Menyebut Rp 2.500.000 dan tanggal jatuh tempo yang benar. |

### Temuan di luar "Diharapkan"

1. Tanya AI "berapa saldo seabank?" menyebut **Rp 500.000** lebih dulu (saldo SeaBank sendiri), baru gabungannya Rp 2.500.000 — padahal aplikasi & m-banking menampilkan Rp 2.500.000. `saldo_kantong` memberi `saldo` sebagai angka utama dan gabungan sebagai `saldo_gabungan`.
2. Tanya AI menulis tanggal jatuh tempo "06-12-2026", bukan "6 Desember 2026".
3. Profil → Kantong menampilkan "Disisihkan ke tujuan · 1 tujuan tabungan · Rp 0" ketika satu-satunya tujuan disimpan di BCA (keputusan implementasi #4), bisa membingungkan.
4. Di 390 px, pesan "SeaBank masih berisi 1 simpanan…" tertutup sebagian oleh bilah Batal/Simpan sampai digulir.
5. Tombol "Cairkan sekarang" di detail deposito memperlihatkan garis fokus biru saat lembar dibuka (kosmetik).
