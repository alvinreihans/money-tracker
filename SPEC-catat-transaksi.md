# Spec: UI One UI (mobile first)

Status: **selesai, menunggu uji di perangkat asli** (21 Okt 2026). Branch: `feat/ui-oneui`, dibuat dari `feat/ui-primer`.
Varian lain: Cloudscape (`feat/catat-teks-manual`) dan Primer (`feat/ui-primer`).

## Objective

Iterasi 2 (21 Okt 2026): impor rekening koran dan halaman Rekening dihapus, alur tambah dibuat ketik-dulu, desain dipoles.

Rombak UI mengikuti [One UI Design Guidelines](https://developer.samsung.com/one-ui) dari Samsung. Panduan ini memang dibuat untuk aplikasi HP, cocok dengan aplikasi yang hampir selalu dibuka dari HP. Alur dan backend dari varian Primer dipakai ulang: satu tombol **+**, antrean struk di tingkat aplikasi, dan seluruh API.

**Catatan:** Samsung tidak merilis pustaka komponen web untuk One UI. OneUI-CSS milik tim Samsung Internet tidak terawat (tanpa rilis, puluhan PR terbuka). Karena itu komponennya dibangun sendiri, tanpa framework UI, mengikuti panduan resminya.

## Prinsip dari panduan, dan penerapannya

| Panduan One UI | Penerapan |
|---|---|
| Layar dibagi **area tampilan** (atas) dan **area interaksi** (bawah), supaya kontrol terjangkau jempol | Tiap halaman dibuka dengan judul besar di tengah, tanpa tombol. Semua kontrol ada di bawahnya. |
| **App bar extended** mengecil saat di-scroll. Judul dinamis boleh berupa kalimat informasi penting. | Beranda: judulnya pengeluaran bulan ini (mis. "Rp 15.000"). Saat di-scroll, judul kecil muncul di bilah atas. |
| Aksi app bar maksimal 3 | Detail: tombol kembali dan hapus saja. |
| **Navigasi bawah** sebaiknya kurang dari 4 tab | Kapsul melayang ala Samsung Wallet (One UI 8): ikon di atas label, tab aktif berlatar kapsul lebih terang. Titik oranye di ikon Riwayat kalau ada draft. |
| Primary `#0381fe` dipakai untuk **FAB** | Tombol **+** melayang di kanan bawah (Beranda dan Riwayat). Langsung membuka sheet berisi kolom ketik yang sudah fokus ("beli makan di warteg 20k shopeepay" lalu kirim). Pintasan Kamera, Galeri, dan Manual ada di atas kolomnya. |
| **Dialog pilihan/konfirmasi di bawah layar**, info/progres di tengah | Semua form dan konfirmasi hapus berupa dialog bawah (`<dialog>` bawaan browser). |
| Konten dikelompokkan dalam **focus block** membulat, dengan **subheader** | Blok bersudut 26px. Subheader abu-abu ala Samsung Wallet. Semua daftar dikelompokkan per hari ("Hari ini ······· −Rp 61.000", dengan titik penuntun ke total pengeluaran hari itu). Garis antarbaris menjorok sejajar teks. Kartu boleh berjudul di dalam ("Pengeluaran per kategori") dan ditutup aksi abu-abu di tengah ("Lihat semua riwayat"). |
| Daftar berkelompok dengan **ikon berwadah** | Ikon kategori dalam wadah berwarna tipis. Warnanya sama di daftar, bar komposisi, dan detail. |
| **Toast/snackbar** untuk kabar kecil, maksimal satu aksi | Kabar "Tercatat" dan status antrean struk berupa snackbar dengan satu aksi ("Lihat"). |
| Satu gaya tombol per layar. Tombol berujung bulat (18dp). | Tombol contained untuk aksi utama, tombol flat di dalam dialog. |
| Area luas tenang, warna cerah hanya untuk aksen | Latar hitam pekat, blok abu gelap, biru hanya untuk aksi dan nilai aktif. |
| **Menu lainnya (⋮)** di ujung kanan app bar untuk aksi tambahan | Email dan "Keluar" ada di menu ⋮ Beranda (Popover API bawaan). |

Kontras: teks putih di atas `#3e91ff` cuma 3:1, jadi tombol contained memakai `#0072de` (primary dark versi tema terang) dengan rasio 4,9:1.

## Layar lebar

Satu kolom selebar maksimal 600px di tengah. Navigasi bawah dan FAB ikut kolom itu. Tata letak khusus layar lebar (navigation rail) belum dibuat.

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

- [ ] Tidak ada lagi dependensi framework UI. Yang tersisa hanya `lucide-react` untuk ikon.
- [ ] Judul besar mengecil ke bilah atas saat di-scroll, tanpa hydration error.
- [ ] FAB langsung membuka kolom ketik yang sudah fokus. Kamera, Galeri, dan Manual bisa dibuka dari sheet yang sama.
- [ ] Impor rekening koran dan halaman Rekening terhapus. Transaksi lama hasil impor tetap tampil.
- [ ] "Hari ini" dan batas bulan dihitung dalam WIB, sama di server (UTC) maupun di HP.
- [ ] Hapus transaksi dikonfirmasi lewat dialog bawah.
- [ ] Tidak ada scroll horizontal di 375px maupun 1280px.
- [ ] Login, daftar, lupa password, edit, keluar, dan filter riwayat tetap berfungsi.
