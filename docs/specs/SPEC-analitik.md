# Spec: Analitik di Beranda + Pengaturan

Status: **diterapkan · rilis 2.0.0**, sebagian **digantikan** (lihat tabel di bawah) · disinkronkan dengan kode 1 Nov 2026. Branch awal: `feat/analitik`.

Yang masih berlaku dari spec ini: tabel `budgets`, kolom kantong di `user_accounts`/`transactions`, pencocokan kantong, form per jenis, transaksi ikutan, dan kategori milik user. Bagian lain sudah digantikan:

| Bagian spec ini | Digantikan oleh |
|---|---|
| Beranda sebagai pusat analitik (tren, ringkasan, budget lengkap) | [SPEC-navigasi](SPEC-navigasi.md) (tab Analitik) & [SPEC-analitik-insight](SPEC-analitik-insight.md) |
| Transaksi Beranda "hari ini & kemarin" | SPEC-navigasi: 5 transaksi terakhir |
| Pengaturan dari menu ⋮ (`/pengaturan`) | SPEC-navigasi: tab Profil (`/profil/*`); menu ⋮ dihapus |
| Saldo dari `saldo_per` (tanggal) | [SPEC-saldo-waktu](SPEC-saldo-waktu.md): `saldo_sejak` (jam), dihitung RPC `saldo_kantong` |
| `payment_method` selalu menyimpan teks asli | [SPEC-normalisasi](SPEC-normalisasi.md): dikosongkan bila kantong tertaut |
| Transfer AI yang tujuannya tak cocok → pengeluaran | Jadi catatan belum selesai yang bertanya "Pindah ke kantong mana?" ([SPEC-catat-chat](SPEC-catat-chat.md)) |

## Objective

Beranda jadi pusat analitik, terinspirasi spreadsheet keuangan per kantong milik teman pemakai. Ada empat kemampuan:

1. **Ringkasan bulanan & tren**: masuk, keluar, dan sisa uang beberapa bulan terakhir. *(Sekarang di tab Analitik.)*
2. **Streak**: hari berturut-turut mencatat, sebagai penyemangat ("reward karena rajin isi"). *(Tetap di Beranda.)*
3. **Budget per kategori**: target bulanan vs aktual vs sisa.
4. **Saldo per kantong**: saldo tiap kantong (BCA, GoPay, Tunai…) dan total aset.

~~Daftar transaksi di Beranda hanya menampilkan hari ini dan kemarin.~~ Sekarang 5 transaksi terakhir (SPEC-navigasi). Riwayat lengkap tetap di tab Riwayat.

~~Halaman Pengaturan (dibuka dari menu ⋮)~~ Tab **Profil** menjadi tempat mengatur budget dan kantong.

## Peta kemampuan

| Modul | Isi | Butuh |
|---|---|---|
| `ringkasan` | Tren bulanan, streak (transaksi hari ini & kemarin sudah digantikan) | — |
| `pengaturan` | Kini tab Profil: kartu akun, menu, Keluar, versi | — |
| `budget` | Target per kategori, kartu Budget | `pengaturan`, **tabel baru** |
| `kantong` | Daftar kantong + saldo awal, transaksi tertaut ke kantong, kartu Total aset | `pengaturan`, **ubah tabel** |

Urutan kerja: `ringkasan` → `pengaturan` → `budget` → `kantong`. Semua sudah dikerjakan.

## Rancangan

### `ringkasan` (tanpa ubah database)
- **Tren:** batang pemasukan & pengeluaran untuk 6 bulan (`trenBulanan`, `TrenBulanan`). Grafiknya SVG sendiri, tanpa pustaka chart. Sisa (masuk − keluar) dihitung per bulan tetapi tidak digambar. Kini di tab Analitik, berakhir di bulan terpilih.
- **Streak** (`hitungStreak`, `BarisStreak`, di Beranda): jumlah hari berturut-turut (WIB) yang punya minimal satu transaksi yang **dicatat** pada hari itu (`created_at`, bukan tanggal transaksi, supaya mengisi tanggal mundur tidak dihitung). Streak tetap hidup selama kemarin masih tercatat; hari ini belum mencatat tidak langsung memutusnya. Hanya catatan 90 hari terakhir yang diambil (`HARI_STREAK`), jadi streak maksimal tampil 90 hari.
- ~~Transaksi Beranda: hanya hari ini dan kemarin.~~ Digantikan SPEC-navigasi.

