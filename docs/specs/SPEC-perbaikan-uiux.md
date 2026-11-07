# Spec: Perbaikan UI/UX layar baru (tinjauan ui-ux-pro-max)

Status: **diterapkan · rilis 2.12.0** (disetujui user: "perbaiki semuanya", memakai usulan perbaikan dari tinjauan) · 7 November 2026 · branch `feat/impor-rekening` · ikut rilis 2.12.0

Tinjauan layar baru (impor rekening koran, Lengkapi, unggah banyak, Perlu dilengkapi, Simpanan/deposito) dengan daftar periksa ui-ux-pro-max (Quick Reference: aksesibilitas, sentuh, tata letak, tipografi & warna, form & umpan balik, navigasi), di 390 / 900 / 1300 px dengan data buatan. Tidak ada temuan kritis. Yang sudah baik tetap: tanpa scroll samping, dialog berlabel, ring fokus, `role=alert` pada galat, spinner & tombol nonaktif saat menyimpan, Urungkan.

## Perilaku yang diharapkan

### Tinggi

| # | Layar | Masalah | Diharapkan |
|---|---|---|---|
| 1 | Kartu Lengkapi | Checkbox "Ganti kategori ke …" 24 px; pilihan "Ada 2 transaksi yang cocok" berdempet | Baris pilihan (checkbox/radio) di kartu hasil ≥ 48 px dengan jarak & garis pemisah yang tidak menempel teks. |
| 2 | Form Simpanan (HP) | Fokus pada segmen "Ya, sudah / Belum" tertutup bilah Batal/Simpan | Isi lembar menyisakan ruang di bawah setinggi bilah tombol (`scroll-padding-bottom`), jadi elemen yang difokus/diketuk tidak pernah tertutup. Berlaku untuk semua lembar berbilah tombol. |
| 3 | Isi bunga diterima / Cairkan | Isian kosong langsung tersimpan Rp 0 dan tampil sebagai sukses | Isian kosong → galat di bawah isian "Isi nominalnya, boleh Rp 0." Hasil yang berselisih dengan perhitungan tampil sebagai **peringatan** (ikon & warna peringatan), sama persis tetap sukses. Hasil evaluasi bisa **diurungkan** dari pesan hasilnya. |

### Sedang

| # | Layar | Diharapkan |
|---|---|---|
| 4 | Pratinjau impor | Saldo yang **tidak sama** dengan bank tampil sebagai peringatan (ikon + warna) dengan tawaran "Samakan saldo awal…" tepat di bawahnya; yang sama tetap teks biasa. |
| 5 | Snackbar | Tombol aksi kontras ≥ 4,5:1 terhadap latar snackbar (latar memakai token, bukan warna keras) dan area sentuh ≥ 44 px. |
| 6 | Lembar "Hasil unggah" | Tombol Urungkan selebar isinya; keterangan perubahan memakai sisa lebar baris. |
| 7 | Form Simpanan | Segmen, chip tenor, dan label pertanyaan memakai jarak tepi yang sama dengan isian lain (pola form yang ada, mis. form pinjaman). |
| 8 | Tombol segmen & pilihan jawab | Area sentuh ≥ 44 px untuk `.segmen button`, tombol pilihan jawab di obrolan ("Lengkapi yang sudah ada", "Ya, catat lagi", "Bukan, buang", "Cek sekarang"), dan tombol di gelembung "Sudah dilengkapi" (Urungkan, Lihat) — boleh lewat perluasan area sentuh seperti `.chip`. |
| 9 | Kartu Lengkapi | Hierarki aksi: **Lengkapi** tombol utama, **Catat sebagai baru** sekunder, **Batal** netral; tidak ada satu tombol yang turun sendirian ke baris kedua di 390 px. |
| 10 | Riwayat (HP) | Chip filter aktif (mis. "Perlu dilengkapi · n") selalu terlihat saat halaman dibuka (digulir ke dalam pandangan atau ditaruh paling depan). |
| 11 | Pratinjau impor, "Mungkin sudah tercatat" | Kandidat ditampilkan sebagai daftar pilihan (radio) yang membungkus teks, dengan jam di depan; bukan `<select>` yang memotong teks. Memakai token radius isian. |

