# Spec: Navigasi 5 tab (Beranda · Riwayat · + · Analitik · Profil)

Status: **diterapkan · rilis 2.1.0** (fase 1; fase 2–5 lihat peta) · disinkronkan dengan kode 1 Nov 2026 · branch awal `feat/navigasi`

Menggantikan sebagian [SPEC-analitik](SPEC-analitik.md): di sana Beranda dijadikan pusat analitik dan Pengaturan dibuka dari menu ⋮. Sekarang analitik pindah ke tab sendiri dan Pengaturan jadi tab **Profil**.

"Lend & Borrow" di spec ini sejak 2.5.0 bernama **Utang & Piutang** (alamat tetap `/pinjaman`).

## Masalah

- Navigasi bawah cuma **Beranda · + · Riwayat**.
- **Beranda mengerjakan dua hal sekaligus.** Ia menampilkan apa yang terjadi hari ini, tapi juga memuat semua grafik: ringkasan bulan, tren, komposisi kategori, dan budget. Akibatnya halamannya panjang dan butuh 13 query tiap kali dibuka.
- **Pengaturan tersembunyi di menu ⋮.** Kantong, Kategori, Lend & Borrow, Budget, Notifikasi, dan Ekspor ada di sana, jadi sulit ditemukan.

## Peta kemampuan (5 fase, tiap fase spec & PR sendiri)

Urutannya mengikuti keperluan: fase berikutnya membangun di atas fase sebelumnya.

| Fase | Isi | Butuh | Status |
|---|---|---|---|
| **1. `navigasi`** (spec ini) | Navigasi 5 tab; Beranda dirampingkan; tab **Analitik** berisi grafik yang dipindah dari Beranda; Profil = Pengaturan | — | diterapkan, 2.1.0 |
| 2. `riwayat-filter` | Filter chip **Tanggal ▾**, **Kantong ▾**, **Kategori ▾**, dan jenis transaksi; header per bulan dengan total. [SPEC-riwayat-filter](SPEC-riwayat-filter.md) | 1 | diterapkan, 2.1.0 |
| 3. `analitik-insight` | Pilih bulan, rincian kategori, perbandingan dengan bulan sebelumnya, sorotan, merchant, budget. [SPEC-analitik-insight](SPEC-analitik-insight.md) | 1 | diterapkan, 2.1.0 |
| 4. `analitik-ai` | Tanya AI di Analitik (juga di Beranda sejak 2.4.0). [SPEC-analitik-ai](SPEC-analitik-ai.md) | 3 | diterapkan, 2.1.0 |
| 5. `desktop` | Rail/sidebar, isi dibatasi lebarnya, Riwayat & Profil dua panel. [SPEC-layar-lebar](SPEC-layar-lebar.md) | 1, 2 | diterapkan, 2.2.0 |

## Prinsip alamat (web & PWA, berlaku untuk semua fase)

Begitu ada mode desktop, alamat terlihat di address bar, bisa di-bookmark, dan dibagikan. Karena itu alamat ikut dirancang sejak fase 1.

- **Tiap layar punya alamat sendiri.** Tombol kembali browser dan Android jalan, dan muat ulang tidak membuang posisi pemakai.
- **Tiap tab adalah segmen teratas.** Halaman di bawahnya bersarang di segmen tab itu:
  - `/` (Beranda)
  - `/riwayat`, dengan detail transaksi di `/transactions/[id]` (HP) atau `/riwayat?id=` (layar lebar, SPEC-layar-lebar)
  - `/analitik` (`?bulan=YYYY-MM`, fase 3)
  - `/profil`, dengan halaman di bawahnya `/profil/kantong`, `/profil/kategori`, `/profil/budget`, `/profil/tujuan`
