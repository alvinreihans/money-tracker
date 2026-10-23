# Spec: Paylater = cicilan (+ pelunasan lebih awal)

Status: **disetujui** · 23 Oktober 2026

## Masalah

Bukti bayar pakai **SPayLater** (bensin BP Gunung Puteri Rp 15.680) tercatat sebagai pengeluaran **dari ShopeePay**: AI menormalkan "spay…" jadi ShopeePay, dan tidak ada konsep paylater saat mencatat. Akibatnya saldo ShopeePay berkurang padahal uangnya belum keluar.

## Keputusan (23 Okt)

- Belanja pakai paylater **langsung dianggap cicilan** — sesuai keputusan Fase 4 ("dihitung saat cicilan dibayar"): saat belanja **tidak** ada pengeluaran & saldo tidak berubah; tiap cicilan yang dibayar jadi pengeluaran bulan itu.
- Kalau **berapa kali cicilannya** tidak tertera → **ditanyakan** di obrolan.
- Cicilan (paylater maupun lainnya) bisa **dibayar lebih awal: 1, 2, atau semua sisa sekaligus**.

## Alur mencatat

```
Bukti bayar / ketikan dengan paylater (SPayLater, GoPayLater, Kredivo, Akulaku, …)
   ├─ tenor tertera ("3x", "cicilan 3 bulan")  → langsung jadi rencana cicilan
   └─ tidak ada → "Dicicil berapa kali?"  (1×) (3×) (6×) (12×) atau ketik
                       ↓
   Kartu: "Cicilan dibuat · Bensin – BP Gunung Puteri · SPayLater · 3× Rp 5.227 · mulai 23 Nov"
          [Ubah] [Selesai]  (perilaku penutup sama seperti perbaikan lain)
```

| Isian rencana | Dari |
|---|---|
| Nama barang | merchant / bacaan AI ("Bensin – BP Gunung Puteri") |
| Penyedia | nama paylater yang terbaca |
| Kategori | kategori dari AI |
| Tenor | tertera, atau jawaban "Dicicil berapa kali?" |
| Per cicilan | nominal per cicilan kalau tertera; kalau tidak: total ÷ tenor (dibulatkan ke atas) |
| Jatuh tempo pertama | kalau tertera; kalau tidak: tanggal yang sama bulan depan |
| Kantong pembayar | kosong (dipilih saat membayar) |

Semua bisa diubah di Lend & Borrow (bunga/biaya yang tidak tertera, tanggal tagihan).

**AI**: paylater dibaca terpisah dari e-wallet (SPayLater ≠ ShopeePay, GoPayLater ≠ GoPay), ditambah isian `paylater` { penyedia, tenor, per_cicilan, jatuh_tempo } bila ada.

**Sambil menunggu jawaban** tenor: catatan menunggu di "Belum selesai" (draft berpenanda paylater; tidak dihitung di mana pun). Begitu dijawab → rencana cicilan dibuat, draft (beserta fotonya) dihapus.

## Bayar lebih awal (1, 2, … atau semua sekaligus)

Seperti di Shopee: cicilan 3× dipecah jadi 3 tagihan, dan boleh dibayar 1, 2, atau ketiganya sekaligus sebelum jatuh tempo.

Di Lend & Borrow → **Bayar** pada rencana cicilan:
- Pilih **berapa cicilan**: 1 (default, yang berikutnya) sampai semua sisa — mis. chip (1) (2) (Semua · 2).
- Nominal terisi jumlah × per cicilan — **bisa diubah** (kalau pelunasan lebih murah/mahal).
- Bayar pakai kantong & tanggal seperti biasa.
- Tercatat **satu pengeluaran per cicilan** (mis. "Cicilan Bensin (2/3)" dan "(3/3)", tanggal sama) — sama seperti tagihan di Shopee yang ditandai lunas satu per satu. Kalau nominal diubah, dibagi rata ke cicilan-cicilan itu.
- Cicilan yang sudah dibayar → tidak diingatkan lagi; kalau semua terbayar, rencana pindah ke daftar lunas (logika yang sudah ada).

## Data

- `transaksi_data.paylater text` — penanda draft paylater (nama penyedia); hanya untuk draft yang menunggu tenor.
- Bayar lebih awal **tanpa kolom baru**: cicilan terbayar tetap dihitung dari `cicilan_ke` tiap transaksi.

Satu migrasi, di branch yang sama dengan saldo per jam (sekali `db:migrate`, satu PR).

## Pengujian

- `uji:*`: rencana dari paylater (tenor tertera / ditanya / per cicilan tertera / dibagi rata); bayar k cicilan sekaligus (nomor berurutan, nominal dibagi rata, sisa pembulatan di cicilan terakhir).
- AI (Groq sungguhan): bukti SPayLater → paylater, bukan ShopeePay; "beli hp 3jt kredivo 6x" → tenor 6.
- Migrasi diuji kering; E2E akun sungguhan: bukti paylater → "Dicicil berapa kali?" → "3x" → rencana dibuat, saldo tak berubah; bayar 2 sekaligus → 2 pengeluaran, rencana lunas.

## Boundaries

- **Disetujui lewat spec ini:** kolom `paylater`, alur di atas.
- **Jangan:** mencatat pengeluaran saat belanja paylater; mengubah saldo kantong mana pun saat rencana dibuat.
