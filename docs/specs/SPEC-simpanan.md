# Spec: Simpanan (deposito & pocket) dan tujuan yang disimpan di kantong lain

Status: **disetujui** (implementasi menunggu aba-aba user) · 6 November 2026 · branch `feat/simpanan` (stacked di atas `fix/temuan-2.9.0`) · rencana rilis 2.11.0

Menuntaskan rencana di CHANGELOG: *Opsi "tujuan ini disimpan di BCA", kalau saldo BCA yang lebih kecil dari saldo asli di bank terasa membingungkan.*

## Masalah

- **Deposito di dalam rekening.** Di SeaBank ada deposito Rp 2 jt dan saldo rekening Rp 500 rb; aplikasi SeaBank menampilkan total **Rp 2,5 jt**. Money Tracker belum punya tempat untuk deposito: kalau dicatat sebagai kantong terpisah, saldo SeaBank di aplikasi tidak sama dengan di bank; kalau digabung, bunga, jatuh tempo, dan uang yang terkunci tidak terlihat.
- **Tujuan di rekening yang sama.** Dana darurat Rp 3 jt yang uangnya tetap di saldo BCA membuat BCA tampil Rp 7 jt, padahal di m-banking Rp 10 jt (SPEC-tujuan-tabungan, keputusan "tabungan di rekening yang sama diterima untuk versi ini").

## Keputusan user (6 Nov 2026)

| | Keputusan |
|---|---|
| Konsep | **Jenis kantong baru "Simpanan"**, selalu berada di dalam kantong lain (induk), terpisah dari tujuan tabungan. |
| Macam simpanan | **Tabungan/pocket** (berperilaku seperti kantong biasa) dan **deposito** (terkunci: harus dicairkan dulu sebelum bisa dipakai bayar). |
| Saldo awal | Bila uangnya **sudah termasuk** di saldo induk, dicatat sebagai pindah kantong induk → simpanan; saldo gabungan tetap. |
| Tampilan | Baris induk menampilkan **saldo gabungan + rincian** ("Rp 500.000 + Deposito Rp 2.000.000"), sama dengan aplikasi bank. |
| Keluar dari simpanan | Uang simpanan **selalu kembali ke induk dulu** (cair, hapus). Tidak ada "hapus saja". |
| Perpanjangan deposito | Tiga pilihan: **sekali saja**; **diperpanjang tanpa bunga** (pokok diperpanjang, bunga cair ke induk); **diperpanjang dengan bunga** (pokok + bunga diperpanjang). |
| Tenor deposito | **Angka + satuan hari atau bulan**, minimal 1 hari. Hari untuk program seperti deposito *flash sale* 14 hari; bulan untuk deposito biasa (jatuh tempo di tanggal yang sama, mengikuti kalender). Revisi 6 Nov: semula bulan saja. |
| Bunga & pajak | Aplikasi menghitung **bunga kotor, pajak, bunga bersih**. Pajak bawaan **PPh final 20%**, **0%** bila pokok ≤ Rp 7.500.000; bisa diubah per deposito. |
| Jatuh tempo | **Menunggu evaluasi user**: push + kartu berisi estimasi; user ketuk "Sesuai" atau isi bunga bersih yang benar-benar diterima, baru dicatat. Selisih dengan estimasi ditampilkan. |
| Tujuan tabungan | Boleh **"Disimpan di"** kantong lain (opsional); tampil gabungan seperti simpanan. Tujuan tetap punya target & progres. |
| Bunga pocket | **Belum** (bunga tabungan/pocket tetap dicatat manual sebagai pemasukan). |

## Rancangan

### 1. Data

- **`user_accounts.kind`** bertambah `simpanan`.
- **`user_accounts.induk_id`** (uuid, FK ke `user_accounts`, `on delete restrict`): **wajib** untuk `simpanan`, **opsional** untuk `tujuan`, selain itu null. Induk harus kantong uang milik user yang sama berjenis `bank`, `ewallet`, atau `cash` (dicek database). Induk tidak bisa dihapus selama masih punya simpanan; tujuan yang disimpan di sana dilepas dulu (lihat §6).
- **`user_accounts.macam_simpanan`**: `tabungan` / `deposito`, wajib untuk `simpanan`.
- **Tabel `deposito`** (satu baris per kantong simpanan berjenis deposito): `kantong_id` (PK, FK), `bunga_persen` (per tahun, > 0, ≤ 25), `tenor` (int ≥ 1), `satuan_tenor` (`hari` / `bulan`), `pajak_persen` (0–100), `perpanjangan` (`sekali` / `pokok` / `pokok_bunga`), `selesai` (bool).
- **Tabel `deposito_periode`**: `id`, `deposito_id`, `ke` (1, 2, …), `mulai`, `jatuh_tempo`, `pokok`, estimasi `bunga_kotor`, `pajak`, `bunga_bersih`, lalu dari evaluasi: `bunga_diterima` (null = belum dievaluasi), `dievaluasi_pada`, `dicairkan_awal` (bool).
- RLS & grant kolom mengikuti pola tabel milik user lainnya (`uji:isolasi` diperluas).

