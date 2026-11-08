# Spec fitur

Satu spec per fitur atau fase, nama file `SPEC-<topik>.md`. Riwayat rilis ada di
[CHANGELOG](../../CHANGELOG.md); desain pipeline ekstraksi di [FALLBACK](../../FALLBACK.md).

**Spec adalah acuan.** Semua spec disinkronkan dengan kode 2.9.0 pada 1 November 2026.
Sejak itu, perubahan perilaku ditulis di spec dulu, lalu kode mengikutinya. Kalau
kode dan spec berbeda, anggap itu bug sampai diputuskan lain.

Bagian **Belum diterapkan** di akhir spec berisi rencana yang belum ada di kode.

## Indeks

| Spec | Isi | Status |
|---|---|---|
| [catat-transaksi](SPEC-catat-transaksi.md) | Sistem desain One UI, mobile first (nama file warisan) | diterapkan, 1.0.0 |
| [analitik](SPEC-analitik.md) | Analitik, kantong, budget, kategori (sebagian digantikan navigasi, analitik-insight, saldo-waktu, normalisasi) | diterapkan, 2.0.0 |
| [lend-borrow](SPEC-lend-borrow.md) | Utang & Piutang, cicilan, kartu kredit | diterapkan, 2.0.0 |
| [enkripsi](SPEC-enkripsi.md) | Enkripsi merchant, keterangan, teks OCR | diterapkan, 2.0.0 |
| [notifikasi](SPEC-notifikasi.md) | Push notifikasi harian | diterapkan, 2.0.0 (pengingat draft 2.1.0) |
| [navigasi](SPEC-navigasi.md) | 5 tab: Beranda · Riwayat · + · Analitik · Profil | diterapkan, 2.1.0 |
| [riwayat-filter](SPEC-riwayat-filter.md) | Filter Riwayat (fase 2 navigasi) | diterapkan, 2.1.0 |
| [analitik-insight](SPEC-analitik-insight.md) | Analitik per bulan: sorotan, kategori, merchant (fase 3 navigasi) | diterapkan, 2.1.0 |
| [analitik-ai](SPEC-analitik-ai.md) | Tanya AI (fase 4 navigasi) | diterapkan, 2.1.0 (panel lebar 2.2.0) |
| [catat-chat](SPEC-catat-chat.md) | Catat sebagai obrolan & Belum selesai | diterapkan, 2.1.0 |
| [catat-andal](SPEC-catat-andal.md) | Gemini dulu, gambar dikompres, deteksi duplikat | diterapkan, 2.1.0 |
| [paylater](SPEC-paylater.md) | Paylater = cicilan, bayar lebih awal | diterapkan, 2.1.0 |
| [saldo-waktu](SPEC-saldo-waktu.md) | Saldo per jam, bukan cuma tanggal | diterapkan, 2.1.0 |
| [layar-lebar](SPEC-layar-lebar.md) | Tablet, Fold, desktop (fase 5 navigasi) | diterapkan, 2.2.0 (+2.3.0) |
| [catat-tuntas](SPEC-catat-tuntas.md) | Arah bukti transfer, simpan ketikan, Urungkan hapus (fase 1) | diterapkan, 2.4.0 |
| [cerita-tanya](SPEC-cerita-tanya.md) | Cerita di transaksi & Tanya AI dari Beranda (fase 2) | diterapkan, 2.4.0 |
| [metode-budget](SPEC-metode-budget.md) | Metode 50/30/20 dkk, kelompok, pecah transaksi (fase 3) | diterapkan, 2.5.0 |
| [tujuan-tabungan](SPEC-tujuan-tabungan.md) | Penghasilan & tujuan tabungan | diterapkan, 2.5.0 |
| [ingat-kategori](SPEC-ingat-kategori.md) | Kategori diingat per merchant | diterapkan, 2.6.0 |
| [normalisasi](SPEC-normalisasi.md) | FK kategori, indeks, `updated_at`, isolasi rujukan | diterapkan, 2.7.0 (isolasi 2.8.1) |
| [PETA-fase4](PETA-fase4.md) | Peta fase 4: urutan modul & migrasi | diterapkan, 2.8.0 |
| [tawar-pecah](SPEC-tawar-pecah.md) | AI menawarkan pecah struk campuran | diterapkan, 2.8.0 |
| [kelompok-baru](SPEC-kelompok-baru.md) | Kelompok Pengembangan diri & Tak terduga, kategori Pendidikan | diterapkan, 2.8.0 |
| [metode-lanjutan](SPEC-metode-lanjutan.md) | Zero-Based, Pay Yourself First, 6 Jars, Kakeibo | diterapkan, 2.8.0 |
| [pelunasan](SPEC-pelunasan.md) | Strategi pelunasan Snowball / Avalanche | diterapkan, 2.8.0 |
| [analitik-tujuan](SPEC-analitik-tujuan.md) | Pembelian dari tujuan tabungan dipisah di Analitik | diterapkan, 2.8.0 |
| [ai-kantong](SPEC-ai-kantong.md) | AI tahu nama kantong, prompt ringkas, cadangan Gemini | diterapkan, 2.9.0 |
| [tagihan-cicilan](SPEC-tagihan-cicilan.md) | Perbaikan: tagihan kartu kredit belum terdaftar, nomor cicilan draft | diterapkan, 2.10.0 |
| [perbaikan-temuan](SPEC-perbaikan-temuan.md) | Perbaikan semua temuan 2.9.0 (Riwayat, Analitik, Utang & Piutang, Catat) | diterapkan, 2.10.0 |
| [simpanan](SPEC-simpanan.md) | Simpanan (deposito & pocket) di dalam kantong, tujuan "disimpan di" | diterapkan, 2.11.0 |
| [impor-rekening](SPEC-impor-rekening.md) | Impor rekening koran PDF SeaBank, Jago, BRI (parser per bank) | diterapkan, 2.12.0 |
| [lengkapi](SPEC-lengkapi.md) | Lengkapi transaksi dari screenshot & struk, unggah banyak gambar | diterapkan, 2.12.0 |
| [perbaikan-uiux](SPEC-perbaikan-uiux.md) | Perbaikan UI/UX layar baru (tinjauan ui-ux-pro-max), tombol kembali menutup lembar | diterapkan, 2.12.0 |
| [deposito-jatuh-tempo](SPEC-deposito-jatuh-tempo.md) | Jatuh tempo deposito dari rekening koran: satu kejadian satu catatan, Jago "Jadikan deposito?" | diterapkan, 2.13.0 |
| [kantong-sendiri](SPEC-kantong-sendiri.md) | Pindah antar kantong sendiri, buat kantong di tempat, impor ingat kategori, SPayLater | diterapkan, 2.14.0 |
| [asisten-agen](SPEC-asisten-agen.md) | Tanya AI jadi agen: alat baca lebar, usulan ubah data, model ringan/berat otomatis | usulan |

## Spec baru

Salin struktur spec terbaru (mis. [ai-kantong](SPEC-ai-kantong.md)): baris Status
(status · tanggal · branch · rilis), keputusan, rancangan, lalu Belum diterapkan.
Tambahkan barisnya ke tabel di atas.
