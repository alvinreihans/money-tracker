# Spec: AI tahu nama kantong user, prompt ketikan ringkas, cadangan Gemini

Status: **disetujui** · 31 Oktober 2026 · branch `feat/ai-kantong`

## Masalah

AI pembaca Catat hanya diberi daftar kategori, orang & kartu kredit, dan rencana cicilan. Nama kantong user tidak, jadi kantong yang namanya bukan nama bank/dompet umum harus ditebak:
- tujuan tabungan seperti "Liburan" dan "Dana Darurat";
- kantong yang dinamai sendiri.

Akibatnya "sisihkan 200rb dari bca ke Liburan" kadang dibalas "Pindah ke kantong mana?" (terlihat di uji E2E `tujuan` 31 Okt).

**Ukuran awal** (`npm run ukur:kantong`: 6 kalimat pindah kantong × 3, Groq sungguhan, jeda 4 detik):
- **9 dari 11** benar asal & tujuannya, dari panggilan yang dijawab AI.
- Yang salah:
  - "nabung 500rb ke dana darurat pakai gopay" → tujuan jadi GoPay;
  - "ambil 100rb dari liburan ke tunai" → asal kosong.
- 7 panggilan lain gagal karena batas laju Groq (lihat "Temuan lain").

## Rancangan

**Konteks AI:**
- `KonteksAI` mendapat isian `kantong`: nama kantong uang & tujuan tabungan milik user (bank, e-wallet, tunai, tujuan).
- Orang & kartu kredit sudah ada di `pihak`.
- Diambil oleh `ambilKonteksAI`, dalam query `user_accounts` yang sama dengan `pihak` (satu query, bukan dua).
- `ambilKonteksAI` dipakai semua jalur Catat: teks, struk, koreksi, dan jawaban draft.

**Prompt** (aturan `payment_method`/`payment_target`) ditambah:
- "Kantong milik user: BCA, GoPay, Tunai, Liburan, …. Kalau salah satunya disebut, pakai nama persisnya."
- Contoh: "sisihkan/nabung ke <tujuan>" = transfer ke kantong itu.
- Daftar kosong (user baru) → kalimat itu tidak ditulis.

**Pencocokan tetap di aplikasi:** `cocokkanKantong` di `simpanTransaksi`. AI hanya diarahkan memakai nama yang persis, supaya lebih sering cocok.

**Data yang dikirim ke AI:** nama kantong ikut terkirim ke Groq/Gemini, sama seperti nama kategori dan nama orang yang sudah terkirim sekarang. Saldo tidak ikut.

## Pengujian

- **`npm run ukur:teks`** (alat ukur baru, tidak otomatis): 18 kalimat ketikan, satu per aturan prompt (dasar, kantong, pinjaman, cicilan, paylater, cashback, rincian, kelompok, jam), dijalankan sebelum & sesudah perubahan.
  - Target: tidak ada aturan yang memburuk; kalimat kantong ≥ sebelumnya; panggilan yang gagal total = 0 berkat cadangan Gemini.
- **`uji:kategori`:** prompt memuat daftar kantong bila ada, dan tidak memuatnya bila kosong. Ini butuh `buildSystemPrompt` diekspor.
- **E2E `tujuan`** tetap lulus. Langkah AI-nya masih menerima pertanyaan kantong sebagai cadangan.
- **Regresi:** semua `uji:*`, `eval:tanya`, typecheck, lint, `next build`.

## Batas laju Groq (keputusan user 31 Okt 2026: cadangan + ringkaskan)

**Masalah:**
- Paket gratis Groq membatasi **8.000 token per menit per model**; satu panggilan Catat ± **6.000 token** karena prompt sistemnya panjang.
- Akibatnya ±1 catatan per menit per model. Mencatat beberapa transaksi beruntun cepat gagal (pengukuran awal: 7 dari 18 panggilan gagal walau berjeda 4 detik).
- Teks yang gagal jadi draft "nggak berhasil dibaca", karena jalur teks tidak punya cadangan.

### 1. Prompt per sumber

`buildSystemPrompt(..., sumber)` menyusun prompt berbeda untuk struk dan teks ketikan.

| Bagian | `"struk"` (Gemini Vision, OCR → Groq) | `"ketik"` (teks Catat, koreksi, jawaban draft) |
|---|---|---|
| Aturan baris TOTAL/TUNAI/KEMBALI, nominal bukti bayar e-wallet, "Kamu Membayar" | ya | — |
| Bukti transfer antar dua pihak, `bukti_transfer`, `document_type`, `usulan_pecah` | ya | — |
| Detail OCR (jam tertera di struk, "SPayLater - 3 Bulan" terpecah, ringkasan barang) | ya | — |
| `rincian` ketikan | — | ya |
| Semua aturan lain, daftar kategori, orang, cicilan, kantong, contoh | ya | ya |

**Ukuran** (kategori bawaan, 3 orang/kartu, 1 cicilan, 7 kantong):
- lama: 14.609 karakter;
- **ketik: 10.561 (−28%)**;
- struk: 14.275.

### 2. Cadangan Gemini untuk teks

Bila seluruh rantai Groq gagal, `processReceiptText` membaca teks lewat Gemini (`extractTextWithGemini`):
- model sama dengan jalur gambar (`GEMINI_MODEL`), prompt `"ketik"` yang sama, keluaran JSON tanpa skema;
- coba ulang untuk galat sesaat dipakai bersama jalur gambar (`geminiDenganUlang`);
- sumber hasilnya `gemini_text`;
- gagal juga → draft seperti sekarang.

Kuota Gemini hanya terpakai saat Groq penuh.

## Boundaries

- **Jangan:** mengirim saldo ke AI; mengubah cara `cocokkanKantong` mencocokkan.
- **Jangan:** memangkas aturan yang dipakai teks ketikan tanpa mengukur ulang dengan `ukur:teks`.
