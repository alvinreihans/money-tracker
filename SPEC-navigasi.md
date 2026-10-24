# Spec: Navigasi 5 tab (Beranda · Riwayat · + · Analitik · Profil)

Status: **draf, menunggu persetujuan** · 24 Oktober 2026 · branch `feat/navigasi` (ditumpuk di atas PR #32)

Menggantikan sebagian [SPEC-analitik](SPEC-analitik.md): di sana Beranda dijadikan pusat analitik dan Pengaturan dibuka dari menu ⋮. Sekarang analitik pindah ke tab sendiri dan Pengaturan jadi tab **Profil**.

## Masalah

- Navigasi bawah cuma **Beranda · + · Riwayat**.
- **Beranda mengerjakan dua hal sekaligus.** Ia menampilkan apa yang terjadi hari ini, tapi juga memuat semua grafik: ringkasan bulan, tren, komposisi kategori, dan budget. Akibatnya halamannya panjang dan butuh 13 query tiap kali dibuka.
- **Pengaturan tersembunyi di menu ⋮.** Kantong, Kategori, Lend & Borrow, Budget, Notifikasi, dan Ekspor ada di sana, jadi sulit ditemukan.

## Peta kemampuan (4 fase, tiap fase spec & PR sendiri)

Urutannya mengikuti keperluan: fase berikutnya membangun di atas fase sebelumnya.

| Fase | Isi | Butuh |
|---|---|---|
| **1. `navigasi`** (spec ini) | Navigasi 5 tab; Beranda dirampingkan; tab **Analitik** berisi grafik yang dipindah dari Beranda; Profil = Pengaturan | — |
| 2. `riwayat-filter` | Filter ala ShopeePay versi One UI. Satu baris chip berisi **Tanggal ▾**, **Kantong ▾**, **Kategori ▾**, dan jenis transaksi. Di header tiap bulan tampil total bulan itu. | 1 |
| 3. `analitik-insight` | Pilih bulan, rincian kategori, perbandingan dengan bulan sebelumnya, dan budget | 1 |
| 4. `analitik-ai` | Chatbot di Analitik. Angka dihitung database, AI hanya menjelaskan (pertimbangkan batas kuota Groq) | 3 |
| 5. `desktop` | Mode desktop/tablet: navigasi pindah ke rail atau sidebar kiri, isi dibatasi lebarnya, Riwayat dua panel (daftar + detail) | 1, 2 |

## Prinsip alamat (web & PWA, berlaku untuk semua fase)

Begitu ada mode desktop, alamat terlihat di address bar, bisa di-bookmark, dan dibagikan. Karena itu alamat ikut dirancang sejak fase 1.

- **Tiap layar punya alamat sendiri.** Tombol kembali browser dan Android jalan, dan muat ulang tidak membuang posisi pemakai.
- **Tiap tab adalah segmen teratas.** Halaman di bawahnya bersarang di segmen tab itu:
  - `/` (Beranda)
  - `/riwayat`, dengan detail transaksi di `/transactions/[id]`
  - `/analitik`
  - `/profil`, dengan halaman di bawahnya `/profil/kantong`, `/profil/kategori`, `/profil/budget`
- **Lend & Borrow tetap `/pinjaman`.** Ini fitur tersendiri dan notifikasi sudah menautkan ke sana. Di desktop ia bisa jadi item sidebar sendiri.
- **Keadaan yang layak disimpan atau dibagikan masuk query string.** Contohnya filter Riwayat di fase 2: `?jenis=keluar&dari=2026-10-01&sampai=2026-10-31&kantong=…`. Lembar sementara (pilih kantong, konfirmasi) tidak mengubah alamat.
- **Alamat lama tidak boleh mati.** Alamat yang diganti dialihkan permanen (308) lewat `redirects` di `next.config.ts`.
- **Daftar navigasi ditulis sekali.** Satu array `NAVIGASI` di satu file memuat alamat, label, ikon, dan alamat mana saja yang membuat tab menyala. Bottom bar sekarang dan rail/sidebar desktop nanti sama-sama membacanya.

## Fase 1: rancangan

### Navigasi bawah

Navigasi tetap berupa kapsul melayang, dan tiap tab tetap menampilkan ikon di atas label. Isinya jadi lima:

```
[ 🏠 Beranda ] [ 🧾 Riwayat ] [  +  ] [ 📊 Analitik ] [ 👤 Profil ]
```

**Tab aktif.** Penandanya sama seperti sekarang: ikon bergaris lebih tebal dan label tebal. Tab yang menyala ditentukan oleh alamat halaman:

| Tab | Menyala di |
|---|---|
| Beranda | `/` |
| Riwayat | `/riwayat`, `/transactions/*` |
| Analitik | `/analitik` |
| Profil | `/profil/*` dan `/pinjaman` (di HP, Lend & Borrow dibuka dari menu Profil) |

**Tombol +** tetap di tengah, dengan perilaku yang sama seperti sekarang.

**Ukuran.** Kapsul harus muat 5 item di lebar 360px tanpa memotong label. Area sentuh tiap tab minimal 48px.

### Beranda: "hari ini & yang perlu perhatian"

Urutan isi dari atas ke bawah:

1. **Judul besar tetap** "Rp X keluar di Oktober" dengan "↓ turun 12% dari September". Seluruh judul bisa diketuk dan membuka **Analitik**.
2. **Catatan belum selesai** (kartu oranye), hanya kalau ada. Sama seperti sekarang.
3. **Transaksi hari ini & kemarin**, lalu tautan "Lihat semua riwayat". Sama seperti sekarang.
4. **Kantong** berisi saldo dan Total aset.
5. **Perlu dibayar**: cicilan dan Lend & Borrow yang jatuh tempo (`KartuPinjaman`).
6. **Budget hampir habis**: hanya kategori yang sudah terpakai ≥ 80%, misalnya "Makan · sisa Rp 50.000 (90%)". Kalau tidak ada, kartunya tidak muncul.
7. **Streak** dalam satu baris kecil.

Yang **pindah ke Analitik**: `RingkasanBulan`, `TrenBulanan`, `KomposisiKategori`, dan `KartuBudget` versi lengkap.

Query Beranda ikut berkurang. Tren 6 bulan dan rerata kategori tidak diambil lagi di Beranda.

### Analitik (`/analitik`, halaman baru)

- AppBar berjudul "Analitik", dengan subjudul nama bulan ini.
- Isinya, berurutan:
  - ringkasan bulan: masuk, keluar, sisa;
  - tren 6 bulan;
  - komposisi kategori;
  - budget lengkap, dengan tautan "Atur budget";
  - streak.
- Fase 1 hanya memindahkan komponen yang sudah ada, tanpa grafik baru. Pemilih bulan dan insight lainnya masuk fase 3.

### Profil (`/profil`)

- **Pindah alamat.** `/pengaturan` jadi `/profil`, dan sub-halamannya pindah ke `/profil/kantong`, `/profil/kategori`, `/profil/budget`.
  - Semua alamat `/pengaturan/*` dialihkan permanen ke padanannya, jadi bookmark dan tautan lama tetap jalan.
  - Ada 13 tautan di kode yang ikut diganti.
- AppBar berjudul **"Profil"**, tanpa tombol kembali karena sekarang halaman ini sebuah tab.
- Di atas ada **kartu akun**: lingkaran berisi huruf awal email, lalu email di sebelahnya. Mengikuti pola halaman akun Samsung.
- Di bawahnya grup yang sudah ada:
  - **Keuangan**: Kantong, Kategori, Lend & Borrow, Budget;
  - **Notifikasi**;
  - **Data**: Ekspor;
  - **Akun**: Keluar;
  - versi aplikasi.
- **Menu ⋮** (`MenuAkun`) di Beranda dan Riwayat **dihapus**, karena isinya sudah ada di Profil.

### PWA

- **Pintasan aplikasi** di manifest (`shortcuts`). Ikon aplikasi yang ditekan lama di Android memunculkan **Catat**, **Riwayat**, dan **Analitik**.
  - Pintasan Catat memakai `/?catat=1`, yang sudah ada.
- **`id` & `scope` manifest** diisi eksplisit (`/`). Tanpa itu, aplikasi yang sudah terpasang bisa dianggap aplikasi lain kalau alamat mulainya kelak berubah.

### Riwayat

Fase 1 tidak mengubah isi Riwayat. Satu-satunya perubahan: menu ⋮ dihapus. Filter masuk fase 2.

## Pengujian

- `npm run uji:*` dan `next build` harus lulus.
- **E2E di Edge headless (360px dan 412px, terang dan gelap)** memakai akun uji sementara yang langsung dihapus sesudahnya. Akun utama tidak dipakai. Yang dicek:
  - tiap tab terbuka dan menyala benar;
  - label tidak terpotong;
  - tombol + tetap membuka lembar Catat;
  - judul Beranda membuka Analitik;
  - kartu "Budget hampir habis" muncul di ≥ 80% dan hilang di bawahnya;
  - Profil menampilkan email dan semua menu;
  - sub-halaman (Kantong dan lainnya) kembali ke Profil;
  - alamat lama (`/pengaturan`, `/pengaturan/kantong`, …) dialihkan dengan 308 ke `/profil/…`;
  - tombol kembali browser dari tiap tab dan sub-halaman berjalan benar;
  - tidak ada error di console.
- Tangkapan layar tiap tab dilampirkan di PR.

## Boundaries

- **Selalu:** komponen yang sudah ada dipindah, bukan ditulis ulang. Pola One UI yang dipakai sama dengan yang sudah ada di aplikasi.
- **Disetujui lewat spec ini:** pindah `/pengaturan/*` ke `/profil/*`, dengan pengalihan dari alamat lama.
- **Tanya dulu:** mengganti alamat lain atau menghapus fitur yang sudah ada.
- **Jangan:**
  - mengubah database (fase 1 tidak butuh migrasi);
  - memakai akun utama untuk pengujian;
  - mengubah perilaku lembar Catat.

## Pertanyaan terbuka

1. **Judul besar Beranda.** Usulnya tetap menampilkan "keluar bulan ini", yang bisa diketuk ke Analitik. Alternatifnya mengganti dengan **Total aset** atau **keluar hari ini**.
2. **Lend & Borrow menyalakan tab Profil di HP.** Lend & Borrow juga dibuka dari kartu "Perlu dibayar" di Beranda. Sebagai alternatif, bisa saja tidak ada tab yang menyala di halaman itu. Di desktop (fase 5) Lend & Borrow jadi item sidebar sendiri.
3. **Ikon Profil.** Usulnya huruf awal email di dalam lingkaran, seperti halaman akun Samsung. Alternatifnya ikon orang biasa.
