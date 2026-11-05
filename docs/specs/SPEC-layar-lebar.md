# Spec: Layar lebar — tablet, Fold, desktop (fase 5 SPEC-navigasi)

Status: **diterapkan · rilis 2.2.0** (tempel gambar, a11y & margin 24px di 2.3.0) · disinkronkan dengan kode 1 Nov 2026 · branch awal `feat/layar-lebar`

"Lend & Borrow" di spec ini sejak 2.5.0 bernama **Utang & Piutang** (alamat tetap `/pinjaman`).

Keputusan user: Tanya AI jadi **panel samping** (grafik tetap terlihat), sidebar mulai **1200px**, dan **seret foto struk** ikut di fase ini.

Acuan: [Samsung One UI — Large screen & foldable](https://developer.samsung.com/one-ui/largescreen-and-foldable/intro.html) (intro, *large screen layout*, *designing for foldable*).

## Tujuan

Sekarang aplikasi selalu berupa kolom HP selebar 600px. Di tablet, layar dalam Galaxy Z Fold, laptop, atau PWA desktop, kolom itu berdiri di tengah dengan ruang kosong hitam di kiri dan kanan, dan navigasinya tetap kapsul di bawah. Fase ini membuat tampilan **menyesuaikan lebar layar**:

- di HP **tidak ada yang berubah**;
- di layar lebar, navigasi pindah ke samping, ruang kosong terpakai untuk menampilkan lebih banyak informasi sekaligus, dan lembar input berubah jadi pop-up kecil.

## Yang diminta panduan Samsung, dan artinya bagi aplikasi ini

| Panduan Samsung | Di aplikasi ini |
|---|---|
| Tata letak layar lebar mulai dari lebar **600dp** | Tiga ukuran: **ringkas** < 600px, **sedang** 600–839px, **lebar** ≥ 840px (1dp = 1px CSS) |
| Ringkas: navigasi bawah. Sedang & lebar: **navigation rail**. Layar besar: **drawer yang selalu terlihat** | Ringkas: kapsul bawah seperti sekarang. Sedang & lebar: rail di kiri. ≥ 1200px: sidebar penuh |
| Menu navigasi selalu terlihat di samping isi | Rail/sidebar tidak ikut tergulir |
| Sedang: disarankan satu panel. Lebar: disarankan **dua panel** | Sedang: satu kolom. Lebar: Riwayat dan Profil jadi daftar + detail |
| Rasio panel: **42 : 58** (600–959px), **38 : 62** (≥ 960px), Fold **50 : 50** | Dipakai untuk Riwayat dan Profil (dua panel baru mulai 840px, jadi 42 : 58 berlaku 840–959px) |
| Jangan merentangkan satu panel selebar layar | Isi dibatasi lebarnya; Beranda dan Analitik jadi **grid dua kolom kartu** |
| Grid diubah supaya lebih banyak informasi terlihat sekaligus | Sama seperti baris di atas |
| Tugas singkat: **pop-up kecil** di atas layar sebelumnya, bukan layar penuh | Catat, Tanya AI, dan form lain jadi pop-up di tengah |
| Kontrol yang sering dipakai harus terjangkau | Tombol + Catat di bagian atas rail/sidebar |
| Foldable: saat dibuka/dilipat, aplikasi **tetap di tempat yang sama**. Posisi gulir, teks yang sedang diketik, dan keyboard tidak hilang | Perpindahan tata letak hanya lewat CSS (media query), jadi komponen tidak dipasang ulang dan isinya tidak hilang |
| Mendukung landscape, tanpa letterbox | HP landscape (≈ 800px) otomatis memakai rail |

## Tampilan per ukuran

### Ringkas (< 600px): HP

Tidak berubah. Kapsul navigasi bawah, satu kolom, lembar dari bawah. Semua tes E2E 360px yang sudah ada harus tetap lolos.

### Sedang (600–839px): Z Fold dibuka, tablet kecil, HP landscape

```
┌──────┬───────────────────────────────┐
│  ＋  │                               │
│      │     isi halaman (satu         │
│  🏠  │     kolom, maks 600px,        │
│Beranda│    di tengah ruang sisa)     │
│  🧾  │                               │
│Riwayat│                              │
│  📊  │                               │
│Analitik│                             │
│  (A) │                               │
│Profil│                               │
└──────┴───────────────────────────────┘
```

- **Navigation rail** 80px di kiri: ikon di atas label, urutan dan penanda aktif sama seperti kapsul bawah (kapsul terang di belakang ikon).
- Tombol **+ Catat** berupa tombol bulat di bagian atas rail, dengan titik oranye catatan yang belum selesai seperti sekarang.
- Isi tetap satu kolom, maksimal 600px, di tengah ruang sebelah kanan rail. Panduan Samsung menyarankan satu panel untuk ukuran ini.
- Karena navigasi bawah hilang, tombol kembali-ke-atas, snackbar, dan tombol AI turun ke 16px dari bawah.
- Lebar rail ada di variabel CSS `--rail` (0 di HP, 80px mulai 600px, 240px mulai 1200px); `body` diberi padding kiri sebesar itu.

### Lebar (≥ 840px): tablet, laptop, PWA desktop

Rail tetap dipakai sampai 1199px. Mulai **1200px**, rail melebar jadi **sidebar** 240px: ikon di samping label, tombol "+ Catat transaksi" di atas, dan **Utang & Piutang** jadi item sendiri antara Analitik dan Profil (penanda `sidebar: true`, seperti yang dijanjikan SPEC-navigasi). Saat item itu aktif, Profil tidak ikut menyala. Di HP dan rail, Utang & Piutang tetap dibuka dari Profil.

Per halaman:

- **Beranda: dua kolom kartu.**
  - Kartu mengalir berurutan ke dua kolom (CSS `columns: 2 340px`, kartu tidak terpotong), bukan kiri/kanan yang ditetapkan. Kalau ruangnya kurang dari 2 × 340px (mis. panel Tanya AI terbuka di 1024px), jadi satu kolom.
  - 5 transaksi terakhir dan "Lihat semua riwayat" dibungkus satu blok supaya tidak terpisah kolom.
  - Lebar isi maksimal 1200px (`--lebar-app` naik dari 600px ke 1200px pada halaman yang memakai kelas `.lebar`).
- **Riwayat: dua panel, daftar + detail.**

  ```
  ┌────┬──────────────────┬─────────────────────────────┐
  │rail│ Riwayat          │  Kopi Kenangan        🗑     │
  │    │ [chip filter]    │  − Rp 25.000                 │
  │    │ Oktober  −1,2jt  │  GoPay · Makan & minum       │
  │    │ ▸ Kopi Kenangan ◀│  25 Okt 2026, 08.14          │
  │    │   Indomaret      │  [Ubah]                      │
  │    │   ...            │                              │
  └────┴──────────────────┴─────────────────────────────┘
          38%                      62%
  ```

  - Mengetuk transaksi membuka detailnya di panel kanan, dan barisnya diberi tanda terpilih (`aria-current`). Daftar dan filter tidak hilang.
    - Kartu bagian transaksi yang dipecah (tampil sendiri karena filter) membuka transaksi aslinya (`?id=<asli>`) dan juga ditandai terpilih: kartu terpilih bila `id` yang terbuka = transaksi aslinya atau salah satu baris di kartu itu.
  - **Panel Tanya AI terbuka** (400px di kanan): bila lebar yang tersisa untuk Riwayat < 840px, Riwayat memakai **satu panel** seperti di HP — daftar, atau detail yang mengisi halaman dengan tombol kembali bila ada `?id=`. Dengan rail 80px/sidebar 240px, artinya layar < 1480px (CSS `.duaPanelRiwayat` di bawah `:root:has(.dialogSamping[open]:not(:modal))`). Menutup Tanya AI mengembalikan dua panel tanpa memuat ulang. Profil tidak berubah.
  - Alamatnya menjadi `/riwayat?…filter…&id=<transaksi>`, jadi bisa di-bookmark dan tombol back browser bekerja.
  - Sebelum ada yang dipilih, panel kanan berisi teks "Pilih transaksi untuk melihat detailnya." (`data-kosong`, ditampilkan CSS `::before`).
  - Mengubah atau menghapus transaksi dilakukan dari panel kanan. Setelah dihapus, alamat kembali ke Riwayat dengan filternya (tanpa `id`) dan panel kosong.
  - Panel kanan menempel (`position: sticky`) dan digulir sendiri.
  - `/transactions/[id]` tetap ada dan tetap dipakai di HP, termasuk tautan dari Beranda dan notifikasi.
- **Analitik: dua kolom kartu**, dengan aturan alir yang sama seperti Beranda (urutan kartu mengikuti SPEC-analitik-insight).
  - Pemilih bulan tetap di atas, selebar isi (`column-span: all`).
- **Profil: dua panel, menu + halaman.**
  - Kiri: kartu akun dan menu (Kantong, Kategori, Utang & Piutang, Tujuan tabungan, Budget, Notifikasi, Ekspor, Nama di rekening, Keluar). Baris halaman yang terbuka ditandai (`aria-current="page"`).
  - Kanan: halaman yang dipilih (`/profil/kantong`, `/profil/budget`, dan seterusnya), dengan alamat sama seperti di HP.
  - Membuka `/profil` di layar lebar langsung diganti ke `/profil/kantong` (`router.replace`), jadi panel kanan tidak kosong. Teks cadangan panel kosong: "Pilih pengaturan di sebelah kiri."
- **Utang & Piutang** (`/pinjaman`): satu kolom seperti sekarang (maks 600px). Isinya daftar orang dan cicilan, yang tidak cocok dipecah dua.

Rasio dua panel (dari lebar isi di sebelah rail) mengikuti Samsung: **42 : 58** di 840–959px, **38 : 62** mulai 960px. Jika layar hampir persegi (`max-aspect-ratio: 6/5`, lebar : tinggi ≤ 1,2), rasionya **50 : 50**.

### Lembar & pop-up (≥ 600px)

Mengikuti panduan "pop-up kecil untuk tugas singkat":

- **Lembar bawah** (pilih kantong, filter, konfirmasi) jadi **dialog di tengah**, maksimal 480px.
- **Lembar layar penuh** (Catat, Tanya AI, form pinjaman/kantong/kategori, ubah transaksi, kamera) jadi **pop-up besar di tengah**: maksimal 640px × min(90% tinggi layar, 960px), dengan sudut membulat. Halaman di belakangnya tetap terlihat redup; ketuk di luar menutupnya.
- Tombol **AI** tetap di kanan bawah (Analitik, dan Beranda sejak 2.4.0), tetapi mengikuti tepi kanan isi, bukan tepi layar.
- **Tanya AI di layar lebar (≥ 840px): panel 400px yang menempel di kanan**, bukan pop-up. Panel ini non-modal: halaman Analitik di sebelahnya tetap bisa digulir dan dilihat, dan kartunya turun ke satu kolom kalau ruangnya tidak cukup untuk dua. Tombolnya × (tutup), dan Esc juga menutup. Di 600–839px Tanya AI tetap pop-up, di HP tetap layar penuh. Saat lebar berubah, dialog dibuka ulang dengan mode lain tanpa memasang ulang isinya, jadi obrolan dan ketikan tidak hilang.

### Seret foto struk

Di kolom Catat, gambar juga bisa **ditempel** (Ctrl+V): tangkapan layar atau gambar yang disalin jadi lampiran, sama seperti memilih dari galeri. Lembar Catat di layar lebar selebar pop-up besar (640px).

Foto struk bisa diseret dari File Explorer, Galeri (layar terpisah di tablet/Fold), atau aplikasi lain ke **mana saja** di aplikasi (listener `drag*`/`drop` di `window`, `Catat.tsx`), di semua lebar. Selama diseret, tampil lapisan "Lepas untuk mencatat struk" (popover, jadi tampil juga di atas dialog yang terbuka). Fotonya masuk antrean dan diproses di latar persis seperti foto dari "Bagikan", lalu hasilnya dikabari lewat snackbar ("1 tercatat · 1 belum lengkap", dengan aksi Lengkapi bila perlu). Berkas yang bukan gambar ditolak: "Yang bisa dicatat cuma foto struk (gambar)."

### Tombol & app bar (dicek ulang ke One UI Design Guidelines, 25 Okt)

- **App bar** (hlm. 16): tombol kembali paling kiri, judul di sebelahnya, tombol aksi di kanan (maks 3 termasuk judul), ⋮ paling kanan. Susunan ini sudah dipakai di semua lebar.
- **App bar besar** (hlm. 19): tidak dipakai di HP mendatar; di layar lain hanya kalau tingginya ≥ 580dp. Di bawah tinggi itu, area judul jadi ringkas: tetap tampil karena di detail transaksi judulnya adalah nominal, tetapi tanpa ruang setinggi sepertiga layar. Rail juga dirapatkan supaya semua tab muat.
- **Dua panel:** panel detail (Riwayat & Profil) tanpa tombol kembali, karena daftarnya terlihat di sebelah (CSS menyembunyikan `a[aria-label="Kembali"]` di dalam `.duaPanel[data-tanpa-kembali] .panelDetail` mulai 840px). Di layar sempit tombol kembali tetap ada.
- **Pop-up & panel samping:** tombol di kepala jadi × (tutup). Layar penuh di HP tetap ‹.
- **Detail dari luar Riwayat** di layar lebar langsung membuka dua panel Riwayat (`/riwayat?id=`): kartu transaksi di Beranda (klik biasa; Ctrl/⌘/Shift-klik tetap ke `/transactions/[id]`), dan halaman `/transactions/[id]` sendiri (snackbar "Lihat", notifikasi, Fold dibuka) yang mengganti alamatnya ke `/riwayat?id=` begitu lebarnya ≥ 840px. `/transactions/[id]` tetap dipakai di HP.

### Aksesibilitas (review UI/UX Pro Max, 25 Okt)

- **Satu h1 per halaman.** Judul panel detail jadi h2 hanya saat dua panel benar-benar berdampingan (`PanelDetail` + `useLayarLebar`). Di HP judul detail tetap h1.
- **Fokus tidak tertutup** (WCAG 2.2): `scroll-padding` setinggi baris aksi yang menempel (atas) dan navigasi bawah (bawah, HP), juga di panel detail.
- **Margin samping** lewat `--tepi`: 16px di HP, 24px mulai 600px (One UI: minimal 24dp).
- **Area sentuh.** One UI tidak memberi angka (hanya "cukup besar & berjarak"), jadi kita ikut UI/UX Pro Max: 48dp untuk Android. Chip (40 & 36px) dan pegangan Catat (36×4) diberi area sentuh tak terlihat 48px, sehingga tampilannya tetap. Ikon di kolom ketik dibiarkan 40×48: lulus WCAG 2.2 (min. 24px), dan melebarkannya memakan ~24px ruang ketik di HP 360px.

### Mouse & keyboard (desktop)

- Setiap elemen yang bisa diklik punya efek *hover* dan cincin fokus saat dinavigasi dengan Tab (`:focus-visible`). Efek hover hanya aktif di perangkat dengan mouse (`@media (hover: hover)`), jadi HP tidak terpengaruh.
- Esc menutup pop-up. Ini sudah bawaan `<dialog>`.
- Teks tidak diperbesar. Ukurannya tetap ukuran One UI yang sama dengan HP.

## Cara kerja (ringkas)

- **Tata letak lewat media query CSS, bukan JavaScript.** Dengan begitu, saat Fold dibuka atau dilipat, React tidak memasang ulang halaman. Teks di Catat dan Tanya AI serta posisi gulir tetap ada. JavaScript (`matchMedia(LAYAR_LEBAR)`, `LAYAR_LEBAR = "(min-width: 840px)"` di `navigasi.ts`, harus sama dengan CSS) hanya dipakai untuk **perilaku**, bukan tata letak:
  - klik transaksi di Riwayat: panel kanan atau halaman detail (`RiwayatView`);
  - klik transaksi di luar Riwayat → `/riwayat?id=` (`TransactionList`), dan `/transactions/[id]` → `/riwayat?id=` (`DetailView`);
  - `/profil` → `/profil/kantong` (`ProfilView`);
  - Tanya AI: `show()` (non-modal) atau `showModal()`, dibuka ulang saat lebar berubah (`Lembar` posisi `samping`); tautan di jawaban menutup lembar hanya di layar sempit;
  - h1/h2 judul panel detail (`useLayarLebar`).
- **`NAVIGASI` tetap satu daftar.** Kapsul bawah, rail, dan sidebar memakai komponen yang sama dengan CSS berbeda. Utang & Piutang ditambahkan dengan penanda `sidebar: true` (`data-sidebar`), sehingga hanya tampil di sidebar.
- **Riwayat dua panel.**
  - `RiwayatView` membaca `id` dari alamat (`useSearchParams`) dan mengambil transaksinya di browser dengan `ambilDetail` (`src/lib/riwayat.ts`), fungsi yang sama yang dipakai server oleh `/transactions/[id]`, lalu menampilkan `DetailView` di panel kanan. `riwayat/page.tsx` tidak membaca `id`. Detail dimuat ulang juga setelah simpan/refresh.
  - Di layar ringkas, kalau alamat berisi `id` (misalnya Fold dilipat saat detail terbuka), detail tampil penuh dan tombol kembalinya (alamat Riwayat dengan filternya) membuang `id`. Dengan begitu pengguna tetap di tempat yang sama.
  - Memilih transaksi hanya mengganti `?id=` lewat `history.pushState`, tanpa render ulang server, jadi daftar yang sudah "Muat lagi" dan posisi gulirnya tidak hilang. Ctrl/⌘/Shift/Alt-klik tetap membuka halaman detail.
- **Profil dua panel** lewat `profil/layout.tsx`: menu di kiri dan `children` di kanan (`profil/page.tsx` mengembalikan `null`, jadi panel kanannya `:empty`). Di layar ringkas, menu hanya tampil di `/profil` itu sendiri.
- **Panel mana yang tampil di layar sempit** ditentukan CSS `:empty` / `:has()`: panel kanan yang kosong disembunyikan, dan kalau berisi, daftarnya yang disembunyikan.
- **Halaman tanpa navigasi** (masuk, reset password, mulai, 404) tidak menyisakan ruang rail/sidebar: `<main data-tanpa-nav>` membuat `--rail` jadi 0 lewat `body:has([data-tanpa-nav])` di `globals.css`, jadi isinya tepat di tengah layar pada semua lebar.
- **Tidak ada perubahan database dan tidak ada dependensi baru.**

## Pengujian

- **E2E Edge di 5 lebar:**
  - 360 (HP), 412 (HP besar), 700 (Fold dibuka), 1024 (tablet / laptop kecil), dan 1440 (desktop);
  - di setiap lebar: tidak ada gulir horizontal, jenis navigasi benar, dan halaman Beranda, Riwayat, Analitik, Profil, serta Lend & Borrow terbuka tanpa error.
- **Riwayat 1024px:**
  - klik transaksi → detail di kanan, alamat berisi `id`, baris tertanda;
  - back browser → panel kosong;
  - hapus dari panel → panel kosong dan baris hilang;
  - filter tetap terpasang.
- **Profil 1024px:** menu kiri tetap terlihat saat berpindah Kantong → Budget.
- **Kesinambungan lipatan:**
  - ketik di Catat pada 360px, ubah ke 700px, lalu kembali → teks masih ada;
  - buka detail Riwayat di 1024px, ubah ke 360px → detail tampil penuh, dan kembali → daftar.
- **Pop-up di 1024px:** Catat tampil di tengah, maksimal 640px.
- **Tanya AI di 1024px:** panel non-modal 400px di kanan, isi bergeser, kartu jadi satu kolom, Esc menutup. Diubah ke 700px → jadi pop-up modal dan ketikan tetap ada.
- **Riwayat + Tanya AI** (`e2e/perbaikan-riwayat.mjs`): 1300px → satu panel, detail mengisi halaman dengan tombol kembali, Tanya ditutup → dua panel lagi; 1500px → tetap dua panel. Kartu bagian pecahan yang dibuka di 1024px ber-`aria-current`.
- **Seret foto:** lapisan tampil, struk dikirim ke antrean, snackbar "1 tercatat"; berkas teks ditolak.
- **Regresi:** E2E filter Riwayat dan kalender (360px) tetap lolos.
- `uji:*`, typecheck, `next build`.

Hasil 25 Okt: **semua cek lulus** (25 kombinasi lebar × halaman + 20 cek perilaku). Suite permanennya `e2e/lebar.mjs` (`npm run e2e -- lebar`); aksesibilitas di `e2e/a11y.mjs`, tempel gambar di `e2e/tempel.mjs`.

## Boundaries

- **Selalu:** tampilan HP < 600px tidak berubah sedikit pun, dan alamat yang ada tetap berlaku.
- **Tanya dulu:** mengubah alamat halaman, menambah dependensi, atau mengubah tampilan HP.
- **Jangan:** tata letak yang bergantung pada deteksi perangkat (user agent); pakai lebar layar saja.

## Catatan

- **Galaxy Z Fold** dibuka lebarnya sekitar 700–830dp, jadi masuk ukuran **sedang**: rail + satu kolom, sesuai panduan Samsung untuk Fold.
- **Tablet** tegak (≈ 800dp) memakai rail. Tablet mendatar (≈ 1280dp, mis. Galaxy Tab S) sudah melewati 1200px, jadi memakai sidebar. Ini sesuai Samsung (layar *expanded* boleh memakai drawer yang selalu terlihat) dan Material 3 (drawer untuk ≥ 1200dp).

## Belum diterapkan

- **Flex mode** (Fold setengah terlipat, konten di atas dan kontrol di bawah). Browser belum bisa mendeteksinya dengan andal: Viewport Segments API masih eksperimen. Aplikasi tetap tampil normal dalam posisi itu.
- **Tema terang.** Aplikasi hanya bertema gelap; tidak ada `prefers-color-scheme`.
