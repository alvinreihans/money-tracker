# Spec: Saldo per jam (bukan cuma tanggal)

Status: **diterapkan** · rilis 2.1.0 (23 Oktober 2026) · disinkronkan dengan kode 1 Nov 2026

## Masalah

Saldo kantong disimpan sebagai "saldo di **awal** tanggal `saldo_per`". Kalau saldo diisi pukul **14.00** lalu transaksi pukul **10.00** hari yang sama dicatat belakangan, transaksi itu ikut memotong saldo — padahal sudah termasuk di angka yang diisi. Transaksi juga tidak punya jam, jadi aplikasi tidak bisa membedakan "sebelum" dan "sesudah" saldo diisi.

## Tujuan

- Saldo kantong berlaku **sejak jam tertentu** ("saldo per 23 Okt 14.00").
- Transaksi boleh punya **jam**. Di **hari yang sama** dengan saldo, transaksi sebelum jam itu tidak memotong saldo (sudah termasuk), sesudahnya memotong.
- Sesedikit mungkin bertanya; kalau perlu, tanya **"Tadi itu jam berapa?"**.

## Data

| | Sebelumnya | Jadi |
|---|---|---|
| `user_accounts` | `saldo_per date` | + **`saldo_sejak timestamptz not null`** (sumber kebenaran). `saldo_per` tetap ada = tanggal WIB dari `saldo_sejak`. |
| Transaksi (`private.transaksi_data`, view `transactions`) | `transaction_date date` | + **`waktu time`** (opsional, jam WIB terjadinya transaksi, disimpan per menit) |

Migrasi `20261031000000_saldo_waktu.sql` + `20261031000001_saldo_waktu_menit.sql`:
- `saldo_sejak` lama diisi **00.00 WIB** tanggal `saldo_per` → hasil hitung saldo **tidak berubah** untuk data yang sudah ada.
- Trigger `sinkron_saldo_sejak` menjaga keduanya: `saldo_sejak` diubah → `saldo_per` ikut; hanya `saldo_per` diubah (atau insert tanpa `saldo_sejak`) → `saldo_sejak` = 00.00 WIB tanggal itu.
- View & trigger tulis `transactions` dibuat ulang dengan kolom `waktu`; data cron notifikasi membawa `saldo_sejak` & `waktu`.
- Transaksi ikutan (cashback, biaya admin) memakai tanggal & jam induknya (`20261102000000_ikutan_urut.sql`).

## Aturan hitung saldo

Transaksi dihitung untuk sebuah kantong bila:
- tanggalnya **sesudah** tanggal `saldo_sejak`, atau
- tanggalnya **sama** dan `waktu` **≥ jam** `saldo_sejak` (dibandingkan **per menit**: saldo 18.52.41 vs transaksi 18.52 → ikut), atau tanggalnya sama dan **tanpa `waktu`** (dianggap sesudah — data lama & isian tanpa jam).

Dipakai sama persis di RPC `saldo_kantong()` dan `hitungSaldo`/`ikutSaldo` (`src/lib/kantong.ts`, `src/lib/waktu.ts`; cron notifikasi), diuji bersama.

## Dari mana jam transaksi

| Sumber | Jam |
|---|---|
| **Struk / bukti bayar** | dibaca AI ("Waktu Selesai 13:57", "10:02") |
| **Ketik** dengan jam | "jam 10", "10.30" → jam itu |
| **Ketik** dengan bagian hari | "pagi" 08.00 · "siang" 12.00 · "sore" 16.00 · "malam" 20.00 (perkiraan) |
| **Ketik** tanpa petunjuk waktu ("kopi 25rb bca") | bertanggal hari ini → **jam saat dicatat** (orang biasanya mencatat begitu belanja); hari lain → tanpa jam |
| **Ketik** "tadi …" tanpa jam/bagian hari | tanpa jam; **ditanya** bila perlu (lihat bawah) |
| **Rekening koran** (SPEC-impor-rekening) | jam dari bank (Jago, BRI); SeaBank tanpa jam. "Samakan saldo awal" mengisi `saldo_sejak` = 00.00 WIB tanggal awal periode rekening koran |
| **Form Manual / Edit** | kolom **Jam** (opsional; transaksi baru terisi jam sekarang, edit terisi jamnya atau kosong) |

