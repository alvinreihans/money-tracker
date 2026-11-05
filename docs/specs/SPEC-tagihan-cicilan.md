# Spec: Perbaikan bayar tagihan kartu kredit & nomor cicilan

Status: **diterapkan, belum dirilis** (K1 ditanya, K2 saat draft selesai, K3 ikut; uji unit & E2E lulus 5 Nov) · 5 November 2026 · branch `fix/temuan-2.9.0` · dari bagian Temuan di CHANGELOG (dua butir "Tinggi" + satu butir "Sedang" yang berdekatan)

Mengubah perilaku yang sebelumnya tertulis di [SPEC-lend-borrow](SPEC-lend-borrow.md) §5 dan §2; kedua bagian itu sudah diperbarui.

## Masalah

Ketiganya direproduksi di produksi (2.9.0, akun demo, 1 Nov 2026).

1. **Bayar tagihan kartu kredit yang belum terdaftar jadi piutang palsu.**
   "bayar tagihan cc Mandiri 200rb dari bca", padahal belum ada kartu Mandiri → kantong *orang* "Kartu kredit Mandiri" dibuat, pindah kantong BCA → orang itu, dan **Piutang naik Rp 200.000** ("1 orang utang ke kamu"). Penyebab: `pihak` yang tidak cocok selalu dibuatkan kantong `kind: "orang"` (`src/lib/simpan-transaksi.ts:131`).
2. **Draft bayar cicilan dihitung sudah dibayar.**
   Rencana 3× Rp 100.000. Cicilan 1 dibayar. Ketikan kedua tanpa kantong jadi draft "Pakai kantong apa?" dengan `cicilan_ke = 2`. Ketikan ketiga lengkap → tersimpan **"Cicilan 3/3"**, rencana tampil **"Lunas"** padahal baru Rp 200.000 yang keluar. Draft dihapus → nomor 2 bolong. Penyebab: kueri "cicilan yang sudah dibayar" tidak menyaring `status = 'confirmed'` di `simpan-transaksi.ts:168`, `(app)/pinjaman/page.tsx:16`, `(app)/page.tsx:76`, `tanya-server.ts:313`.
3. **Bayar cicilan tidak tertaut bila nama barang dan penyedia disebut sekaligus.**
   "bayar cicilan spaylater uji 100rb pakai bca" → AI mengisi `cicilan` = "Uji — Shopee PayLater" (menyalin format daftar di prompt), pencocokan persis gagal → pengeluaran Lainnya dengan keterangan "Rencana cicilan “Uji — Shopee PayLater” belum dicatat". Penyebab: `pilihCicilan` hanya menerima nama **atau** penyedia (`src/lib/pinjaman.ts:212`), prompt menulis `nama — penyedia` (`src/lib/extract.ts:258`).

## Perilaku yang diharapkan

### 1. Tagihan kartu kredit yang belum terdaftar

- `pihak` dari AI yang **tampak seperti kartu kredit** (mengandung "kartu kredit", "credit card", atau kata "cc"; tanpa beda huruf) dan tidak cocok dengan kantong orang/kartu mana pun **tidak** dibuatkan kantong orang.
- Transaksinya menjadi draft **"Belum selesai"** berjenis pindah kantong tanpa tujuan. Setelah kantong asalnya jelas, draft ditanya pertanyaan khusus (jenis `kartu`, bukan "Pindah ke kantong mana?"): **"Kartu kredit Mandiri belum terdaftar. Bayar ke kartu yang mana?"**, dengan pilihan:
  - **kartu kredit yang sudah ada** (hanya kantong `kredit`) → jadi tujuan pindah kantongnya;
  - **"+ Tambah Kartu kredit Mandiri"** → kartu kredit baru dengan nama itu dibuat, dengan tagihan awal = nominal pembayaran ini sejak awal tanggal transaksi (00.00 WIB), jadi sesudah pembayaran tagihannya Rp 0; lalu jadi tujuannya. Nama yang sudah dipakai kantong lain ditolak dengan pesan biasa;
  - **"Hapus catatan"** → draft dibuang ("Oke, tidak dicatat.").
  Jawaban ketikan dicocokkan ke kartu kredit saja. Di daftar Belum selesai, alasannya "Kartu kreditnya belum terdaftar".
- Draft ini dikenali dari isinya, tanpa kolom baru: pindah kantong tanpa tujuan yang merchant-nya tampak kartu kredit (`tampakKartuKredit`).
- Merchant draft = `pihak` apa adanya ("Kartu kredit Mandiri"), supaya user tahu kartu mana yang dimaksud.
- `pihak` yang **bukan** kartu kredit tetap seperti sekarang: orang baru dibuatkan kantong orang ("minjemin budi 200rb" ke Budi yang belum ada).
- Kartu yang namanya cocok tetap langsung jadi pindah kantong, tanpa ditanya.

### 2. Nomor cicilan & draft

