# Spec: Saldo per jam (bukan cuma tanggal)

Status: **draf, menunggu persetujuan** · 23 Oktober 2026

## Masalah

Saldo kantong disimpan sebagai "saldo di **awal** tanggal `saldo_per`". Kalau saldo diisi pukul **14.00** lalu transaksi pukul **10.00** hari yang sama dicatat belakangan, transaksi itu ikut memotong saldo — padahal sudah termasuk di angka yang diisi. Transaksi juga tidak punya jam, jadi aplikasi tidak bisa membedakan "sebelum" dan "sesudah" saldo diisi.

## Tujuan

- Saldo kantong berlaku **sejak jam tertentu** ("saldo per 23 Okt 14.00").
- Transaksi boleh punya **jam**. Di **hari yang sama** dengan saldo, transaksi sebelum jam itu tidak memotong saldo (sudah termasuk), sesudahnya memotong.
- Sesedikit mungkin bertanya; kalau perlu, tanya **"Tadi itu jam berapa?"**.

## Data

| | Sekarang | Jadi |
|---|---|---|
| `user_accounts` | `saldo_per date` | + **`saldo_sejak timestamptz`** (sumber kebenaran). `saldo_per` tetap ada = tanggal WIB dari `saldo_sejak` (kompatibel). |
| Transaksi (`private.transaksi_data`, view `transactions`) | `transaction_date date` | + **`waktu time`** (opsional, jam WIB terjadinya transaksi) |

Migrasi: `saldo_sejak` lama diisi **00.00 WIB** tanggal `saldo_per` → hasil hitung saldo **tidak berubah** untuk data yang sudah ada. View & trigger tulis `transactions` dibuat ulang dengan kolom `waktu`.

## Aturan hitung saldo

Transaksi dihitung untuk sebuah kantong bila:
- tanggalnya **sesudah** tanggal `saldo_sejak`, atau
- tanggalnya **sama** dan `waktu` **≥ jam** `saldo_sejak`, atau tanggalnya sama dan **tanpa `waktu`** (dianggap sesudah — data lama & isian tanpa jam).

Dipakai sama persis di RPC `saldo_kantong()` dan `hitungSaldo` (cron notifikasi), diuji bersama.

## Dari mana jam transaksi

| Sumber | Jam |
|---|---|
| **Struk / bukti bayar** | dibaca AI ("Waktu Selesai 13:57", "10:02") |
| **Ketik** dengan jam | "jam 10", "10.30" → jam itu |
| **Ketik** dengan bagian hari | "pagi" 08.00 · "siang" 12.00 · "sore" 16.00 · "malam" 20.00 (perkiraan) |
| **Ketik** tanpa petunjuk waktu ("kopi 25rb bca") | **jam saat dicatat** (orang biasanya mencatat begitu belanja) |
| **Ketik** "tadi …" tanpa jam/bagian hari | **ditanya** (lihat bawah) |
| **Form Manual / Edit** | kolom **Jam** (opsional), terisi jam sekarang |

AI mengembalikan dua isian baru: `time` ("HH:MM" | null) dan `time_hint` ("pagi" | "siang" | "sore" | "malam" | "lampau" | null).

## Kapan bertanya

Hanya kalau **semua** ini benar:
1. tanggal transaksi = tanggal `saldo_sejak` kantongnya (atau kantong tujuan), dan
2. jamnya tidak pasti: hanya "tadi"/lampau tanpa bagian hari, **atau** bagian hari yang **rentangnya mencakup jam saldo** — pagi 05–11, siang 11–15, sore 15–18, malam 18–24 (mis. "tadi siang" vs saldo 14.00 ditanya; "tadi sore" vs 14.00 jelas sesudah).

Pertanyaan di obrolan: **"Tadi itu jam berapa?"** — dijawab di kolom ketik ("jam 10", "10.30", "barusan", "pagi"). Jawaban yang masih terlalu dekat jam saldo → **"Kira-kira jam berapa?"**. Selama menunggu, catatan berstatus "Belum selesai" seperti pertanyaan lain (alur penutup sama: Ubah | Selesai).

Hari lain (kemarin, besok, dst.): tidak pernah ditanya — jam tidak memengaruhi saldo.

## Tampilan

- Onboarding & Pengaturan → Kantong: saldo disimpan dengan **jam sekarang**; keterangan "per 23 Okt 14.00".
- Form Manual & Edit transaksi: kolom **Jam** opsional.
- Detail transaksi: "Tanggal" ikut menampilkan jam bila ada.
- Riwayat diurutkan tanggal, lalu jam (yang tanpa jam memakai jam dicatat).

## Pengujian

- Fungsi murni + `uji:*`: aturan hitung (sebelum/sesudah/tanpa jam/hari lain), baca jam dari ketikan ("jam 10", "10.30", "10:30", "barusan", "pagi"), kapan perlu bertanya (jarak < 2 jam).
- Migrasi diuji kering: saldo semua kantong **identik** sebelum/sesudah migrasi; view & trigger dengan `waktu`; isolasi tetap.
- AI (Groq sungguhan): bukti ShopeePay "13:57" → `time` 13:57; "tadi jam 10 roti 15rb" → 10:00; "tadi beli roti" → `time_hint` lampau.
- E2E akun sungguhan: saldo diisi, transaksi jam lebih awal tidak memotong; "tadi beli roti 15rb bca" → "Tadi itu jam berapa?" → "jam 10" → tidak memotong; hari berikutnya normal.
- `tsc`, `next build`, semua `uji:*`.

## Boundaries

- **Disetujui lewat spec ini:** kolom `saldo_sejak` & `waktu`, view/trigger transaksi dibuat ulang, aturan hitung saldo baru.
- **Jangan:** mengubah hasil saldo untuk data yang sudah ada (backfill 00.00); bertanya jam untuk transaksi di luar hari saldo.
