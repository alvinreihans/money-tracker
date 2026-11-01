# Spec: Strategi pelunasan utang — Snowball / Avalanche

Status: **disetujui** · 31 Oktober 2026, setelah cek silang dengan kode · modul `pelunasan` (PETA-fase4)

## Tujuan

Utang & Piutang sudah menampilkan semua utang. Yang belum ada: **mana yang dilunasi duluan**, dan ke mana uang ekstra sebaiknya pergi.

Strategi ini berjalan berdampingan dengan metode budget apa pun. Ia bukan pengganti metode.

## Rancangan

### Daftar utang

| Sumber | Jumlah |
|---|---|
| Orang bersaldo negatif | −saldo |
| Kartu kredit bertagihan | −saldo (`ringkasanPinjaman().borrow`) |
| Cicilan/paylater yang belum lunas | sisa angsuran × nominal (`statusCicilan().sisaNominal`) |

Orang bersaldo positif (piutang) tidak ikut.

### Urutan

**Snowball:** saldo terkecil dulu, supaya cepat ada yang lunas dan semangat bertahan. Seri → bunga tertinggi.

**Avalanche:** bunga tertinggi dulu, supaya total bunga paling hemat.
- Seri, atau sama-sama tanpa bunga → saldo terkecil.
- Utang **tanpa bunga diisi** diurutkan sebagai 0% dan ditandai "bunga belum diisi". Ketuk tandanya untuk membuka Atur bunga.

### Bunga

**Kolom opsional baru `bunga_persen numeric(4,2)`**, persen per bulan, 0–10:
- di `user_accounts`, hanya untuk kantong orang & kartu kredit: `check (bunga_persen is null or kind in ('orang','kredit'))`, seperti `user_accounts_jatuh_tempo_check`;
- di `cicilan`.

Kartu kredit dan paylater di Indonesia memang mengumumkan bunga per bulan (mis. 1,75%).

**Yang sekarang bisa diubah:**
- jatuh tempo pinjaman orang, lewat `FormPinjaman`;
- rencana cicilan, yang hanya bisa dihapus;
- kartu kredit, yang tidak punya form ubah;
- Profil → Kantong tidak menampilkan kantong orang/kartu.

Rencana cicilan dibuat lewat **Cicilan baru** (`FormRencana`) **atau** otomatis dari belanja paylater (`jadikanCicilan` di `simpan-transaksi.ts`).

**Bunga diisi lewat:**
- isian baru "Bunga per bulan (%)" di **Tambah kartu kredit** (`FormKartu`, PinjamanView) dan **Cicilan baru** (`FormRencana`, BagianCicilan);
- aksi baru **Atur bunga** di lembar aksi orang yang kuutangi, kartu kredit, dan rencana cicilan. Aksi ini membuka lembar kecil dengan satu isian; mengosongkannya menghapus bunga. Inilah satu-satunya jalan untuk:
  - orang yang dibuat lewat `FormPinjaman` (catatan pinjam/bayar per transaksi, **tidak** diubah);
  - kartu dan cicilan yang sudah ada;
  - cicilan dari paylater.

**Keterangan di isian:** "Opsional. Dipakai untuk urutan Avalanche. Cicilan yang bunganya sudah termasuk di nominal boleh dikosongkan." Isian nominal cicilan memang sudah menyebut nominalnya termasuk bunga dan biaya.

**Tipe TS:** `bunga_persen` ditambahkan ke `Kantong` (`src/lib/kantong.ts`) dan `Cicilan` (`src/lib/pinjaman.ts`).

**Hak kolom:**
- `user_accounts` memakai grant per kolom (lihat `target`, `tenggat` di 20261106000000), jadi migrasi memberi `grant insert (bunga_persen), update (bunga_persen)`;
- `cicilan` memakai grant tabel penuh.

### Pengaturan

**Kolom di `metode_budget`:**
- `strategi_utang text check (strategi_utang in ('snowball','avalanche'))`, null = belum memilih;
- `ekstra_utang numeric(14,2) check (ekstra_utang > 0)`, opsional.

Barisnya sudah per user. `metode` mendapat default `'kategori'`, supaya halaman Utang & Piutang bisa menyimpan (upsert hanya kolom strategi) tanpa menyentuh metode budget. Upsert dari BudgetView tidak menyentuh kolom ini.

### Tampilan (halaman Utang & Piutang)

**Data:**
- `pinjaman/page.tsx` sekarang tidak membaca `metode_budget`;
- ia ditambah `select strategi_utang, ekstra_utang`;
- `PinjamanView` mendapat prop `strategi` dan `ekstra`.

