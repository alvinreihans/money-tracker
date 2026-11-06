# Spec: Strategi pelunasan utang — Snowball / Avalanche

Status: **diterapkan** · rilis 2.8.0 (31 Oktober 2026) · modul `pelunasan` (PETA-fase4) · disinkronkan dengan kode 1 Nov 2026

## Tujuan

Utang & Piutang sudah menampilkan semua utang. Yang belum ada: **mana yang dilunasi duluan**, dan ke mana uang ekstra sebaiknya pergi.

Strategi ini berjalan berdampingan dengan metode budget apa pun. Ia bukan pengganti metode.

## Rancangan

### Daftar utang

`daftarUtang()` di `src/lib/pinjaman.ts`:

| Sumber | Jumlah | Jenis |
|---|---|---|
| Orang bersaldo negatif | −saldo | `orang` ("Pinjaman") |
| Kartu kredit bertagihan | −saldo (`ringkasanPinjaman().borrow`) | `kredit` ("Kartu kredit") |
| Cicilan/paylater yang belum lunas | sisa angsuran × nominal (`statusCicilan().sisaNominal`) | `cicilan` ("Cicilan") |

Orang bersaldo positif (piutang) tidak ikut.

### Urutan

`urutPelunasan(utang, strategi)`:

**Snowball:** saldo terkecil dulu, supaya cepat ada yang lunas dan semangat bertahan. Seri → bunga tertinggi. Alasan: yang pertama "sisa terkecil"; baris lain menampilkan bunganya bila ada.

**Avalanche:** bunga tertinggi dulu, supaya total bunga paling hemat.
- Seri, atau sama-sama tanpa bunga → saldo terkecil.
- Utang **tanpa bunga diisi** diurutkan sebagai 0% dan beralasan "bunga belum diisi" (warna peringatan). Alasan lain: "bunga 2,95%/bln".

### Bunga

**Kolom opsional `bunga_persen numeric(4,2)`**, persen per bulan, 0–10:
- di `user_accounts`, hanya untuk kantong orang & kartu kredit: `user_accounts_bunga_check check (bunga_persen is null or (bunga_persen between 0 and 10 and kind in ('orang','kredit')))`;
- di `cicilan`: `check (bunga_persen is null or bunga_persen between 0 and 10)`.

Kartu kredit dan paylater di Indonesia memang mengumumkan bunga per bulan (mis. 1,75%).

**Sebelum modul ini** tidak ada jalan mengisi bunga untuk yang sudah ada: jatuh tempo orang hanya lewat `FormPinjaman`; rencana cicilan hanya bisa dihapus; kartu kredit tidak punya form ubah; Profil → Kantong tidak menampilkan kantong orang/kartu. Rencana cicilan dibuat lewat **Cicilan baru** (`FormRencana`) **atau** otomatis dari belanja paylater (`jadikanCicilan` di `simpan-transaksi.ts`).

**Bunga diisi lewat:**
- isian "Bunga per bulan (%)" di **Tambah kartu kredit** (`FormKartu`, PinjamanView; keterangan "Opsional, mis. 1,75. Dipakai untuk urutan Avalanche.") dan **Cicilan baru** (`FormRencana`, BagianCicilan; "Opsional, untuk urutan Avalanche. Kosongkan kalau sudah termasuk di nominal.");
- aksi **Atur bunga** (`AturBunga`, BagianStrategi) di lembar aksi orang yang kuutangi (saldo < 0), kartu kredit (selalu), dan rencana cicilan yang belum lunas; juga dengan mengetuk baris mana pun di daftar Strategi pelunasan. Lembar "Bunga {nama}" dengan subjudul "Opsional. Dipakai untuk urutan Avalanche. Cicilan yang bunganya sudah termasuk di nominal boleh dikosongkan." dan satu isian ("Mis. 1,75 untuk kartu kredit. Kosongkan kalau tanpa bunga."); mengosongkannya menghapus bunga. Snackbar "Bunga disimpan" / "Bunga dihapus". Inilah satu-satunya jalan untuk:
  - orang yang dibuat lewat `FormPinjaman` (catatan pinjam/bayar per transaksi, **tidak** diubah);
  - kartu dan cicilan yang sudah ada;
  - cicilan dari paylater.

