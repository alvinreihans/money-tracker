# Spec fitur

Satu spec per fitur atau fase, nama file `SPEC-<topik>.md`. Riwayat rilis ada di
[CHANGELOG](../../CHANGELOG.md); desain pipeline ekstraksi di [FALLBACK](../../FALLBACK.md).

Status di tabel ini disalin dari baris Status tiap spec; kalau berbeda, spec-nya yang benar.

## Indeks

| Spec | Isi | Status |
|---|---|---|
| [catat-transaksi](SPEC-catat-transaksi.md) | UI One UI, mobile first (nama file tidak sesuai isinya) | selesai |
| [analitik](SPEC-analitik.md) | Analitik di Beranda + Pengaturan (budget, kantong, kategori) | sebagian digantikan navigasi |
| [lend-borrow](SPEC-lend-borrow.md) | Utang & piutang, cicilan, kartu kredit | disetujui & dikerjakan |
| [enkripsi](SPEC-enkripsi.md) | Enkripsi merchant, keterangan, teks OCR | disetujui |
| [notifikasi](SPEC-notifikasi.md) | Push notifikasi harian | disetujui |
| [navigasi](SPEC-navigasi.md) | 5 tab: Beranda · Riwayat · + · Analitik · Profil | fase 1 diterapkan |
| [riwayat-filter](SPEC-riwayat-filter.md) | Filter Riwayat (fase 2 navigasi) | diterapkan |
| [analitik-insight](SPEC-analitik-insight.md) | Insight & streak (fase 3 navigasi) | diterapkan |
| [analitik-ai](SPEC-analitik-ai.md) | Tanya AI di Analitik (fase 4 navigasi) | diterapkan |
| [layar-lebar](SPEC-layar-lebar.md) | Tablet, Fold, desktop (fase 5 navigasi) | diterapkan |
| [catat-chat](SPEC-catat-chat.md) | Catat sebagai obrolan, pengganti "Perlu dibenerin" | diimplementasikan |
| [catat-andal](SPEC-catat-andal.md) | Gemini dulu, gambar dikompres, deteksi duplikat | diterapkan |
| [paylater](SPEC-paylater.md) | Paylater = cicilan, pelunasan lebih awal | diterapkan |
| [saldo-waktu](SPEC-saldo-waktu.md) | Saldo per jam, bukan cuma tanggal | diterapkan |
| [catat-tuntas](SPEC-catat-tuntas.md) | Catat tuntas (fase 1) | diterapkan, 2.4.0 |
| [cerita-tanya](SPEC-cerita-tanya.md) | Cerita & Tanya AI (fase 2) | diterapkan, 2.4.0 |
| [metode-budget](SPEC-metode-budget.md) | Metode budgeting 50/30/20 dkk (fase 3) | diterapkan, 2.5.0 |
| [tujuan-tabungan](SPEC-tujuan-tabungan.md) | Penghasilan & tujuan tabungan | diterapkan, 2.5.0 |
| [ingat-kategori](SPEC-ingat-kategori.md) | Kategori diingat per merchant | diterapkan, 2.6.0 |
| [normalisasi](SPEC-normalisasi.md) | FK kategori, indeks, `updated_at` | diterapkan, 2.7.0 |
| [PETA-fase4](PETA-fase4.md) | Peta fase 4: tawaran pecah struk & metode lanjutan | disetujui |
| [analitik-tujuan](SPEC-analitik-tujuan.md) | Pembelian dari tujuan tabungan dipisah di Analitik | disetujui & dikerjakan |
| [tawar-pecah](SPEC-tawar-pecah.md) | AI menawarkan pecah struk campuran | disetujui |
| [kelompok-baru](SPEC-kelompok-baru.md) | Kelompok Pengembangan diri & Tak terduga | disetujui |
| [metode-lanjutan](SPEC-metode-lanjutan.md) | Zero-Based, Pay Yourself First, 6 Jars, Kakeibo | disetujui |
| [pelunasan](SPEC-pelunasan.md) | Strategi pelunasan Snowball / Avalanche | disetujui |
| [ai-kantong](SPEC-ai-kantong.md) | AI tahu nama kantong, prompt ringkas, cadangan Gemini | disetujui |

## Spec baru

Salin struktur spec terbaru: baris Status (status · tanggal · branch · rilis),
keputusan user, rancangan, lalu pertanyaan terbuka. Tambahkan barisnya ke tabel di atas.
