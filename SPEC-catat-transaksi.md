# Spec: UI One UI (mobile first)

Status: **selesai, menunggu uji di perangkat asli** (21 Okt 2026). Branch: `feat/ui-oneui`, dibuat dari `feat/ui-primer`.
Varian lain: Cloudscape (`feat/catat-teks-manual`) dan Primer (`feat/ui-primer`).

## Objective

Rombak UI mengikuti [One UI Design Guidelines](https://developer.samsung.com/one-ui) dari Samsung. Panduan ini memang dibuat untuk aplikasi HP, cocok dengan aplikasi yang hampir selalu dibuka dari HP. Alur dan backend dari varian Primer dipakai ulang: satu tombol **+**, antrean struk di tingkat aplikasi, dan seluruh API.

**Catatan:** Samsung tidak merilis pustaka komponen web untuk One UI. OneUI-CSS milik tim Samsung Internet tidak terawat (tanpa rilis, puluhan PR terbuka). Karena itu komponennya dibangun sendiri, tanpa framework UI, mengikuti panduan resminya.

## Prinsip dari panduan, dan penerapannya

| Panduan One UI | Penerapan |
|---|---|
| Layar dibagi **area tampilan** (atas) dan **area interaksi** (bawah), supaya kontrol terjangkau jempol | Tiap halaman dibuka dengan judul besar di tengah, tanpa tombol. Semua kontrol ada di bawahnya. |
| **App bar extended** mengecil saat di-scroll. Judul dinamis boleh berupa kalimat informasi penting. | Beranda: judulnya pengeluaran bulan ini (mis. "Rp 15.000"). Saat di-scroll, judul kecil muncul di bilah atas. |
| Aksi app bar maksimal 3 | Detail: tombol kembali dan hapus saja. |
| **Navigasi bawah** berupa tab teks, sebaiknya kurang dari 4 | Beranda · Riwayat · Rekening, teks saja. Titik merah kalau ada draft. |
| Primary `#0381fe` dipakai untuk **FAB** | Tombol **+** melayang di kanan bawah (Beranda dan Riwayat). Membuka dialog pilihan di bawah layar. |
| **Dialog pilihan/konfirmasi di bawah layar**, info/progres di tengah | Semua form dan konfirmasi hapus berupa dialog bawah (`<dialog>` bawaan browser). |
| Konten dikelompokkan dalam **focus block** membulat, dengan **subheader** | Blok bersudut 26px. Riwayat dikelompokkan per tanggal dengan subheader. |
| **Toast/snackbar** untuk kabar kecil, maksimal satu aksi | Kabar "Tercatat" dan status antrean struk berupa snackbar dengan satu aksi ("Lihat"). |
| Satu gaya tombol per layar. Tombol berujung bulat (18dp). | Tombol contained untuk aksi utama, tombol flat di dalam dialog. |
| Area luas tenang, warna cerah hanya untuk aksen | Latar hitam pekat, blok abu gelap, biru hanya untuk aksi dan nilai aktif. |
| Keluar akun dan pengaturan sebagai daftar | "Keluar" jadi baris di halaman Rekening, bukan tersembunyi di menu. |

Kontras: teks putih di atas `#3e91ff` cuma 3:1, jadi tombol contained memakai `#0072de` (primary dark versi tema terang) dengan rasio 4,9:1.

## Layar lebar

Satu kolom selebar maksimal 600px di tengah. Navigasi bawah dan FAB ikut kolom itu. Tata letak khusus layar lebar (navigation rail) belum dibuat.

## Commands

```
Dev:          npm run dev
Typecheck:    npx tsc --noEmit
Build:        npm run build
Uji validasi: npm run uji:validasi
Uji bundle:   npm run build:standalone && npm run uji:bundle
```

## Success Criteria

- [ ] Tidak ada lagi dependensi framework UI. Yang tersisa hanya `lucide-react` untuk ikon.
- [ ] Judul besar mengecil ke bilah atas saat di-scroll, tanpa hydration error.
- [ ] FAB membuka dialog pilihan di bawah layar. Keenam cara mencatat berfungsi.
- [ ] Hapus transaksi dikonfirmasi lewat dialog bawah.
- [ ] Tidak ada scroll horizontal di 375px maupun 1280px.
- [ ] Login, daftar, lupa password, edit, kelola rekening, keluar, dan filter riwayat tetap berfungsi.