### 2. Perhitungan deposito (`src/lib/simpanan.ts`, fungsi murni)

- **Jatuh tempo**:
  - satuan **hari** → mulai + tenor hari (deposito 14 hari mulai 6 Nov → 20 Nov);
  - satuan **bulan** → mulai + tenor bulan, tanggal yang sama; bulan yang lebih pendek mundur ke hari terakhirnya (aturan yang sama dengan jatuh tempo cicilan). Perpanjangan dihitung dari tanggal mulai periode itu, jadi tetap di tanggal kalender yang sama.
- **Bunga kotor** = pokok × bunga % ÷ 100 × jumlah hari sebenarnya (mulai → jatuh tempo, untuk kedua satuan) ÷ 365, dibulatkan ke rupiah.
- **Pajak** = bunga kotor × pajak % (bawaan 20%, 0% bila pokok ≤ Rp 7.500.000; isian bisa diubah), dibulatkan.
- **Bunga bersih** = bunga kotor − pajak.
- Bank bisa menghitung sedikit berbeda (pembulatan, basis hari); itulah gunanya evaluasi jatuh tempo.

### 3. Membuat simpanan (Profil → Kantong → Tambah)

- Jenis kantong bertambah **Simpanan**. Isian: nama, **di dalam** (induk: bank/e-wallet/tunai), macam (**Tabungan/pocket** / **Deposito**), saldo/pokok.
- **"Sudah termasuk di saldo SeaBank?"** (bawaan: ya):
  - **ya** → simpanan dibuat dengan saldo 0, lalu tercatat pindah kantong **induk → simpanan** sebesar saldonya, bertanggal sekarang (supaya selalu sesudah tanggal saldo induk). Saldo gabungan induk tetap.
  - **tidak** → saldo awal simpanan seperti kantong baru (uang baru, gabungan naik).
- **Deposito** menambah isian: bunga % per tahun, tenor (chip **14 hari · 1 bln · 3 bln · 6 bln · 12 bln**, atau isian angka + pilihan hari/bulan; minimal 1 hari), tanggal mulai (bawaan hari ini), perpanjangan (3 pilihan), pajak % (bawaan sesuai §2). Pratinjau langsung, mis. Rp 2 jt, 4,5%/th, 1 bulan dari 6 Nov: "Jatuh tempo 6 Des 2026 (30 hari) · bunga ± Rp 7.397 · pajak Rp 0 · bersih Rp 7.397".
- Periode ke-1 dibuat dengan pokok = saldo deposito.

### 4. Tampilan

- **Profil → Kantong** dan **Total aset di Beranda**: baris induk menampilkan **saldo gabungan** (saldonya sendiri + semua simpanan + tujuan yang disimpan di sana), dengan rincian di bawahnya: "Rp 500.000 + Deposito Rp 2.000.000" (lebih dari dua: "Rp 500.000 + 3 simpanan Rp …"). Simpanan tampil menjorok di bawah induknya di Profil → Kantong ("Deposito · 4,5%/th · jatuh tempo 6 Des"); di Beranda tidak dipisah.
- **Total aset** tidak berubah: tiap kantong tetap dihitung sekali.
- **Pilihan kantong** (Catat, form manual, form pinjaman): tabungan/pocket tampil sebagai "Pocket Liburan · di SeaBank"; **deposito tidak tampil** sebagai sumber bayar, tempat pemasukan, maupun tujuan pindah kantong (hanya lewat aksinya sendiri, §5).
- **Tujuan tabungan** yang disimpan di kantong lain menulis "di BCA" di halaman Tujuan.

### 5. Deposito: cair, jatuh tempo, evaluasi

- **Jatuh tempo** (periode yang `jatuh_tempo` ≤ hari ini dan belum dievaluasi):
  - push **hanya di hari itu** (cron notifikasi harian, tanpa H-3): "Deposito SeaBank jatuh tempo hari ini. Cek bunganya.";
  - kartu di Beranda **"Deposito jatuh tempo"**: estimasi bunga kotor, pajak, bersih, dan tombol **Sesuai** / **Isi yang diterima** (nominal bunga bersih). Kartu bertahan sampai dievaluasi. Selama itu deposito **tetap tampil** dengan saldonya ("Jatuh tempo 6 Des · menunggu cek bunga"); tidak ada yang dicatat atau disembunyikan sebelum user mengecek bunganya.
