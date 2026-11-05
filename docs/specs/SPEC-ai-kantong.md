# Spec: AI tahu nama kantong user, prompt ketikan ringkas, cadangan Gemini

Status: **diterapkan** · rilis 2.9.0 (31 Oktober 2026) · branch `feat/ai-kantong` (PR #46) · disinkronkan dengan kode 1 Nov 2026

## Masalah

AI pembaca Catat hanya diberi daftar kategori, orang & kartu kredit, dan rencana cicilan. Nama kantong user tidak, jadi kantong yang namanya bukan nama bank/dompet umum harus ditebak:
- tujuan tabungan seperti "Liburan" dan "Dana Darurat";
- kantong yang dinamai sendiri.

Akibatnya "sisihkan 200rb dari bca ke Liburan" kadang dibalas "Pindah ke kantong mana?" (terlihat di uji E2E `tujuan` 31 Okt).

**Ukuran awal** (6 kalimat pindah kantong × 3, Groq sungguhan, jeda 4 detik; sekarang setara dengan `UKUR_HANYA=kantong npm run ukur:teks`):
- **9 dari 11** benar asal & tujuannya, dari panggilan yang dijawab AI.
- Yang salah:
  - "nabung 500rb ke dana darurat pakai gopay" → tujuan jadi GoPay;
  - "ambil 100rb dari liburan ke tunai" → asal kosong.
- 7 panggilan lain gagal karena batas laju Groq (lihat "Batas laju Groq").

## Rancangan

**Konteks AI:**
- `KonteksAI` (`src/lib/extract.ts`) mendapat isian `kantong`: nama semua kantong user yang bukan orang/kartu kredit (`kind` `bank`, `ewallet`, `cash`, `tujuan`).
- Orang & kartu kredit sudah ada di `pihak`.
- Diambil oleh `ambilKonteksAI` (`src/lib/kategori-server.ts`), dalam query `user_accounts` yang sama dengan `pihak` (satu query, bukan dua).
- `ambilKonteksAI` dipakai semua jalur Catat: teks (`/api/catat-teks`), struk (`/api/upload-receipt`), koreksi (`/api/transaksi/[id]/koreksi`), dan jawaban draft (`/api/draft/[id]/jawab`).

**Prompt** (aturan `payment_method`/`payment_target`) ditambah:
- "Kantong milik user: BCA, GoPay, Tunai, Liburan, …. Kalau salah satunya disebut ("dari jago", "ke Liburan"), pakai nama persisnya. Uang yang disisihkan/ditabung/dipindah ke salah satunya = "transfer"."
- Daftar kosong (user baru) → kalimat itu tidak ditulis.
- Contoh tetap (selalu ada, juga untuk user baru): "sisihkan 200rb dari bca ke Liburan" → transfer, `payment_method` BCA, `payment_target` Liburan.

**Pencocokan tetap di aplikasi:** `cocokkanKantong` di `simpanTransaksi`. AI hanya diarahkan memakai nama yang persis, supaya lebih sering cocok.

**Data yang dikirim ke AI:** nama kantong ikut terkirim ke Groq/Gemini, sama seperti nama kategori dan nama orang yang sudah terkirim sekarang. Saldo tidak ikut.

## Pengujian

- **`npm run ukur:teks`** (`scripts/ukur-teks.mts`, tidak otomatis, memakai kuota Groq): 18 kalimat ketikan lewat `processReceiptText`, berlabel `dasar`, `kantong` (6), `pinjaman`, `cicilan`, `paylater`, `lain` (cashback, rincian, kelompok, jam). Env: `UKUR_ULANG` (bawaan 1), `UKUR_JEDA` (bawaan 15000 ms), `UKUR_HANYA=<label>`. Juga mencetak ukuran prompt sistem.
  - Hasil 2.9.0 (CHANGELOG): 35/36 benar (sebelumnya 31/36); kalimat pindah kantong 12/12.
  - Target: tidak ada aturan yang memburuk; kalimat kantong ≥ sebelumnya; panggilan yang gagal total = 0 berkat cadangan Gemini.
- **`uji:kategori`:** prompt memuat daftar kantong bila ada, dan tidak memuatnya bila kosong; prompt `ketik` tanpa aturan struk (`usulan_pecah`, `TUNAI / CASH`, `bukti_transfer`), prompt `struk` tanpa `rincian`; prompt `ketik` < 80% prompt `struk`. `buildSystemPrompt` diekspor untuk ini.
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

Bila seluruh rantai Groq **melempar galat** (semua model 429/5xx/timeout) **atau menjawab dengan hasil tidak valid** (mis. nominal 0; SPEC-perbaikan-temuan K7), `processReceiptText` (`src/lib/receipt.ts`) membaca teks lewat Gemini (`extractTextWithGemini`):
- model sama dengan jalur gambar (`GEMINI_MODEL`), prompt `"ketik"` yang sama, `responseMimeType: application/json` tanpa skema (skema Gemini milik jalur struk dan tidak memuat `rincian`), `temperature: 0`;
- coba ulang untuk galat sesaat dipakai bersama jalur gambar (`geminiDenganUlang`: 3 percobaan, jeda 1,5 lalu 3 detik, hanya untuk 429/500/502/503/504, "high demand", "overloaded", "timeout");
- Gemini dicoba **sekali** per ketikan (di luar coba ulang galat sesaat di atas); sumber hasil yang sah `gemini_text`;
- Gemini tidak sah atau gagal juga → draft. Isinya hasil Groq yang tidak sah bila ada (sumber `groq`); bila Groq tadi galat: hasil Gemini yang tidak sah (sumber `gemini_text`), atau draft kosong (sumber `none`) bila Gemini juga galat. Teks ketikan tetap tersimpan di draft oleh route.
- Pemanggil AI bisa diganti (`AiTeks`, argumen ketiga) supaya keputusan ini diuji tanpa kuota (`uji:draft`).

Kuota Gemini hanya terpakai saat Groq penuh atau hasilnya tidak sah.

## Boundaries

- **Jangan:** mengirim saldo ke AI; mengubah cara `cocokkanKantong` mencocokkan.
- **Jangan:** memangkas aturan yang dipakai teks ketikan tanpa mengukur ulang dengan `ukur:teks`.
- **Keputusan:** teks ketikan dikirim ke Gemini hanya sebagai cadangan saat rantai Groq gagal atau hasilnya tidak sah (yang kedua sejak SPEC-perbaikan-temuan K7). Ini menjawab "tanya dulu: mengirim teks ketikan ke Gemini" di SPEC-catat-andal.