AI mengembalikan dua isian: `time` ("HH:MM" | null) dan `time_hint` ("pagi" | "siang" | "sore" | "malam" | "lampau" | null; hanya bila `time` null).

## Kapan bertanya

Hanya untuk hasil AI, dan hanya kalau **semua** ini benar:
1. tanggal transaksi = tanggal `saldo_sejak` kantongnya (atau kantong tujuan), dan jam saldonya **bukan 00.00** (saldo sejak 00.00 berarti semua jam hari itu ikut terhitung, mis. kartu kredit yang ditambah dari pertanyaan `kartu` — SPEC-tagihan-cicilan), dan
2. jamnya tidak pasti: hanya "tadi"/lampau tanpa bagian hari, **atau** bagian hari yang **rentangnya mencakup jam saldo** — pagi 05–11, siang 11–15, sore 15–18, malam 18–24 (mis. "tadi siang" vs saldo 14.00 ditanya; "tadi sore" vs 14.00 jelas sesudah).

Pertanyaan di obrolan: **"Tadi itu jam berapa?"** — dijawab di kolom ketik (`bacaJam`: "jam 10", "10.30", "10:30", "jam 2 siang" = 14.00, "jam 12 malam" = 00.00, "barusan"/"sekarang" = jam ini, "pagi"). Jawaban yang hanya bagian hari dan masih mencakup jam saldo → langsung ditolak dengan **"Kira-kira jam berapa? Mis. “jam 13” atau “13.30”."** (tidak dibaca AI, yang bisa mengarang jam pasti). Tidak terbaca → "Jamnya belum kebaca…", lalu jawabannya dibaca AI seperti cerita. Selama menunggu, catatan berstatus "Belum selesai" (`waktu` kosong) seperti pertanyaan lain (alur penutup sama: Ubah | Selesai).

Hari lain (kemarin, besok, dst.): tidak pernah ditanya — jam tidak memengaruhi saldo.

## Tampilan

- **Onboarding**: saldo disimpan dengan jam sekarang.
- **Profil → Kantong**: tanggal saldo hari ini → jam sekarang; tanggal lain → 00.00 WIB tanggal itu (`saldoSejakDari`); tidak diubah kalau tanggal & nominalnya tetap. Keterangan di isian tanggal: "Saldo per jam 14.00 di tanggal ini. …" / "Saldo saat ini (jam sekarang). …" / "Saldo di awal tanggal ini. …". Tujuan tabungan, "Dibayar dari tujuan tabungan", dan **Tambah kartu kredit** (Utang & Piutang, sejak SPEC-perbaikan-temuan C9; dulu selalu 00.00) memakai aturan yang sama. Kantong orang tetap per 1 Jan 2000 00.00 (`SALDO_PER_PINJAMAN`).
- Form Manual & Edit transaksi: kolom **Jam** opsional ("Opsional. Ubah kalau terjadinya lebih awal.").
- Detail transaksi: subjudul "… · tanggal · jam" bila ada.
- Riwayat & Beranda diurutkan tanggal, lalu jam (yang tanpa jam di bawah yang berjam pada hari itu), lalu waktu dicatat.
- Ekspor CSV membawa jam.

## Pengujian

- Fungsi murni + `uji:waktu`: aturan hitung (sebelum/sesudah/tanpa jam/hari lain), baca jam dari jawaban ("jam 10", "10.30", "10:30", "barusan", "pagi", "jam 2 siang"), jam dari hasil AI, kapan perlu bertanya (rentang bagian hari vs jam saldo), `saldoSejakDari`.
- Migrasi diuji kering: saldo semua kantong **identik** sebelum/sesudah migrasi; view & trigger dengan `waktu`; isolasi tetap.
- AI (Groq sungguhan): bukti ShopeePay "13:57" → `time` 13:57; "tadi jam 10 roti 15rb" → 10:00; "tadi beli roti" → `time_hint` lampau.
- E2E akun sungguhan dijalankan saat rilis; tidak ada suite permanen di `e2e/`.
- `tsc`, `next build`, semua `uji:*`.

## Boundaries

- **Jangan:** mengubah hasil saldo untuk data yang sudah ada (backfill 00.00); bertanya jam untuk transaksi di luar hari saldo.