### Pola seluruh aplikasi

| # | Diharapkan |
|---|---|
| 12 | **Tombol/gestur kembali menutup lembar paling atas lebih dulu**, bukan meninggalkan halaman: tiap lembar yang terbuka menambah satu entri riwayat; kembali → lembar tertutup (bila isiannya berubah, konfirmasi "buang perubahan?" yang sudah ada muncul, dan Batal di konfirmasi itu membiarkan lembar tetap terbuka). Menutup lembar lewat tombol/Esc/ketuk luar tidak meninggalkan entri riwayat sisa. Perilaku kembali yang sudah diuji (`e2e/kembali.mjs`, SPEC-navigasi) tetap. |

### Rendah

| # | Diharapkan |
|---|---|
| 13 | Judul kartu "Lengkapi transaksi ini?" memakai warna netral/primer, bukan warna sukses. |
| 14 | Saat Lengkapi diproses, kartu menampilkan "Melengkapi…" dengan `role="status"`. |
| 15 | Lencana "Perlu dilengkapi": ikon + teks 13 px dengan latar peringatan tipis; tetap terlihat di baris terpilih (panel 1300 px). |
| 16 | Nominal negatif di pratinjau impor memakai tanda minus yang sama dengan daftar transaksi ("−Rp"). |
| 17 | Judul bagian di lembar pratinjau impor & hasil unggah memakai heading (`h3`) di bawah judul lembar. |
| 18 | Profil → Kantong (HP): nama simpanan anak boleh dua baris; rincian di baris induk diringkas bila anaknya sudah tampil menjorok di bawahnya. |
| 19 | Form deposito: pratinjau bunga dekat isian tenor (terlihat saat mengisi); pajak masuk bagian "Lanjutan" yang terlipat. |
| 20 | Sesudah membuat/mengubah simpanan muncul snackbar sukses; catatan "Perlu dilengkapi" di detail transaksi juga menyebut bisa dilengkapi dengan mengunggah struk/screenshot. |
| 21 | Tombol "Catat transaksi" di rail/sidebar: teks putih di atas warna tombol dengan kontras ≥ 4,5:1 (token `--tombol`). |

## Pengujian