**Bagian baru "Strategi pelunasan"**, hanya bila ada ≥ 2 utang:
- **Belum memilih:** kartu singkat "Mau lunas lebih cepat? Pilih Snowball (yang kecil dulu) atau Avalanche (bunga tertinggi dulu)", dengan dua tombol dan "Nanti saja" yang menyembunyikannya di perangkat itu (localStorage).
- **Sudah memilih:**
  - daftar utang bernomor sesuai urutan;
  - yang pertama ditandai **Fokus**: "Bayar minimum untuk yang lain, lebihnya ke sini";
  - tiap baris menampilkan jumlah, bunga (bila ada), dan alasan urutannya ("terkecil" / "bunga 2,95%/bln");
  - **Uang ekstra per bulan** (opsional): "Rp 500.000 ekstra → ke Shopee PayLater";
  - ganti strategi atau matikan lewat menu bagian itu.

**Melunasi** tetap lewat aksi bayar yang sudah ada: bayar utang orang/kartu, bayar cicilan (termasuk "Lunasi n cicilan sisa"). Tidak ada alur bayar baru.

**Tanya AI:**
- Data utang ada di fungsi `pinjaman_cicilan` (`tanya-server.ts`), **bukan** di ringkasan bulan. Menaruhnya di ringkasan berarti menambah query kantong & cicilan ke setiap pertanyaan.
- `pinjaman_cicilan` ditambah `strategi_utang`, `ekstra_utang`, dan `urutan_pelunasan` (hasil `urutPelunasan`: nama, jenis, jumlah, bunga, alasan).
- `bunga_persen` ditambahkan ke tiap utang dan cicilan.
- Deskripsi fungsinya di `tanya.ts` menyebut strategi pelunasan, supaya model memanggilnya untuk "utang mana dulu?".
- Aturan prompt:
  - jawab sesuai strategi pilihan;
  - kalau belum memilih, jelaskan keduanya singkat dengan urutan masing-masing dari datanya.

**Tanpa proyeksi tanggal bebas utang** (keputusan peta): butuh cicilan minimum per utang, yang tidak kita punya.

### Kode

- Fungsi murni `urutPelunasan(utang, strategi)` di `src/lib/pinjaman.ts`. Masukannya daftar `{id, nama, jenis, jumlah, bunga}`; keluarannya urutan beserta alasan.
- Satu fungsi bantu membangun daftar utang dari kantong bersaldo + cicilan + status bayarnya. Dipakai `PinjamanView` dan `pinjaman_cicilan`, supaya keduanya sama.

## Pengujian

**`uji:pinjaman`, `urutPelunasan`:**
- snowball terkecil dulu, seri → bunga;
- avalanche bunga dulu, tanpa bunga di belakang, seri → terkecil;
- cicilan memakai sisa nominal;
- orang bersaldo positif (piutang) tidak ikut.

**Dry-run migrasi:**
- `bunga_persen` di luar 0–10 ditolak;
- `bunga_persen` di kantong bank/tujuan ditolak;
- upsert `metode_budget` hanya dengan `strategi_utang` berhasil tanpa `metode`;
- user biasa bisa mengubah `bunga_persen` kantongnya sendiri (grant kolom).

**E2E** (skrip ad-hoc di scratchpad sesi, suite baru `pelunasan`, akun sementara):
- dengan 3 utang, pilih Snowball → urutan benar dan Fokus di yang terkecil;
- isi bunga lewat Atur bunga (orang, kartu) dan saat membuat cicilan baru, lalu ganti ke Avalanche → urutan berubah;
- isi uang ekstra → teks "ke …" benar;
- dengan 1 utang, bagian tidak tampil.

**`eval:tanya`, satu kasus:**
- Pertanyaan: "utang mana yang harus kulunasi dulu?"
- `siapkan` (lihat SPEC-metode-lanjutan):
  - dua kartu kredit dengan `saldo_awal` negatif dan bunga berbeda, plus satu `cicilan` berbunga — tidak menyentuh kantong uang, jadi angka saldo dan aset kasus lain tetap;
  - `strategi_utang = 'avalanche'`.
- Harapan: menyebut utang berbunga tertinggi.

**Regresi:** semua `uji:*`, semua suite E2E, typecheck, `next build`.

## Boundaries

- **Jangan:**
  - proyeksi tanggal lunas atau simulasi bunga;
  - mengubah cara saldo utang dihitung;
  - alur bayar baru;
  - form ubah kartu/cicilan lengkap (hanya Atur bunga).
- **Tanya dulu:**
  - cicilan minimum per utang (yang dibutuhkan proyeksi);
  - pengingat bulanan "uang ekstra belum dibayar".
