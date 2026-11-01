# Spec: Paylater = cicilan (+ pelunasan lebih awal)

Status: **diterapkan** · rilis 2.1.0 (23 Oktober 2026) · disinkronkan dengan kode 1 Nov 2026

## Masalah

Bukti bayar pakai **SPayLater** (bensin BP Gunung Puteri Rp 15.680) tercatat sebagai pengeluaran **dari ShopeePay**: AI menormalkan "spay…" jadi ShopeePay, dan tidak ada konsep paylater saat mencatat. Akibatnya saldo ShopeePay berkurang padahal uangnya belum keluar.

## Keputusan (23 Okt)

- Belanja pakai paylater **langsung dianggap cicilan** — sesuai keputusan SPEC-lend-borrow ("dihitung saat cicilan dibayar"): saat belanja **tidak** ada pengeluaran & saldo tidak berubah; tiap cicilan yang dibayar jadi pengeluaran bulan itu.
- Kalau **berapa kali cicilannya** tidak tertera → **ditanyakan** di obrolan.
- Cicilan (paylater maupun lainnya) bisa **dibayar lebih awal: 1, 2, atau semua sisa sekaligus**.

## Alur mencatat

Hanya untuk hasil AI (struk/bukti bayar/ketikan) berjenis pengeluaran; isian manual tidak punya paylater.

```
Bukti bayar / ketikan dengan paylater (SPayLater, GoPayLater, Kredivo, Akulaku, Atome, Indodana, Traveloka PayLater, …)
   ├─ tenor tertera ("3x", "cicilan 3 bulan", "SPayLater - 3 Bulan")  → langsung jadi rencana cicilan
   └─ tidak ada → "Pakai Shopee PayLater ya. Dicicil berapa kali?"  (1×) (3×) (6×) (12×) atau ketik
                       ↓
   Kartu: "✓ Cicilan dibuat · Bensin – BP Gunung Puteri · Shopee PayLater · 3× · mulai 23 Nov · Rp 5.227"
          [Ubah] [Selesai]  (Ubah membuka Utang & Piutang; Selesai = penutup biasa)
```

Tenor 1× ditulis "bayar 23 Nov". Nominal belum terbaca → ditanya nominal dulu, baru tenor.

| Isian rencana | Dari |
|---|---|
| Nama barang | merchant; tanpa merchant: keterangan dari AI; tanpa keduanya: "Belanja {penyedia}" (maks 60 huruf) |
| Penyedia | nama paylater yang terbaca, diseragamkan ("SPayLater"/"ShopeePay" → "Shopee PayLater", "gopaylater" → "GoPayLater") |
| Kategori | kategori dari AI |
| Tenor | tertera, atau jawaban "Dicicil berapa kali?" (1–120) |
| Per cicilan | nominal per cicilan kalau tertera; kalau tidak: total ÷ tenor (dibulatkan ke atas) |
| Jatuh tempo pertama | kalau tertera dan tidak sebelum tanggal belanja; kalau tidak: tanggal yang sama bulan depan (mundur ke akhir bulan bila perlu) |
| Kantong pembayar | kosong (dipilih saat membayar) |
| Catatan | keterangan dari AI |

Yang bisa diubah sesudahnya di Utang & Piutang: bunga (**Atur bunga**, SPEC-pelunasan) dan hapus rencana. Nominal saat membayar bisa diubah.

**AI**: paylater dibaca terpisah dari e-wallet (SPayLater ≠ ShopeePay, GoPayLater ≠ GoPay; `payment_method` null), ditambah isian `paylater` { penyedia, tenor, per_cicilan, jatuh_tempo } bila ada. Membayar tagihan/cicilan paylater = isian `cicilan` (SPEC-lend-borrow), bukan `paylater`. Tenor juga dibaca langsung dari teks struk (`tenorDariTeks`: "Metode Pembayaran GoPayLater - 3 Bulan") bila model melewatkannya.

**Jawaban tenor** (`bacaTenor`): "3", "3x", "3 kali", "6 bulan"; "sekali", "lunas", "langsung", "bayar penuh", "bulan depan", "30 hari" = 1. Tidak terbaca → "Berapa kali? Mis. 3 atau 6.", lalu jawabannya dibaca AI seperti cerita.

**Sambil menunggu jawaban** tenor: catatan menunggu di "Belum selesai" (draft `needs_review` berpenanda `paylater` = nama penyedia, tanpa kantong; tidak dihitung di mana pun). Begitu dijawab → rencana cicilan dibuat, draft dihapus.

## Bayar lebih awal (1, 2, … atau semua sekaligus)

Seperti di Shopee: cicilan 3× dipecah jadi 3 tagihan, dan boleh dibayar 1, 2, atau ketiganya sekaligus sebelum jatuh tempo.

Di Utang & Piutang → rencana cicilan → **Bayar cicilan ke-n** atau **Lunasi n cicilan sisa** (bila sisa > 1):
- **Berapa cicilan** (segmen, bila sisa > 1): "1 cicilan", "2 cicilan", "3 cicilan", "Semua (n)" — yang melebihi sisa tidak tampil.
- Nominal terisi jumlah × per cicilan — **bisa diubah** (kalau pelunasan lebih murah/mahal).
- Bayar pakai kantong (kantong uang & kartu kredit) & tanggal bayar.
- Tercatat **satu pengeluaran per cicilan**, berurutan dari nomor terkecil yang belum dibayar, tanggal sama: merchant = nama barang, keterangan "Cicilan 2/3 · Shopee PayLater". Nominal selalu dibagi rata; sisa pembulatan di cicilan terakhir.
- Kalau satu gagal tersimpan, yang sebelumnya tetap (cicilan itu memang sudah dibayar) dan pesannya menyebut cicilan yang gagal.
- Cicilan yang sudah dibayar → tidak diingatkan lagi; kalau semua terbayar, rencana pindah ke "Cicilan lunas".

## Data

- `20261101000000_paylater.sql`: `private.transaksi_data.paylater text` (≤ 40 huruf) — penanda draft paylater (nama penyedia); hanya untuk draft yang menunggu tenor. View `transactions` & trigger tulisnya ikut membawa kolom ini.
- Bayar lebih awal **tanpa kolom baru**: cicilan terbayar tetap dihitung dari `cicilan_ke` tiap transaksi.

## Pengujian

- `uji:pinjaman`: rencana dari paylater (per cicilan tertera / dibagi rata, jatuh tempo tertera / ngawur / bulan depan sampai akhir bulan, nama tanpa merchant); `bagiRata` (sisa pembulatan di cicilan terakhir).
- `uji:draft`: draft paylater tidak ditanya kantong (nominal dulu, lalu tenor); `bacaTenor`.
- `uji:kategori`: `tenorDariTeks` dari OCR terpecah; penyeragaman nama penyedia.
- AI (Groq sungguhan, `test:teks`): bukti SPayLater → paylater, bukan ShopeePay; "beli hp 3jt kredivo 6x" → tenor 6.
- E2E akun sungguhan dijalankan saat rilis; tidak ada suite permanen di `e2e/`.

## Boundaries

- **Jangan:** mencatat pengeluaran saat belanja paylater; mengubah saldo kantong mana pun saat rencana dibuat.

## Belum diterapkan

- Mengubah isian rencana cicilan (nama, nominal, tenor, tanggal tagihan) sesudah dibuat — kini hanya bunga, atau hapus lalu buat ulang lewat **Cicilan baru**.