- **E2E**: suite yang menyentuh layar ini mendapat cek baru — ukuran area sentuh (#1, #5, #8), elemen terfokus tidak tertutup bilah (#2), isian bunga kosong ditolak & selisih = peringatan & bisa diurungkan (#3), chip aktif terlihat (#10), kembali menutup lembar & konfirmasi buang perubahan (#12), kontras snackbar & tombol rail (#5, #21). Suite `a11y` diperluas bila cocok.
- `npm run e2e` penuh, `uji:*`, `tsc`, `eslint` tetap lulus; suite `kembali` tidak berubah perilakunya.
- Tinjauan ulang singkat dengan skrip audit yang sama (kontras, area sentuh, fokus tertutup) di 390 & 1300 px.

## Keputusan saat implementasi

- **#2** `scroll-padding-bottom` setinggi ruang kapsul (100px + safe area) di badan lembar ber-`pil`; berlaku untuk semua lembar berkapsul.
- **#3** Urungkan butuh database: migrasi `20261114000000_urungkan_deposito.sql` menambah `deposito_periode.transaksi_tutup` (id transaksi bunga/pencairan yang dibuat saat periode ditutup) dan RPC `urungkan_tutup_periode`. Hanya periode yang ditutup sesudah migrasi ini yang bisa diurungkan, dan hanya selama periode perpanjangannya belum dicek. Di detail deposito, Urungkan menutup lembarnya (isinya sudah usang). Selisih dihitung per rupiah (dibulatkan); pencairan sebelum jatuh tempo tidak punya "perhitungan", jadi selalu sukses.
- **#5** Latar snackbar `--blok-2` (#252525): tombol aksi `--primer` 4,9:1 (dulu 4,27:1 di atas #2f2f2f); tombol aksi 48px, padding snackbar disesuaikan supaya tingginya tetap ±52px.
- **#8** Lewat perluasan area sentuh `::after` seperti `.chip`: segmen 40 → 48px (sampai tepi segmen), pilihan jawab 36 → 44px (tepat mengisi celah 8px antarbaris, tanpa bertumpuk).
- **#9** Lengkapi jadi tombol berisi warna selebar kartu di baris pertama; Batal (netral) dan Catat sebagai baru (flat) sebaris di bawahnya — di 360–1300px tidak ada tombol yang sendirian di baris kedua.
- **#10** Chip aktif paling kanan digeser ke dalam pandangan saat filter berubah (urutan chip tetap, tidak dipindah ke depan).
- **#11** `<select>` diganti daftar `BarisPilih` (radio) + "Bukan, catat sebagai baru"; tidak ada lagi isian berbentuk kotak, jadi token radius isian tidak dipakai di sana. Label kandidat dibentuk di server: jam · merchant · tanggal (hanya bila beda hari dengan baris bank).
- **#12** `src/lib/riwayat-lembar.ts`, dipakai `Lembar` dan lembar Catat (obrolan, "kembali" bertingkatnya: obrolan → daftar → tutup). Panel samping non-modal di layar lebar (Tanya AI ≥ 840px) tidak didaftarkan: ia bertahan saat pindah halaman, dan tombol Kembali halaman di sebelahnya tetap memindah halaman (SPEC-perbaikan-temuan G1); di bawah 840px (modal) ia didaftarkan seperti lembar lain. Menutup lewat tombol/Esc/ketuk luar **tidak** memakai `history.go(-1)`: traversal membatalkan `router.push` yang berjalan bersamaan (lembar aksi Tujuan → "Lihat riwayat" tidak jadi pindah). Sebagai gantinya entri sekarang diberi kedalaman baru dan entri lembar di bawahnya ditandai mati; kembali/maju ke entri mati langsung dilewati. Popstate antarentri halaman yang sama ditelan sebelum sampai ke Next.js (listener capture + `stopImmediatePropagation`); `router.replace`/refresh selama lembar terbuka mempertahankan penandanya. Batas: tanda "mati" hidup di memori — sesudah muat ulang, entri sisa bisa butuh satu ketukan kembali tambahan; maju ke entri lembar yang sudah ditutup tidak membukanya lagi.
- **#13** Judul kartu memakai `--primer` (kelas `.tanyaKartu`), bukan `--sukses`.
- **#15** Ikon `ClipboardPen` (sama dengan chip Riwayat), teks & ikon `--peringatan` di atas `color-mix(--peringatan 16%)`; lencana "Belum selesai" tidak berubah.
- **#16** Pembantu `rp()` lokal di pratinjau impor ("−Rp", sama dengan daftar transaksi).
- **#17** Kelas `.judulBagian` (h3 16px tebal) untuk judul bagian di focus block lembar: pertanyaan kantong, nama rekening, "Mungkin sudah tercatat", dan bagian Hasil unggah.
- **#18** Hanya Profil → Kantong: "Saldo sendiri Rp 500.000 · 1 simpanan, 1 tujuan"; Beranda tetap rincian lengkap karena isinya tidak tampil terpisah di sana.
- **#19** "Lanjutan" berupa baris yang bisa dibuka (`aria-expanded`), menampilkan nilai pajaknya sekarang; terbuka sendiri bila pajak salah isi.
- **#20** Snackbar "Deposito “Nama” dibuat di BCA." / "Simpanan “Nama” diubah."; catatan detail: "Lengkapi dengan mengunggah struk atau screenshot pembayarannya di Catat, atau lewat Edit transaksi di bawah."
- **#21** Hanya tombol berlabel di sidebar (≥ 1200px) yang memakai `--tombol` (4,7:1, dulu `--fab` 3,77:1); tombol + bulat (ikon saja) tetap `--fab`.

## Belum diterapkan

Tidak ada.
