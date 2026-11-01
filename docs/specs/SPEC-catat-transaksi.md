# Spec: Sistem desain One UI (mobile first)

> Nama file lama (`SPEC-catat-transaksi`) dipertahankan supaya tautan tidak putus; isinya sistem desain One UI seluruh aplikasi. Alur mencatat ada di SPEC-catat-chat.

Status: **diterapkan** · rilis 1.0.0 (21 Okt 2026; navigasi 5 tab di 2.1.0, layar lebar di 2.2.0) · branch asal `feat/ui-oneui` · disinkronkan dengan kode 1 Nov 2026

## Objective

Iterasi 2 (21 Okt 2026): impor rekening koran dan halaman Rekening dihapus, alur tambah dibuat ketik-dulu, desain dipoles.

Rombak UI mengikuti [One UI Design Guidelines](https://developer.samsung.com/one-ui) dari Samsung. Panduan ini memang dibuat untuk aplikasi HP, cocok dengan aplikasi yang hampir selalu dibuka dari HP. Satu tombol **+** untuk mencatat, dan seluruh API dipakai ulang.

**Catatan:** Samsung tidak merilis pustaka komponen web untuk One UI. OneUI-CSS milik tim Samsung Internet tidak terawat (tanpa rilis, puluhan PR terbuka). Karena itu komponennya dibangun sendiri, tanpa framework UI, mengikuti panduan resminya: `src/components/oneui.tsx` (AppBar, Lembar, Konfirmasi, Field, Segmen, dll.), gaya di `src/components/ui.module.css`, token di `src/app/globals.css`.

## Prinsip dari panduan, dan penerapannya

| Panduan One UI | Penerapan |
|---|---|
| Layar dibagi **area tampilan** (atas) dan **area interaksi** (bawah), supaya kontrol terjangkau jempol | Tiap halaman dibuka dengan judul besar di tengah, tanpa tombol. Semua kontrol ada di bawahnya. |
| **App bar extended** mengecil saat di-scroll. Judul dinamis boleh berupa kalimat informasi penting. | `AppBar`: Beranda berjudul pengeluaran bulan ini (mis. "Rp 15.000"; diketuk membuka Analitik). Di bawah judul ada baris aksi (pola Voice Recorder & Telepon One UI 8). Saat di-scroll (IntersectionObserver), baris itu menempel di atas dan tombolnya jadi kapsul transparan yang melayang, dengan judul kecil di kapsul kiri. |
| Aksi app bar maksimal 3 | Detail transaksi: tombol kembali dan hapus saja (Edit ada di isi halaman). Kembali memakai riwayat browser bila ada, selain itu alamat cadangan. |
| **Navigasi bawah** | Kapsul melayang ala Samsung Wallet (One UI 8): **Beranda · Riwayat · + · Analitik · Profil** (SPEC-navigasi), ikon di atas label, tab aktif berlatar kapsul lebih terang dan ikonnya lebih tebal; Profil berupa huruf awal email. Titik oranye di tombol **+** kalau ada catatan belum selesai. |
| Primary `#0381fe` untuk aksi utama | Tombol **+** bulat di tengah kapsul navigasi, seperti tombol rekam di tengah bawah Voice Recorder. Tidak menutupi nominal yang rata kanan. Membuka lembar Catat dengan kolom ketik yang sudah fokus; Manual, galeri, dan kamera ada sebagai ikon di kolom itu (pola WhatsApp, SPEC-catat-chat). |
| **Dialog pilihan/konfirmasi di bawah layar**, info/progres di tengah | Semua form dan konfirmasi hapus berupa dialog bawah (`<dialog>` bawaan browser). Form yang sudah diubah bertanya "Buang perubahan?" saat ditutup. |
| Konten dikelompokkan dalam **focus block** membulat, dengan **subheader** | Blok bersudut 26px (`--radius-blok`). Subheader abu-abu ala Samsung Wallet dengan titik penuntun ke total ("Hari ini ······· −Rp 61.000"). Beranda: satu transaksi satu kartu, dikelompokkan makin kasar ke belakang (Hari ini, Kemarin, Minggu ini, nama bulan, tahun). Riwayat: per bulan, lalu per hari di dalamnya (SPEC-riwayat-filter). Kartu boleh berjudul di dalam ("Pengeluaran per kategori") dan ditutup aksi abu-abu di tengah ("Lihat semua riwayat"). |
| Daftar berkelompok dengan **ikon berwadah** | Ikon kategori dalam wadah berwarna tipis. Warnanya sama di daftar, bar komposisi, dan detail. |
| **Toast/snackbar** untuk kabar kecil, maksimal satu aksi | Kabar "Tercatat: …" ("Lihat"), "Transaksi dihapus" ("Urungkan"), dan antrean struk ("Lagi proses struk · sisa n") berupa snackbar; hilang sendiri setelah 6 detik. |
| Satu gaya tombol per layar. Tombol berujung bulat (18dp). | Tombol contained untuk aksi utama, tombol flat di dalam dialog. `--radius-tombol: 18px`. |
| Area luas tenang, warna cerah hanya untuk aksen | Tema gelap saja: latar `#000000`, blok `#171717`, biru hanya untuk aksi dan nilai aktif. |
| Gerak | `--gerak: cubic-bezier(0.22, 0.25, 0, 1)` (Basic Path Interpolator), ikut setelan "kurangi gerakan". |

Kontras: teks putih di atas `#3e91ff` (`--primer`) cuma 3:1, jadi tombol contained memakai `#0072de` (`--tombol`, primary dark versi tema terang) dengan rasio 4,9:1.

Menu ⋮ di Beranda (email & Keluar) sudah dihapus di 2.1.0; isinya pindah ke tab **Profil**.

## Layar lebar

Di bawah 600px: satu kolom selebar maksimal 600px (`--lebar-app`), margin samping 16px. Mulai 600px: navigation rail di kiri dan margin 24px; mulai 840px dua panel; mulai 1200px sidebar berlabel. Rinciannya di SPEC-layar-lebar.

## Commands

```
Dev:          npm run dev
Typecheck:    npx tsc --noEmit
Build:        npm run build
Uji validasi: npm run uji:validasi
Uji tanggal:  npm run uji:tanggal
Uji bundle:   npm run build:standalone && npm run uji:bundle
```

## Success Criteria

- [x] Tidak ada lagi dependensi framework UI. Yang tersisa hanya `lucide-react` untuk ikon.
- [x] Judul besar mengecil ke bilah atas saat di-scroll, tanpa hydration error.
- [x] Tombol + langsung membuka kolom ketik yang sudah fokus. Kamera, galeri, dan Manual bisa dibuka dari lembar yang sama.
- [x] Impor rekening koran dan halaman Rekening terhapus. Transaksi lama hasil impor tetap tampil.
- [x] "Hari ini" dan batas bulan dihitung dalam WIB, sama di server (UTC) maupun di HP.
- [x] Hapus transaksi dikonfirmasi lewat dialog bawah.
- [x] Tidak ada scroll horizontal di HP maupun layar lebar (dicek `e2e/a11y.mjs` dan `e2e/lebar.mjs`).
- [x] Login, lupa password, edit, keluar, dan filter riwayat tetap berfungsi. (Pendaftaran akun sendiri dihapus di 2.0.0.)

## Belum diterapkan

- Tema terang: aplikasi hanya punya tema gelap (`color-scheme: dark`).
