# Spec: Layar lebar — tablet, Fold, desktop (fase 5 SPEC-navigasi)

Status: **diterapkan** · 25 Oktober 2026 · branch `feat/layar-lebar`

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
| Rasio panel: **42 : 58** (600–959px), **38 : 62** (≥ 960px), Fold **50 : 50** | Dipakai untuk Riwayat dan Profil |
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

### Lebar (≥ 840px): tablet, laptop, PWA desktop

Rail tetap dipakai sampai 1199px. Mulai **1200px**, rail melebar jadi **sidebar** 240px: ikon di samping label, tombol "+ Catat transaksi" di atas, dan **Lend & Borrow** jadi item sendiri (seperti yang dijanjikan SPEC-navigasi). Di HP, Lend & Borrow tetap dibuka dari Profil.

Per halaman:

- **Beranda: grid dua kolom.**
  - Kiri: saldo, kantong, dan streak.
  - Kanan: perlu dibayar, peringatan budget, dan 5 transaksi terakhir.
  - Lebar isi maksimal 1200px.
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

  - Mengetuk transaksi membuka detailnya di panel kanan, dan barisnya diberi tanda terpilih. Daftar dan filter tidak hilang.
  - Alamatnya menjadi `/riwayat?…filter…&id=<transaksi>`, jadi bisa di-bookmark dan tombol back browser bekerja.
  - Sebelum ada yang dipilih, panel kanan berisi teks "Pilih transaksi untuk melihat detailnya".
  - Mengubah atau menghapus transaksi dilakukan dari panel kanan. Setelah dihapus, panel kembali kosong.
  - `/transactions/[id]` tetap ada dan tetap dipakai di HP, termasuk tautan dari Beranda dan notifikasi.
- **Analitik: grid dua kolom.**
  - Kiri: ringkasan bulan, sorotan, dan komposisi kategori.
  - Kanan: merchant teratas, tren, dan budget.
  - Navigasi bulan tetap di atas, selebar isi.
- **Profil: dua panel, menu + halaman.**
  - Kiri: kartu akun dan menu (Kantong, Kategori, Budget, Lend & Borrow, ekspor, dan lainnya).
  - Kanan: halaman yang dipilih (`/profil/kantong`, `/profil/budget`, dan seterusnya), dengan alamat sama seperti di HP.
  - Sebelum ada yang dipilih, panel kanan menampilkan Kantong.
- **Lend & Borrow** (`/pinjaman`): satu kolom seperti sekarang (maks 600px). Isinya daftar orang dan cicilan, yang tidak cocok dipecah dua.

Rasio dua panel (dari lebar isi di sebelah rail) mengikuti Samsung: **42 : 58** di bawah 960px, **38 : 62** mulai 960px. Jika layar hampir persegi (rasio lebar : tinggi ≤ 1,2), rasionya **50 : 50**.

### Lembar & pop-up (≥ 600px)

Mengikuti panduan "pop-up kecil untuk tugas singkat":

- **Lembar bawah** (pilih kantong, filter, konfirmasi) jadi **dialog di tengah**, maksimal 480px.
- **Lembar layar penuh** (Catat, Tanya AI, form pinjaman/kantong/kategori, ubah transaksi, kamera) jadi **pop-up besar di tengah**: maksimal 640px × 90% tinggi layar, dengan sudut membulat. Halaman di belakangnya tetap terlihat redup.
- Tombol **AI** tetap di kanan bawah Analitik, tetapi mengikuti tepi kanan isi, bukan tepi layar.
- **Tanya AI di layar lebar (≥ 840px): panel 400px yang menempel di kanan**, bukan pop-up. Panel ini non-modal: halaman Analitik di sebelahnya tetap bisa digulir dan dilihat, dan kartunya turun ke satu kolom kalau ruangnya tidak cukup untuk dua. Tombolnya × (tutup), dan Esc juga menutup. Di 600–839px Tanya AI tetap pop-up, di HP tetap layar penuh. Saat lebar berubah, dialog dibuka ulang dengan mode lain tanpa memasang ulang isinya, jadi obrolan dan ketikan tidak hilang.

### Seret foto struk

Di kolom Catat, gambar juga bisa **ditempel** (Ctrl+V): tangkapan layar atau gambar yang disalin jadi lampiran, sama seperti memilih dari galeri. Lembar Catat di layar lebar selebar pop-up besar (640px).

Foto struk bisa diseret dari File Explorer, Galeri (layar terpisah di tablet/Fold), atau aplikasi lain ke **mana saja** di aplikasi. Selama diseret, tampil lapisan "Lepas untuk mencatat struk". Fotonya diproses di latar persis seperti foto dari "Bagikan", lalu hasilnya dikabari lewat snackbar. Berkas yang bukan gambar ditolak dengan pesan singkat.

### Tombol & app bar (dicek ulang ke One UI Design Guidelines, 25 Okt)