### `budget` — tabel baru `budgets` (migrasi `20261022000000_budgets`)
```sql
budgets (user_id uuid, category text, amount numeric(14,2) > 0, updated_at, primary key (user_id, category))  -- RLS: milik sendiri
-- 20261107000000_normalisasi: + type text = 'expense', FK (user_id, type, category) → categories, on delete cascade
```
- Target berlaku sama setiap bulan. Belum ada target khusus per bulan.
- Kartu Budget (`KartuBudget`, `progresBudget`): per kategori yang punya target, aktual/target bulan itu, bar progres, dan "Sisa Rp X" / "Lewat Rp X" "dari Rp Y". Bar memakai warna kategori, kuning **mulai 80%** (`waspada`, ≥ 80%, sama dengan kartu metode), merah kalau lewat 100% (`lewat`). Urut dari yang paling terpakai. Kosong → baris "Pasang budget bulanan" ke `/profil/budget`.
  - Versi lengkap di Analitik; Beranda hanya "Budget hampir habis" (SPEC-navigasi).
- Diatur di Profil → Budget: nominal per kategori, dikosongkan untuk menghapus target. Saran nominal dari RPC `get_avg_monthly_expense_by_category` (rerata 3 bulan).

### `kantong` — memakai ulang tabel `user_accounts` (migrasi `20261022120000_kantong`)
```sql
alter table user_accounts add column saldo_awal numeric(14,2) not null default 0,
                          add column saldo_per date not null default current_date;
alter table transactions  add column kantong_id uuid references user_accounts on delete set null,
                          add column kantong_tujuan_id uuid references user_accounts on delete set null;
```
- **Saldo kantong** = `saldo_awal` + masuk − keluar − pindah keluar + pindah masuk, hanya transaksi terkonfirmasi. Sejak SPEC-saldo-waktu batasnya `saldo_sejak` (tanggal + jam, `saldo_per` tetap ada dan disinkronkan trigger): transaksi di hari itu yang jamnya sebelum jam saldo tidak dihitung. Dihitung di database lewat RPC `saldo_kantong()` (migrasi `20261029000000_saldo_kantong`).
- **Total aset** = jumlah saldo kantong uang (`kantongUang`: semua kecuali `orang` dan `kredit`, jadi termasuk tujuan tabungan). Orang & kartu kredit ada di Utang & Piutang.
- Form transaksi: field **Kantong** (pilihan) menggantikan **Metode bayar** yang berupa teks bebas. Untuk Pindah kantong ada dua field: **Dari** dan **Ke**.
- Teks dan struk yang dibaca AI ("kopi 25rb gopay"): `payment_method` hasil AI dicocokkan ke kantong bernama atau beralias sama (`cocokkanKantong`, `src/lib/kantong.ts`), tanpa membedakan huruf besar-kecil, spasi, dan tanda baca. Untuk pindah kantong, `payment_target` dicocokkan ke kantong tujuan.
- Transaksi lama: dicocokkan dengan aturan yang sama saat migrasi (backfill sekali). Yang tidak cocok tetap tanpa kantong dan tidak ikut hitungan saldo.
- Diatur di Profil → Kantong: tambah, ubah, atau hapus kantong, beserta nama, **emoji** (pengganti jenis Bank/E-wallet di form), saldo awal, dan tanggal + jam saldo. Tiap akun punya kantong **Tunai** bawaan yang tidak bisa dihapus (`20261024120000_kantong_tunai`).
- **Nama kantong unik tanpa beda huruf besar-kecil & spasi tepi** (unique index `(user_id, lower(btrim(name)))`, `20261110000001_kantong_kartu`), untuk semua jenis (uang, orang, kartu, tujuan). Nama kembar ditolak dengan pesan yang menyebut di mana nama itu dipakai (`pesanNamaKembar`): "Nama ini sudah dipakai untuk Teman (contoh) di Utang & Piutang." / "… di Kantong." / "… di Tujuan tabungan."
- **Ekspor CSV**: kolom Kategori pindah kantong ditulis **"Pindah kantong"** (bukan `other`).

