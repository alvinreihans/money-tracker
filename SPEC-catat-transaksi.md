# Spec: UI Primer + alur "+" untuk mencatat transaksi

Status: **selesai, menunggu uji di perangkat asli** (21 Okt 2026). Branch: `feat/ui-primer`, dibuat dari `feat/catat-teks-manual` (varian Cloudscape).

## Objective

1. **Rombak seluruh UI ke [Primer](https://primer.style/)** (design system GitHub). Kalau ada pilihan desain, condongkan ke pola dan komponen Primer.
2. **Rancang ulang alur mencatat.** Semua cara mencatat dikumpulkan di satu tombol **+**, mengikuti pola tombol "+" di header GitHub.
3. Backend dari varian Cloudscape dipakai apa adanya: `/api/catat-teks`, `/api/catat-manual`, `validasiTransaksi`, sumber `"text"`, dan anti-dobel rekening koran.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Shell | `Header` gelap ala GitHub: logo, tombol **+**, dan menu akun. Di bawahnya `UnderlineNav`: Beranda / Riwayat (counter draft) / Rekening. | Pola halaman repo GitHub. Navigasi selalu terlihat, satu tap, juga di HP. |
| Tema | `data-color-mode="dark"`, tema `dark` dari `@primer/primitives` | Aplikasi sebelumnya gelap. Atribut dipasang di server, jadi tidak berkedip. |
| Mencatat | Tombol **+** (di header dan di judul Beranda) membuka `ActionMenu` dengan grup: **Dari struk** (Foto, Upload gambar), **Catat sendiri** (Ketik cepat, Pengeluaran, Pemasukan), **Impor** (Rekening koran PDF). | Satu pintu untuk semua cara mencatat. Pemasukan jadi pilihan yang terlihat jelas, tidak tersembunyi di dropdown jenis. Beranda jadi lebih ringkas. |
| Form | `Dialog` yang muncul sebagai bottom sheet di HP (`position={{ narrow: "bottom" }}`) | Jempol tidak perlu menjangkau tengah layar. |
| Antrean struk | Disimpan di provider. Dialog boleh ditutup lalu dibuka lagi. | Proses OCR bisa puluhan detik. Menutup dialog tidak membuang antrean. |
| Kabar sukses | `Banner` sukses di atas konten, dengan tautan "Lihat" | Primer tidak punya toast. |
| Chart | `ProgressBar` multi-segmen + legenda (seperti bar bahasa di halaman repo GitHub) | Primer tidak punya chart. Ini pola visual GitHub sendiri, dan terbaca di layar sempit. |
| Daftar transaksi | Daftar baris dalam kotak berbingkai (seperti daftar issue GitHub), dengan `Label` jenis | Tabel memaksa scroll horizontal di HP. |
| Kosong | `Blankslate` | Pola Primer. |
| Hapus | `useConfirm` | Konfirmasi bawaan Primer. |
| Tanggal | `<TextInput type="date">` | Primer tidak punya date picker. Input tanggal bawaan HP lebih nyaman. |
| Styling | Satu CSS Module memakai token `@primer/primitives` | Primer v38 tidak lagi memakai `sx`. |
| Render | SSR penuh | Komponen Primer tidak bergantung lebar layar untuk render pertama. Dicek lewat log hydration. |

## Commands

```
Dev:          npm run dev
Typecheck:    npx tsc --noEmit
Build:        npm run build
Uji validasi: npm run uji:validasi
Uji bundle:   npm run build:standalone && npm run uji:bundle
```

## Success Criteria

- [ ] Semua halaman memakai Primer. Cloudscape tidak lagi ada di dependensi.
- [ ] Tombol **+** bisa dibuka dari semua halaman yang butuh login. Keenam opsinya berfungsi.
- [ ] "Pemasukan" membuka form dengan jenis Masuk sudah terpilih.
- [ ] Menutup dialog struk saat antrean sedang diproses tidak membatalkan prosesnya.
- [ ] Tidak ada hydration error dan tidak ada scroll horizontal di 375px maupun 1280px.
- [ ] Login, daftar, lupa password, edit, hapus, kelola rekening, dan filter riwayat tetap berfungsi.
