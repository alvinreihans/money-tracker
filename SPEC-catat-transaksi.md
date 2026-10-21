# Spec: UI Cloudscape + catat transaksi lewat teks dan isian manual

Status: **selesai, menunggu uji di perangkat asli** (21 Okt 2026)

## Objective

1. **Rombak seluruh UI ke [Cloudscape](https://cloudscape.design/).** Kalau ada pilihan desain, condongkan ke pola dan komponen Cloudscape. Recharts diganti chart Cloudscape, Tailwind dan komponen buatan sendiri dilepas.
2. **Tambah dua cara mencatat dari web**, untuk transaksi yang tidak punya struk:
   - **Ketik teks bebas**, misalnya `kopi 25rb gopay`. Diproses dengan `processReceiptText` (Groq), pipeline yang sama dengan bot Telegram.
   - **Isi manual** lewat form. Tanpa AI, langsung tersimpan `confirmed`.

**User:** pemilik akun yang mencatat transaksi harian, kebanyakan dari HP.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Shell | `TopNavigation` + `AppLayout` + `SideNavigation` | Pola app Cloudscape. Di HP, navigasi otomatis jadi menu hamburger. Keluar akun ada di menu user. |
| Tema | Dark mode (`awsui-dark-mode` di `<body>`, dipasang dari server), visual refresh, warna bawaan Cloudscape | Aplikasi sebelumnya gelap. Class dipasang dari server supaya tidak berkedip terang. |
| Bahasa | `I18nProvider` dengan pesan bawaan `id` | Label bawaan komponen (DatePicker, FileUpload, Table) otomatis berbahasa Indonesia. |
| Catat transaksi | Satu `Container` dengan `Tabs`: **Foto struk** (default) / **Ketik** / **Isi manual** | Tab foto tetap terbuka tanpa tap tambahan, karena itu aksi harian. Dua opsi baru cukup satu tap. |
| Pilih gambar / PDF | `FileUpload` | Komponen bawaan Cloudscape. |
| Daftar transaksi | `Table` | Tabel Cloudscape, kolom nominal rata kanan. |
| Chart | `PieChart` donut, total rerata di tengah | Yang ditanyakan "uangku habis ke mana", yaitu porsi per kategori. Versi batang sempat dicoba, tapi label sumbunya terpotong jadi "..." di HP. Data diambil di server. |
| Render | Konten aplikasi baru dirender setelah terpasang di browser (spinner sebelumnya). Login dan reset password tetap SSR. | `AppLayout`, `Table`, dan chart membaca lebar layar di render pertama. Kalau di-SSR, hydration gagal di HP dan menu samping menutupi layar sampai JS siap. |
| Konfirmasi hapus | `Modal` | Menggantikan `ConfirmDialog` buatan sendiri. |
| Kamera | `Modal` berisi `<video>` | Logika `getUserMedia` dipertahankan. |
| Sumber transaksi | Teks dan manual disimpan `source = "text"` ("Diketik manual"). Teks dari bot Telegram ikut dibenahi. | Sebelumnya teks Telegram tercatat sebagai "Foto struk". |
| Anti-dobel | `"text"` ikut dicocokkan saat impor rekening koran. Penyimpanan lewat `insertFromImage`. | Transaksi non-tunai yang diketik tidak tercatat dua kali. |
| Skema DB | Tidak berubah | `source` bertipe `text` tanpa constraint. |

## Commands

```
Dev:          npm run dev
Typecheck:    npx tsc --noEmit
Build:        npm run build
Uji validasi: npm run uji:validasi
Uji bundle:   npm run uji:bundle
```

## Project Structure

```
src/components/ui.tsx                 → re-export komponen Cloudscape ("use client") + NavLink/NavButton
src/components/AppShell.tsx           → TopNavigation + AppLayout + SideNavigation
src/components/CatatTransaksi.tsx     → Tabs: foto / ketik / manual
src/components/TransactionFields.tsx  → field form bersama (tambah manual & edit)
src/lib/transaksi-input.ts            → validasi input transaksi (dipakai server & browser)
src/app/api/catat-teks/route.ts       → POST { text }
src/app/api/catat-manual/route.ts     → POST field transaksi
scripts/uji-validasi.mts              → uji assert untuk validasi
```

## Testing Strategy

- `npm run uji:validasi`: assert untuk `validasiTransaksi` (kasus sah dan tidak sah).
- `curl` ke kedua route: tanpa login harus 401, input tidak sah harus 400.
- `npx tsc --noEmit`, `npm run build`, dan `npm run uji:bundle` lolos.
- Cek manual di browser, termasuk lebar HP.

## Boundaries

- **Always:** validasi input di server; `user_id` diambil dari session server; branch fitur, lalu PR.
- **Ask first:** perubahan skema DB, perubahan prompt atau pipeline Groq.
- **Never:** commit langsung ke `main`; menyimpan secret di kode.

## Success Criteria

- [ ] Semua halaman (beranda, riwayat, rekening, detail, login, reset password) memakai komponen Cloudscape. Tailwind dan Recharts terhapus dari dependensi.
- [ ] Tab **Ketik**: `kopi 25rb gopay` menghasilkan transaksi Rp25.000, keluar, sumber "Diketik manual".
- [ ] Kalau Groq gagal, transaksi tersimpan sebagai draft dan peringatan "perlu dibenerin" muncul.
- [ ] Tab **Isi manual** menyimpan transaksi `confirmed` yang langsung ikut dihitung di ringkasan bulan ini.
- [ ] Input tidak sah (nominal ≤ 0, tanggal salah, teks kosong) ditolak dengan pesan jelas, di browser maupun di server.
- [ ] Foto struk (kamera dan galeri), impor rekening koran, edit, hapus, kelola rekening, login, daftar, dan lupa password tetap berfungsi.
- [ ] Tidak ada scroll horizontal di level halaman pada lebar 375px.
