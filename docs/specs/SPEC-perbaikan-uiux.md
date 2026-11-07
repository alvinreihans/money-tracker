# Spec: Perbaikan UI/UX layar baru (tinjauan ui-ux-pro-max)

Status: **disetujui** (user: "perbaiki semuanya", memakai usulan perbaikan dari tinjauan) · 7 November 2026 · branch `feat/impor-rekening` · ikut rilis 2.12.0

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

## Belum diterapkan

Seluruh spec ini (sedang dikerjakan).