- **Sudah dibayar = ada transaksi `confirmed`** dengan `cicilan_ke = n`. Draft tidak dihitung, di mana pun: nomor berikutnya saat mencatat, halaman Utang & Piutang (sisa, "3/6", Lunas), kartu Beranda, dan Tanya AI.
- Draft bayar cicilan tetap menempel ke rencananya (`cicilan_id`), tapi **nomornya ditetapkan saat draft selesai** (dijawab sampai `confirmed`): nomor terkecil yang belum dibayar pada saat itu, dan keterangannya ("Cicilan n/tenor · penyedia") ikut diperbarui. Jadi dua draft yang sama-sama sempat mendapat nomor 2 tidak berakhir dobel.
- Bila rencananya sudah lunas saat draft diselesaikan, draft tetap tersimpan sebagai pengeluaran biasa (uangnya memang keluar) dengan `cicilan_id` dilepas dan keterangan "Rencana cicilan “…” sudah lunas".

### 3. Sebutan cicilan "nama — penyedia"

- Sebutan dianggap cocok dengan sebuah rencana bila sama dengan **nama**, **penyedia**, atau **gabungan nama + penyedia** (format daftar di prompt), tetap persis tanpa beda huruf/spasi/tanda baca.
- Tidak ada pencocokan "mengandung": "spaylater" tetap tidak cocok dengan rencana yang penyedianya "GoPayLater".

## Keputusan (5 Nov 2026, semua memakai usulan)

Revisi 5 Nov (uji user): "Pindah ke kantong mana?" menawarkan semua kantong, sehingga tagihan kartu bisa tercatat ke SeaBank. Diganti pertanyaan `kartu` di §1 (pilih kartu, tambah kartu, atau hapus).

| # | Pertanyaan | Usulan | Alternatif |
|---|---|---|---|
| K1 | Kartu kredit yang belum terdaftar: ditanya atau dibuatkan? | **Ditanya** (draft "Pindah ke kantong mana?"), tidak membuat kantong. Tagihan kartunya tidak diketahui, jadi kartu baru dengan saldo 0 akan langsung tampak "kelebihan bayar". | Buat kantong `kredit` baru dengan tagihan awal = nominal bayar (jadi langsung "Tidak ada tagihan"). Lebih cepat, tapi menebak tagihan. |
| K2 | Kapan nomor cicilan draft ditetapkan? | **Saat draft selesai** (lihat §2). | Draft tidak menempel ke rencana sama sekali; ditautkan ulang saat selesai lewat pencocokan sebutan. Lebih sederhana, tapi sebutan aslinya harus disimpan. |
| K3 | Masalah 3 ikut di perbaikan ini? | **Ya** — kecil dan di fungsi yang sama. | Dipisah ke perbaikan berikutnya. |

## Kode

- `src/lib/pinjaman.ts`: `tampakKartuKredit(nama)` (fungsi murni); `pilihCicilan` menerima gabungan nama + penyedia; `keteranganCicilan(rencana, ke)` dipakai bersama oleh AI, draft, dan form Bayar cicilan.
- `src/lib/simpan-transaksi.ts`: kantong orang baru hanya bila `!tampakKartuKredit(p.pihak)`; selain itu tujuan kosong → draft. Kueri cicilan terbayar + `.eq("status", "confirmed")`.
- `src/app/(app)/pinjaman/page.tsx`, `src/app/(app)/page.tsx`, `src/lib/tanya-server.ts`: kueri yang sama + `.eq("status", "confirmed")`.
- `src/lib/simpan-transaksi.ts` `tetapkanCicilan()`, dipanggil `src/app/api/draft/[id]/jawab/route.ts` saat draft ber-`cicilan_id` menjadi `confirmed`: hitung ulang `cicilan_ke` dan keterangannya, atau lepas bila sudah lunas / rencananya terhapus.
- Tidak ada migrasi.

## Pengujian

- **Unit** (`npm run uji:pinjaman`):
  - `tampakKartuKredit`: "Kartu kredit Mandiri", "CC BCA", "credit card bni" → ya; "Budi", "Ibu", "Acc kantor", "Bu Cece" → tidak;
  - `pilihCicilan`: "Uji — Shopee PayLater", "uji shopee paylater" cocok dengan rencana Uji/Shopee PayLater; "spaylater" tidak cocok dengan GoPayLater.
- **E2E** (`npm run e2e -- tagihan-cicilan`): §2 saja, karena deterministik (draft disuntik langsung, tanpa AI, seperti suite `pecah`): draft tidak dihitung di Utang & Piutang (1/3); draft yang selesai setelah cicilan 2 dibayar mendapat nomor 3; draft untuk rencana yang sudah lunas dilepas. §1 dan §3 bergantung pada AI, jadi diuji di unit (`tampakKartuKredit`, `pilihCicilan`, `pertanyaanDraft` → `kartu`); jawaban `kartu` (pilih kartu yang ada, "tambah" membuat kartu bertagihan = nominal, kantong bukan kartu ditolak) diuji E2E dengan draft yang disuntik.
- `npm run uji:draft`, `uji:notifikasi`, `uji:tanya` tetap lulus.

## Boundaries

- Tidak mengubah data lama. Kantong orang yang sudah terlanjur dibuat dari tagihan kartu (mis. "Kartu kredit Mandiri" di akun demo) tetap ada; menghapusnya butuh fitur hapus kantong orang (butir Temuan terpisah).
- Tidak mengubah alur paylater (belanja → rencana cicilan) maupun form Bayar cicilan di Utang & Piutang (selalu `confirmed`).

## Belum diterapkan

Tidak ada.