- **App bar** (hlm. 16): tombol kembali paling kiri, judul di sebelahnya, tombol aksi di kanan (maks 3 termasuk judul), ⋮ paling kanan. Susunan ini sudah dipakai di semua lebar.
- **App bar besar** (hlm. 19): tidak dipakai di HP mendatar; di layar lain hanya kalau tingginya ≥ 580dp. Di bawah tinggi itu, area judul jadi ringkas: tetap tampil karena di detail transaksi judulnya adalah nominal, tetapi tanpa ruang setinggi sepertiga layar. Rail juga dirapatkan supaya semua tab muat.
- **Dua panel:** panel detail (Riwayat & Profil) tanpa tombol kembali, karena daftarnya terlihat di sebelah. Di layar sempit tombol kembali tetap ada.
- **Pop-up & panel samping:** tombol di kepala jadi × (tutup). Layar penuh di HP tetap ‹.
- **Detail dari luar Riwayat** (Beranda, snackbar "Lihat", notifikasi, Fold dibuka) di layar lebar langsung membuka dua panel Riwayat (`/riwayat?id=`). `/transactions/[id]` tetap dipakai di HP.

### Mouse & keyboard (desktop)

- Setiap elemen yang bisa diklik punya efek *hover* dan cincin fokus saat dinavigasi dengan Tab (`:focus-visible`). Efek hover hanya aktif di perangkat dengan mouse (`@media (hover: hover)`), jadi HP tidak terpengaruh.
- Esc menutup pop-up. Ini sudah bawaan `<dialog>`.
- Teks tidak diperbesar. Ukurannya tetap ukuran One UI yang sama dengan HP.

## Cara kerja (ringkas)

- **Media query CSS, bukan JavaScript.** Dengan begitu, saat Fold dibuka atau dilipat, React tidak memasang ulang halaman. Teks di Catat dan Tanya AI serta posisi gulir tetap ada. JavaScript (`matchMedia`) hanya dipakai di satu tempat: menentukan apakah ketukan transaksi di Riwayat membuka panel kanan atau halaman detail.
- **`NAVIGASI` tetap satu daftar.** Kapsul bawah, rail, dan sidebar memakai komponen yang sama dengan CSS berbeda. Lend & Borrow ditambahkan dengan penanda `sidebar: true`, sehingga hanya tampil di sidebar.
- **Riwayat dua panel.**
  - `riwayat/page.tsx` membaca `id`, lalu mengambil transaksinya dengan query yang sama seperti `/transactions/[id]` (dipindah ke satu fungsi bersama) dan menampilkan `DetailView` di panel kanan.
  - Di layar ringkas, kalau alamat berisi `id` (misalnya Fold dilipat saat detail terbuka), detail tampil penuh dan tombol kembalinya membuang `id`. Dengan begitu pengguna tetap di tempat yang sama.
  - Memilih transaksi hanya mengganti `?id=` lewat `history.pushState`, tanpa render ulang server. Detailnya diambil dari browser (`ambilDetail`, dipakai juga oleh `/transactions/[id]`), jadi daftar yang sudah "Muat lagi" dan posisi gulirnya tidak hilang.
- **Profil dua panel** lewat `profil/layout.tsx`: menu di kiri dan `children` di kanan. Di layar ringkas, menu hanya tampil di `/profil` itu sendiri.
- **Panel mana yang tampil di layar sempit** ditentukan CSS `:empty` / `:has()`: panel kanan yang kosong disembunyikan, dan kalau berisi, daftarnya yang disembunyikan.
- **Tidak ada perubahan database dan tidak ada dependensi baru.**

## Tidak dikerjakan

- **Flex mode** (Fold setengah terlipat, konten di atas dan kontrol di bawah). Browser belum bisa mendeteksinya dengan andal: Viewport Segments API masih eksperimen. Aplikasi tetap tampil normal dalam posisi itu.
- **Tema terang.** Tidak termasuk fase ini.

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
- **Seret foto:** lapisan tampil, struk dikirim ke antrean, snackbar "1 tercatat"; berkas teks ditolak.
- **Regresi:** E2E filter Riwayat dan kalender (360px) tetap lolos.
- `uji:*`, typecheck, `next build`.

Hasil 25 Okt: **semua cek lulus** (`e2e-lebar`: 25 kombinasi lebar × halaman + 20 cek perilaku).

## Boundaries

- **Selalu:** tampilan HP < 600px tidak berubah sedikit pun, dan alamat yang ada tetap berlaku.
- **Tanya dulu:** mengubah alamat halaman, menambah dependensi, atau mengubah tampilan HP.
- **Jangan:** tata letak yang bergantung pada deteksi perangkat (user agent); pakai lebar layar saja.

## Catatan

- **Galaxy Z Fold** dibuka lebarnya sekitar 700–830dp, jadi masuk ukuran **sedang**: rail + satu kolom, sesuai panduan Samsung untuk Fold.
- **Tablet** tegak (≈ 800dp) memakai rail. Tablet mendatar (≈ 1280dp, mis. Galaxy Tab S) sudah melewati 1200px, jadi memakai sidebar. Ini sesuai Samsung (layar *expanded* boleh memakai drawer yang selalu terlihat) dan Material 3 (drawer untuk ≥ 1200dp).