**Isian** (`bacaBunga`): kosong = tanpa bunga; 0–10, maks dua desimal, koma boleh. Salah → "Bunga per bulan 0–10%, mis. 1,75."

**Tipe TS:** `bunga_persen` ada di `Kantong` (`src/lib/kantong.ts`) dan `Cicilan` (`src/lib/pinjaman.ts`).

**Hak kolom:**
- `user_accounts` memakai grant per kolom, jadi migrasi memberi `grant select (bunga_persen), insert (bunga_persen), update (bunga_persen)`;
- `cicilan` memakai grant tabel penuh.

### Pengaturan

**Kolom di `metode_budget`:**
- `strategi_utang text check (strategi_utang in ('snowball','avalanche'))`, null = belum memilih / dimatikan;
- `ekstra_utang numeric(14,2) check (ekstra_utang > 0)`, opsional.

Barisnya sudah per user. `metode` mendapat default `'kategori'`, supaya halaman Utang & Piutang bisa menyimpan (upsert `user_id` + kolom strategi + `updated_at`) tanpa menyentuh metode budget. Upsert dari BudgetView tidak menyentuh kolom ini.

### Tampilan (halaman Utang & Piutang)

**Data:**
- `pinjaman/page.tsx` membaca `metode_budget` (`select strategi_utang, ekstra_utang`);
- `PinjamanView` mendapat prop `strategi` dan `ekstra`, lalu menyusun `daftarUtang` untuk `BagianStrategi`.

**Bagian "Strategi pelunasan"** (sesudah bagian Cicilan, sebelum "Sudah lunas"), hanya bila ada ≥ 2 utang:
- **Belum memilih:** "Mau lunas lebih cepat? Pilih urutan melunasinya:", dua baris — **Snowball** ("Yang terkecil dulu, supaya cepat ada yang lunas.") dan **Avalanche** ("Bunga tertinggi dulu, supaya total bunganya paling hemat.") — dan **Nanti saja**, yang menyembunyikannya di perangkat itu (localStorage `strategi-utang-nanti`). Memilih → snackbar "Memakai strategi …".
- **Sudah memilih** (judul "Strategi pelunasan · Snowball"):
  - pembuka: keterangan strateginya + "Bayar minimum untuk yang lain, lebihnya ke urutan pertama.";
  - daftar utang bernomor sesuai urutan; yang pertama bertanda **Fokus**;
  - tiap baris: nama, jenis · alasan/bunga, jumlah; ketuk → Atur bunga;
  - **Uang ekstra per bulan** (opsional): "Rp 500.000 ekstra → ke Shopee PayLater", atau "Opsional: berapa yang bisa ditambahkan tiap bulan". Ketuk → lembar isian rupiah ("Ditambahkan ke … tiap bulan, di luar pembayaran minimum."); kosong = hapus;
  - tombol **Ganti ke Avalanche/Snowball** dan **Matikan** di bawah bagian itu.

**Melunasi** tetap lewat aksi bayar yang sudah ada: bayar utang orang/kartu, bayar cicilan (termasuk "Lunasi n cicilan sisa"). Tidak ada alur bayar baru.