## Testing

- Fungsi murni + skrip `assert`: tren bulanan, streak (batas tengah malam WIB dan putus/sambung), dan progres budget di `uji:analitik`; saldo kantong (termasuk pindah kantong dan batas saldo), pencocokan metode bayar ke kantong, dan pesan nama kembar di `uji:kantong`; kategori pindah kantong di ekspor di `uji:ekspor`.
- Migrasi diuji dengan `npm run db:status` sebelum `db:migrate`, dan bersifat idempoten.
- Cek visual di 375px: Beranda, Profil, form dengan field kantong.

## Boundaries

- **Sudah disetujui lewat spec ini:** tabel `budgets`, kolom baru di `user_accounts` dan `transactions`, serta backfill kantong.
- **Tetap tanya dulu:** menghapus data apa pun, dan perubahan prompt AI di luar `payment_target`.
- ~~**Jangan:** menghapus kolom `payment_method`.~~ Kolomnya tetap ada, tetapi sejak SPEC-normalisasi (2.7.0) hanya diisi bila transaksi **tidak** tertaut kantong; nama kantong dibaca view `transactions` dari `user_accounts`, dan kantong yang dihapus meninggalkan namanya di `payment_method`.

## Keputusan (22 Okt 2026)

- Spec dan perubahan database **disetujui**. Migrasi ditulis dan diuji di sini, dan pemakai yang menjalankan `npm run db:migrate` ke produksi.
- **Metode bayar diganti Kantong** di form. ~~Kolom `payment_method` tetap diisi teks asli di belakang layar.~~ Lihat Boundaries.
- **Pindah kantong dari teks: AI mengisi asal dan tujuan.** Prompt ekstraksi punya field `payment_target` (kantong tujuan, hanya untuk transfer), dan `type` boleh `"transfer"`.
  - ~~Jaring pengaman: transfer dari AI yang tujuannya tidak cocok disimpan sebagai pengeluaran.~~ Sekarang transaksi yang kantong asal/tujuannya tidak cocok jadi catatan belum selesai, dan Catat bertanya "Pindah ke kantong mana?" (`simpan-transaksi.ts`, `draft.ts`).

## Keputusan (22 Okt 2026, lanjutan)

- **Form per jenis.** Keluar: kategori pengeluaran, "Bayar pakai", merchant, cashback (opsional). Masuk: 8 kategori pemasukan (Gaji, Bonus/THR, Usaha/Jualan, Freelance/Proyek, Pemberian, Cashback/Refund, Bunga/Investasi, Lainnya), "Masuk ke", "Dari siapa". Pindah: tanpa kategori & merchant, Dari/Ke, biaya admin (opsional). Kategori pengeluaran ditambah "Biaya admin" (`fees`).
- **Biaya admin & cashback = transaksi ikutan** (`transactions.induk_id`, on delete cascade, migrasi `20261023000000_transaksi_ikutan`): biaya admin = pengeluaran `fees` dari kantong asal; cashback = pemasukan `refund` ke kantong yang sama. Semua hitungan ikut tanpa diubah.
- **Tiap transaksi wajib berkantong** (bila user punya kantong). Hasil AI yang kantongnya tak cocok jadi catatan belum selesai (dulu tab "Perlu dibenerin", sejak 2.1.0 daftar "Belum selesai" di lembar Catat); isian manual tanpa kantong ditolak.
- **Kategori milik user** (tabel `categories`, migrasi `20261023120000_kategori`): diisi kategori bawaan saat daftar (trigger `on_auth_user_created_kategori`) dan untuk user lama. Bawaan boleh diubah & dihapus kecuali "Lainnya" (slug `other`, satu per jenis), yang jadi tempat jatuh. Hapus kategori (RPC `hapus_kategori`) memindah transaksinya ke Lainnya dan menghapus budget-nya, dengan konfirmasi jumlah. Kategori baru: nama + ikon (36 pilihan) + warna (8). Slug buatan user acak (`c-…`) supaya tetap walau diganti nama.
- **Prompt AI menerima daftar kategori milik user** (slug = nama, plus petunjuk untuk kategori bawaan). Slug di luar daftar jatuh ke "other".