- **Utang & Piutang tetap `/pinjaman`.** Ini fitur tersendiri dan notifikasi sudah menautkan ke sana. Di sidebar desktop ia jadi item sendiri.
- **Keadaan yang layak disimpan atau dibagikan masuk query string.** Contohnya filter Riwayat: `?jenis=keluar&dari=2026-10-01&sampai=2026-10-31&kantong=…`. Lembar sementara (pilih kantong, konfirmasi) tidak mengubah alamat.
- **Tombol/gestur kembali menutup lembar paling atas dulu** (sejak SPEC-perbaikan-uiux #12). Tiap lembar modal yang terbuka (`Lembar`, termasuk lembar Catat; panel samping non-modal Tanya AI di layar lebar tidak) punya satu entri riwayat beralamat sama di atas entri halamannya (`src/lib/riwayat-lembar.ts`). Kembali → lembar teratas menutup lewat jalan tutupnya sendiri: bila isiannya berubah, "Buang perubahan?" muncul dan Batal di sana membiarkan lembar terbuka. Menutup lewat tombol/×, Esc, atau ketuk di luar tidak meninggalkan entri sisa yang perlu ditekan kembali dua kali; lembar yang menutup sambil pindah halaman ("Lihat riwayat") tetap pindah. Alamatnya tidak berubah.
- **Daftar navigasi ditulis sekali.** Satu array `NAVIGASI` di `src/components/navigasi.ts` memuat alamat, label, ikon, fungsi `aktif` (alamat mana saja yang membuat tab menyala), dan penanda `sidebar` (item yang hanya tampil di sidebar). Kapsul bawah, rail, dan sidebar sama-sama membacanya (`AppShell`).

## Fase 1: rancangan

### Navigasi bawah

Navigasi tetap berupa kapsul melayang, dan tiap tab tetap menampilkan ikon di atas label. Isinya jadi lima:

```
[ 🏠 Beranda ] [ 🧾 Riwayat ] [  +  ] [ 📊 Analitik ] [ (A) Profil ]
```

**Tab aktif.** Ikon bergaris lebih tebal (`strokeWidth` 2.4 vs 1.7) dan label tebal (`aria-current="page"`). Tab Profil memakai huruf awal email dalam lingkaran (`avatarNav`) sebagai ikon; tanpa email, ikon orang (`UserRound`). Tab yang menyala ditentukan oleh alamat halaman:

| Tab | Menyala di |
|---|---|
| Beranda | `/` |
| Riwayat | `/riwayat*`, `/transactions/*` |
| Analitik | `/analitik*` |
| Profil | `/profil*` dan `/pinjaman*` (di HP & rail Utang & Piutang dibuka dari menu Profil; di sidebar ≥ 1200px Profil tidak ikut menyala karena Utang & Piutang punya item sendiri) |

**Tombol +** tetap di tengah, dengan perilaku yang sama seperti sekarang (titik oranye bila ada catatan belum selesai).

**Ukuran.** Kapsul harus muat 5 item di lebar 360px tanpa memotong label. Area sentuh tiap tab minimal 48px.

### Beranda: "hari ini & yang perlu perhatian"

Urutan isi dari atas ke bawah:

1. **Judul besar** nominal "Rp X", subjudul "keluar di Oktober" dan, bila berubah, "↓ turun 12% dari September" (atau "↑ naik"). Judul dan subjudul bisa diketuk dan membuka **Analitik**. Pembelian dari tujuan tabungan tidak dihitung ([SPEC-analitik-tujuan](SPEC-analitik-tujuan.md)).
2. **Catatan belum selesai** ("N catatan belum selesai · Ketuk untuk melengkapi"), hanya kalau ada. Membuka daftar Belum selesai di lembar Catat.
3. **Belum disisihkan**, hanya untuk metode Pay Yourself First / Zero-Based setelah gajian ([SPEC-metode-lanjutan](SPEC-metode-lanjutan.md)).
4. **5 transaksi terakhir** (hanya yang terkonfirmasi, urutan sama dengan Riwayat), lalu tautan "Lihat semua riwayat".
   - Dihitung per **transaksi**: transaksi yang dipecah tetap satu kartu, jadi selalu 5 kartu (query mengambil 5 transaksi asli, `pecahan_dari is null`, lalu bagian-bagiannya).
   - Header kelompok ("Hari ini", "Kemarin", "Minggu ini", bulan, tahun) menampilkan **pengeluaran sebenarnya** kelompok itu, dihitung server dari semua pengeluaran terkonfirmasi sejak awal kelompok kartu terlama (`awalKelompokWaktu`, `totalKelompokWaktu` di `src/lib/riwayat.ts`), bukan hanya dari kartu yang tampil. Angkanya sama dengan Riwayat (pembelian dari tujuan tabungan ikut, seperti di Riwayat). Kosong → "Belum ada transaksi" dengan tombol "Catat transaksi".
5. **Kantong** (`KartuKantong`, judul "Total aset") berisi saldo dan Total aset.
6. **Utang & Piutang** (`KartuPinjaman`): total piutang & utang, cicilan bulan ini yang belum dibayar, dan tenggat terdekat/telat. Tidak tampil bila tidak ada pinjaman maupun cicilan.
7. **Budget hampir habis**: hanya kategori yang terpakai **di atas 80%** (status `waspada`/`lewat`), dengan bar dan "Sisa Rp X dari Rp Y" / "Lewat Rp X". Kalau tidak ada, kartunya tidak muncul. Bila metode budgeting aktif (selain Zero-Based), yang tampil kelompok metode yang ≥ 80% (`KartuMetode`, [SPEC-metode-budget](SPEC-metode-budget.md)).
8. **Streak** dalam satu baris kecil (`BarisStreak`).
9. Tombol **Tanya AI** (sejak 2.4.0).

Yang **pindah ke Analitik**: `RingkasanBulan`, `TrenBulanan`, `KomposisiKategori`, dan `KartuBudget` versi lengkap.

Query Beranda ikut berkurang. Tren 6 bulan dan rerata kategori tidak diambil lagi di Beranda.

### Analitik (`/analitik`, halaman baru)

Fase 1 hanya memindahkan komponen yang sudah ada (ringkasan bulan, tren 6 bulan, komposisi kategori, budget lengkap dengan "Atur budget", streak). **Isi dan urutannya sekarang mengikuti SPEC-analitik-insight**: AppBar "Analitik" tanpa subjudul (bulan ada di pemilih bulan), streak tidak lagi di Analitik.

### Profil (`/profil`)

- **Pindah alamat.** `/pengaturan` jadi `/profil`, dan sub-halamannya pindah ke `/profil/kantong`, `/profil/kategori`, `/profil/budget` (kemudian `/profil/tujuan`, SPEC-tujuan-tabungan).
  - **Tanpa pengalihan dari alamat lama.** PWA yang terpasang memuat halaman dari server dan dimulai dari `/`. Service worker hanya menyimpan foto yang dibagikan dan halaman offline, bukan halaman aplikasi. Yang kena hanya bookmark atau riwayat browser ke `/pengaturan` (kini 404), dan untuk aplikasi pribadi itu tidak sepadan.
- AppBar berjudul **"Profil"**, tanpa tombol kembali karena sekarang halaman ini sebuah tab.
- Di atas ada **kartu akun**: lingkaran berisi huruf awal email, lalu email di sebelahnya. Mengikuti pola halaman akun Samsung.
- Di bawahnya grup:
  - **Keuangan**: Kantong, Kategori, Utang & Piutang, Tujuan tabungan, Budget (dengan keterangan jumlah kantong / kategori; Budget mengikuti metode aktif: "Metode 50/30/20", "Zero-Based", …, atau tanpa metode "n kategori dibatasi" / "Batas pengeluaran per kategori");
  - **Notifikasi** (sakelar);
  - **Data**: Ekspor data (CSV);
  - **Akun**: Nama di rekening, lalu Keluar di blok terpisah;
  - versi aplikasi ("Money Tracker X.Y.Z").
- Menu dan halamannya dirangkai `profil/layout.tsx` (dua panel di layar lebar, SPEC-layar-lebar); `profil/page.tsx` sendiri kosong.
- **Menu ⋮** (`MenuAkun`) di Beranda dan Riwayat **dihapus**, karena isinya sudah ada di Profil.

### PWA

- **Pintasan aplikasi** di manifest (`shortcuts`, `src/app/manifest.ts`). Ikon aplikasi yang ditekan lama di Android memunculkan **Catat**, **Riwayat**, dan **Analitik**.
  - Pintasan Catat memakai `/?catat=baru` (membuka lembar Catat; `?catat=<id>` tetap membuka draft). Setelah dibuka, alamat diganti kembali ke `/`.

### Riwayat

Fase 1 tidak mengubah isi Riwayat. Satu-satunya perubahan: menu ⋮ dihapus. Filter masuk fase 2.

## Pengujian

- `npm run uji:*` dan `next build` harus lulus.
- **E2E di Edge headless (360px dan 412px, terang dan gelap)** memakai akun uji sementara yang langsung dihapus sesudahnya. Akun utama tidak dipakai. Dijalankan sekali saat PR fase 1 (tidak disimpan sebagai suite). Yang dicek:
  - tiap tab terbuka dan menyala benar;
  - label tidak terpotong;
  - tombol + tetap membuka lembar Catat;
  - judul Beranda membuka Analitik;
  - kartu "Budget hampir habis" muncul di atas 80% dan hilang di bawahnya;
  - Profil menampilkan email dan semua menu;
  - sub-halaman (Kantong dan lainnya) kembali ke Profil;
  - tombol kembali browser dari tiap tab dan sub-halaman berjalan benar;
  - tidak ada error di console.
- Suite permanen yang kini menjaga perilaku ini: `e2e/kembali.mjs` (tombol kembali, termasuk kembali menutup lembar), `e2e/lebar.mjs`, `e2e/a11y.mjs`.

## Boundaries

- **Selalu:** komponen yang sudah ada dipindah, bukan ditulis ulang. Pola One UI yang dipakai sama dengan yang sudah ada di aplikasi.
- **Disetujui lewat spec ini:** pindah `/pengaturan/*` ke `/profil/*`, tanpa pengalihan.
- **Tanya dulu:** mengganti alamat lain atau menghapus fitur yang sudah ada.
- **Jangan:**
  - mengubah database (fase 1 tidak butuh migrasi);
  - memakai akun utama untuk pengujian;
  - mengubah perilaku lembar Catat.

## Keputusan

1. **Judul besar Beranda** tetap "keluar bulan ini", bisa diketuk ke Analitik.
2. **Utang & Piutang menyalakan tab Profil** di HP dan rail. Di sidebar (≥ 1200px) ia item sendiri dan Profil tidak ikut menyala.
3. **Ikon Profil** = huruf awal email di dalam lingkaran, seperti halaman akun Samsung (ikon orang hanya bila email tidak ada).