**Tanya AI:**
- Data utang ada di fungsi `pinjaman_cicilan` (`tanya-server.ts`), **bukan** di ringkasan bulan. Menaruhnya di ringkasan berarti menambah query kantong & cicilan ke setiap pertanyaan.
- `pinjaman_cicilan` mengembalikan `strategi_pelunasan` (null = belum memilih), `uang_ekstra_per_bulan`, dan `urutan_pelunasan` = `{ snowball, avalanche }` — keduanya hasil `urutPelunasan` (nama, jenis, jumlah, `bunga_persen_per_bulan`, alasan).
- `bunga_persen_per_bulan` juga ada di tiap utang (`pengguna_berutang`) dan cicilan.
- Deskripsi fungsinya di `tanya.ts` menyebut strategi pelunasan ("utang mana yang dilunasi dulu"), supaya model memanggilnya.
- Aturan prompt:
  - jawab sesuai strategi pilihan dari urutannya (yang pertama = fokus; uang ekstra ke sana);
  - kalau belum memilih, jelaskan keduanya singkat dengan urutan masing-masing dari datanya.

**Tanpa proyeksi tanggal bebas utang** (keputusan peta): butuh cicilan minimum per utang, yang tidak kita punya.

### Kode

- Fungsi murni `urutPelunasan(utang, strategi)` di `src/lib/pinjaman.ts`. Masukannya daftar `Utang` `{id, nama, jenis, jumlah, bunga}`; keluarannya urutan beserta `alasan` (atau null).
- `daftarUtang(kantong, cicilan, dibayar, hariIni)` membangun daftar utang dari kantong bersaldo + cicilan + status bayarnya. Dipakai `PinjamanView` dan `pinjaman_cicilan`, supaya keduanya sama.
- `bacaBunga(teks)` untuk semua isian bunga.

### Data (migrasi)

`20261108000000_fase4.sql` (satu migrasi untuk empat modul fase 4), bagian 3–4: default `metode`, `strategi_utang`, `ekstra_utang`, `bunga_persen` di `user_accounts` & `cicilan`, grant kolom.

## Pengujian

**`uji:pinjaman`, `daftarUtang` / `urutPelunasan` / `bacaBunga`:**
- snowball terkecil dulu, seri → bunga;
- avalanche bunga dulu, tanpa bunga di belakang, seri → terkecil;
- cicilan memakai sisa nominal; cicilan lunas tidak ikut;
- orang bersaldo positif (piutang) tidak ikut;
- isian bunga (kosong, koma, titik, di luar batas).

**Dry-run migrasi:**
- `bunga_persen` di luar 0–10 ditolak;
- `bunga_persen` di kantong bank/tujuan ditolak;
- upsert `metode_budget` hanya dengan `strategi_utang` berhasil tanpa `metode`;
- user biasa bisa mengubah `bunga_persen` kantongnya sendiri (grant kolom).

**E2E** (`e2e/pelunasan.mjs`, suite `pelunasan` di `e2e/jalankan.mjs`, akun sementara):
- dengan 1 utang, bagian tidak tampil;
- dengan 3 utang, pilih Snowball → urutan benar, Fokus di yang terkecil, metode budget tetap `kategori`;
- isi bunga lewat Atur bunga (kartu dari lembar aksi, cicilan dari baris strategi), lalu ganti ke Avalanche → urutan berubah, yang tanpa bunga di belakang;
- isi uang ekstra → teks "ke …" benar;
- Cicilan baru dengan bunga 12% ditolak, 1,5% tersimpan;
- Matikan → tawaran muncul lagi → "Nanti saja" bertahan setelah dimuat ulang.

**`eval:tanya`, satu kasus:**
- Pertanyaan: "utang mana yang harus kulunasi dulu?"
- `siapkan` (lihat SPEC-metode-lanjutan):
  - dua kartu kredit dengan `saldo_awal` negatif dan bunga berbeda (Kartu BCA 1,75%, Kartu Mandiri 2,25%), plus satu `cicilan` berbunga (Laptop 2,95%) — tidak menyentuh kantong uang, jadi angka saldo dan aset kasus lain tetap;
  - `strategi_utang = 'avalanche'`.
- Harapan: menyebut utang berbunga tertinggi (Laptop).

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