- **Saat dievaluasi** dengan bunga bersih diterima B:
  - **sekali saja** → pemasukan B ke **induk** (kategori Bunga/Investasi, merchant = nama deposito, keterangan "Bunga deposito ke-n · kotor Rp X, pajak Rp Y"), lalu pindah kantong deposito → induk sebesar pokok. Deposito `selesai`, saldo 0, dan **langsung hilang** dari Profil → Kantong, Beranda, dan pilihan kantong. Datanya tidak dihapus: transaksi bunga & pencairannya tetap menyebut namanya, dan riwayat periodenya tetap tersimpan.
  - **diperpanjang tanpa bunga** → pemasukan B ke induk; periode baru dengan pokok yang sama, mulai = jatuh tempo lama.
  - **diperpanjang dengan bunga** → pemasukan B ke **deposito** itu sendiri; periode baru dengan pokok + B.
  - Hasilnya menampilkan selisih: "Bank memberi Rp 7.350, beda −Rp 47 dari perhitungan." Riwayat periode bisa dilihat di detail deposito.
- **Cairkan sekarang** (sebelum jatuh tempo, atau mengakhiri deposito yang diperpanjang): isian bunga yang diterima (bawaan Rp 0, karena pencairan awal biasanya tanpa bunga) → pemasukan bila > 0, pindah kantong deposito → induk sebesar saldonya, deposito `selesai` (hilang dari daftar seperti di atas).
- Bunga deposito **bukan penghasilan** untuk metode budgeting (kategori Bunga/Investasi, sesuai SPEC-tujuan-tabungan).

### 6. Hapus

- **Simpanan bersaldo**: konfirmasi "Rp X kembali ke SeaBank, lalu simpanan ini dihapus." → pindah kantong simpanan → induk, lalu dihapus. Deposito yang belum jatuh tempo: sama dengan **Cairkan sekarang** lalu hapus.
- **Induk** yang masih punya simpanan: ditolak, "SeaBank masih berisi 1 simpanan. Cairkan atau hapus simpanannya dulu."; tujuan yang disimpan di sana dilepas otomatis (jadi terpisah), disebut di konfirmasi.

### 7. Tujuan tabungan "Disimpan di"

- Form tujuan (baru & ubah) mendapat **"Disimpan di"**: *Terpisah* (bawaan, seperti sekarang) atau salah satu kantong uang (bank/e-wallet/tunai). Mengubahnya **tidak memindahkan uang**; hanya cara tampil.
- Saldo tujuan masuk ke gabungan induknya (§4). Sisihkan dari BCA ke tujuan yang disimpan di BCA tidak mengubah gabungan BCA (memang uangnya tidak ke mana-mana).
- Perilaku lain tujuan (target, progres, "Dibayar dari tujuan", tidak jadi sumber uang) tetap.

### 8. Lainnya

- **AI Catat** (SPEC-ai-kantong): nama pocket ikut dikirim seperti kantong lain; deposito tidak ("pakai deposito" → ditanya kantongnya).
- **Tanya AI** `saldo_kantong`: kantong menyebut simpanan & tujuan di dalamnya, dan deposito membawa bunga, jatuh tempo, estimasi bunga bersih.
- **Ekspor CSV**: tidak berubah (simpanan = kantong).

## Pengujian

- **Unit** (`uji:simpanan` baru): jatuh tempo satuan hari (14 hari) dan bulan (akhir bulan, perpanjangan tetap di tanggal kalender), bunga kotor/pajak/bersih (pokok ≤ dan > Rp 7,5 jt), tiga jenis perpanjangan (pokok periode berikutnya, ke mana bunga masuk), saldo gabungan & rincian, pilihan kantong (deposito tidak tampil).
- **E2E** (`simpanan` baru): buat deposito "sudah termasuk" → SeaBank tampil gabungan sama; jatuh tempo (periode disuntik bertanggal lampau) → kartu evaluasi → Sesuai / isi lain untuk ketiga perpanjangan; cairkan awal; hapus simpanan bersaldo (kembali ke induk); tujuan disimpan di BCA → gabungan; induk dengan simpanan tidak bisa dihapus.
- `uji:isolasi` diperluas ke tabel baru; semua suite lama tetap lulus.

## Keputusan tambahan (6 Nov 2026)

1. Deposito yang sudah cair (sekali saja, atau dicairkan) **hilang otomatis** dari daftar, **sesudah** bunga bersihnya dicek user (evaluasi jatuh tempo, atau isian bunga saat Cairkan sekarang); datanya tetap tersimpan untuk riwayat.
2. Push jatuh tempo **hanya di hari itu**.

## Belum diterapkan

Seluruh spec ini (implementasi menunggu aba-aba user).
