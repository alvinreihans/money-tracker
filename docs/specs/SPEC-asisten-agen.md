# Spec: Asisten AI yang bisa bertindak (Tanya AI jadi agen)

Status: **disetujui, dikerjakan** (P1–P9 & P4b dijawab user 9 Nov; disetujui 9 Nov) · 8 November 2026 · branch `feat/asisten-agen` (stacked di atas `feat/periksa-dulu`) · lanjutan [SPEC-analitik-ai](SPEC-analitik-ai.md) dan [SPEC-cerita-tanya](SPEC-cerita-tanya.md)

## Masalah

User: "AI chatbot kita juga bodoh … bisa ga ya kalau chatbotnya dibuat seperti kamu ini." Contoh nyata (8 Nov 2026):
- Top up BRI → DANA tercatat sebagai pengeluaran karena kantong DANA belum ada.
- Screenshot uang masuk di DANA sempat ditanya "pindah kantong?". Sesudah itu tidak ada jalan keluar: pilihan kantong tujuan tidak memuat DANA, dan tidak ada tawaran membuatnya.
- Asisten tidak bisa membantu merapikan semua ini.

Penyebabnya, dari kode (`src/lib/tanya.ts`, `src/lib/tanya-server.ts`):

| Penyebab | Sekarang |
|---|---|
| **Alatnya sempit** | 6 fungsi yang dirancang untuk pertanyaan tertentu (`ringkasan_bulan`, `cari_transaksi`, `saldo_kantong`, `pinjaman_cicilan`, `hitung`, `usul_ubah_kategori`). Di luar itu, AI tidak punya cara mencari tahu. |
| **Hampir tidak bisa bertindak** | Satu-satunya alat yang mengubah data adalah usulan ubah kategori. AI tidak bisa membuat kantong, mengubah transaksi, membuka draft, atau melihat hasil impor. |
| **Tidak paham aplikasinya** | Prompt tidak menjelaskan konsep kantong, simpanan, pindah kantong, "perlu dilengkapi", draft, atau impor rekening koran. |
| **Napasnya pendek** | Maksimal 4 putaran fungsi, 6 pesan riwayat, pertanyaan 300 karakter. |
| **Modelnya kecil** | `gemini-3.5-flash-lite` untuk semua pertanyaan. |

## Tujuan

Asisten yang bisa **menyelidiki** (mencari sendiri sampai ketemu penyebabnya) dan **bertindak** (mengusulkan dan menjalankan perbaikan data), tetap gratis (Gemini free tier) dan aman untuk data uang.

## Keputusan dari diskusi (8 Nov 2026)

| # | Keputusan | Kutipan user |
|---|---|---|
| D1 | **Dua model, dipilih otomatis.** Pertanyaan mudah ke Flash-Lite, pertanyaan berat ke **Gemini 3.8 Flash** (model free tier tertinggi). **Tanpa tombol** ganti model: aplikasi yang menentukan. | "kalau pertanyaan kecil pakai model kecil. kalau berat otomatis pakai 3.8. tapi jangan pakai tombol … kita sendiri yang harus menentukan" |
| D2 | **Akses AI diperbesar**: baca hampir semua data user, dan bisa mengubah data lewat alat. | "saya setuju memperbesar akses gemininya" |
| D3 | **Tidak memakai banyak key/project** untuk melipatgandakan kuota gratis. Key di satu project berbagi kuota, dan memecah ke banyak project berisiko melanggar ketentuan Gemini API. | (dibahas, tidak dibantah) |
| D4 | **Bukan MCP.** Kunci Gemini tidak bisa "jadi MCP". Alat-alat dipasang lewat *function calling* Gemini yang sudah dipakai. Server MCP (supaya Claude bisa tersambung ke data) masuk Belum diterapkan. | |

## Rancangan

### 1. Mudah atau berat: dua lapis, tanpa tombol (D1)

**Lapis 1: aturan di kode (0 panggilan AI).** Pertanyaan langsung ke 3.8 Flash bila:
- meminta perubahan data, apalagi banyak ("rapikan", "ubah semua", "gabungkan", "hapus yang dobel", "buatkan kantong");
- mencari penyebab ("kenapa", "kok", "beda sama bank", "dobel", "hilang");
- membandingkan beberapa kantong atau rentang waktu panjang (> 3 bulan, "dari awal");
- percakapan ini sudah naik ke 3.8 (lanjutannya tetap di 3.8).

Selain itu mulai di **Flash-Lite**.

**Lapis 2: Flash-Lite boleh menyerahkan.**
- Flash-Lite punya alat `serahkan(alasan)`. Penyerahan juga otomatis bila ia sudah memakai semua putarannya tanpa jawaban, atau jawabannya gagal pemeriksaan angka dua kali.
- 3.8 Flash **melanjutkan** dengan pertanyaan, riwayat, dan hasil fungsi yang sudah didapat. Tidak mulai dari nol.

**Pengaman kuota:**
- Jatah harian 3.8 dihitung di server. Angka pastinya diisi dari halaman harga/rate limit AI Studio dan bisa diubah lewat env `GEMINI_MODEL_BERAT_RPD`.
- Bila habis atau kena 429, pertanyaan dijawab Flash-Lite dengan catatan kecil di bawah jawaban: "Dijawab model ringan, kuota model besar hari ini habis."
- Pembaca struk, Lengkapi, dan Catat tetap Flash-Lite dan tidak memakai jatah 3.8.
- Model lewat env: `GEMINI_MODEL_CHAT` (ringan, sudah ada) dan `GEMINI_MODEL_BERAT` (bawaan `gemini-3.8-flash`). Ditulis persis, bukan alias `-latest` (pelajaran di `src/lib/gemini.ts`).
- **Kuota dihitung per project, jadi dibagi semua pengguna.** Selama pemakainya hanya user, jatahnya global. Batas per orang masuk Belum diterapkan.

### 2. Alat baca: lebar tapi terstruktur (D2)

Model kecil lebih andal mengisi kolom pilihan daripada menulis query, jadi tidak ada SQL bebas. Fungsi lama tetap ada. Tambahannya:

| Alat | Isi |
|---|---|
| `cari(sumber, saring?, kelompokkan?, urutkan?, batas?)` | Satu alat untuk banyak sumber: `transaksi` (semua status, termasuk draft & perlu dilengkapi), `kantong`, `simpanan`, `deposito` (+ periode), `cicilan`, `pinjaman`, `tujuan`, `impor` (riwayat impor rekening koran: bank, periode, saldo bank vs aplikasi). Saringan: tanggal, kantong, jenis, kategori, status, sumber (`statement`/`text`/gambar), nominal, kata, `ref_bank` ada/tidak. Bisa dikelompokkan & dijumlah (per kantong/kategori/bulan/merchant). Maksimal 50 baris rinci; selebihnya ringkasan. |
| `detail(id)` | Satu transaksi/kantong/draft lengkap: ikutan (biaya, cashback), pasangan pindah kantong, asal (baris bank, gambar), riwayat ubah bila ada. |
| `periksa_saldo(kantong, sampai?)` | **Dihitung kode, bukan AI.** Saldo aplikasi vs saldo bank terakhir yang diimpor, selisihnya, dan calon penyebab: transaksi dobel (nominal & tanggal sama, sumber beda), pindah kantong tanpa pasangan, pengeluaran yang tampaknya pindah ke kantong sendiri, transaksi sesudah periode rekening koran. Memakai ulang logika impor (`rencana.ts`: pasangan §6, R2). |
| `cari_kejanggalan(jenis?)` | Daftar yang perlu dirapikan: perlu dilengkapi, draft tertahan, calon dobel, **top up e-wallet yang kantongnya belum ada**, pindah kantong satu sisi. |

Hasil fungsi tetap JSON, hanya data user (RLS, sesi user, `security invoker`). Batas `MAKS_BARIS` tetap.

### 3. Alat ubah: lewat kartu usulan (D2)

Semua alat ubah **tidak langsung menulis**. Hasilnya **usulan** yang tampil sebagai kartu di obrolan: apa yang berubah, sebelum → sesudah, jumlah transaksi, saldo kantong sebelum → sesudah. Kartu punya tombol **Terapkan**, dan **Urungkan** sesudah diterapkan. Pola kartunya meniru `usul_ubah_kategori` + `KartuUsulan`. Pengecualian yang boleh langsung jalan: lihat **P1**.

| Alat | Usulan |
|---|---|
| `usul_buat_kantong(nama, jenis, saldo_awal?, per?)` | Kantong baru (bank/e-wallet/tunai). Saldo awal bawaan: dihitung supaya transaksi yang akan dipindah ke sana tidak membuat saldonya minus, atau 0. |
| `usul_jadikan_pindah(ids \| saringan, ke_kantong)` | Pengeluaran/pemasukan → pindah kantong. Bila pasangannya ada di kantong lain (sisi lain tercatat terpisah), keduanya digabung jadi satu pindah kantong (pola R2 `ubah_pindah`). Dipakai juga untuk perbaikan DANA. |
| `usul_ubah_transaksi(ids \| saringan, isian)` | Ubah kategori, merchant, keterangan, kantong, tanggal/jam, nominal. Nominal & tanggal transaksi dari rekening koran (`ref_bank`) **tidak boleh** diubah (angka bank). |
| `usul_hapus(ids)` | Hapus transaksi, mis. dobel. Transaksi dari rekening koran hanya boleh dihapus bila ada kembarannya. |
| `usul_selesaikan_draft(id, isian)` | Mengisi yang kurang di draft "Belum selesai" (kantong, kantong tujuan, jam) lalu mengonfirmasinya. |
| `usul_catat(isian)` | Catat transaksi baru dari ketikan ("tadi makan 25rb pakai DANA"). Lihat **P3**. |
| `usul_ubah_kategori` | Sudah ada, tetap. |

Aturan bersama:
- **Divalidasi di server**, bukan dipercaya dari AI: kantong & kategori harus ada/milik user, nominal > 0, pindah kantong ke kantong yang berbeda, transaksi yang diubah belum berubah sejak usulan dibuat (cek `updated_at`; bila berubah: "Datanya sudah berubah, minta usulan lagi.").
- **Satu kartu = satu transaksi database** lewat RPC baru `terapkan_usulan(jsonb)` (`security invoker`, `revoke public/anon`, `grant authenticated`). Gagal sebagian = tidak ada yang berubah.
- **Urungkan:** usulan yang diterapkan dicatat (tabel `aksi_asisten`: isi sebelum & sesudah per baris) supaya bisa dibalik persis, selama baris-barisnya belum diubah lagi. Batas waktu urungkan: lihat **P6**.
- Satu usulan paling banyak **200 transaksi** (lihat **P5**). Lebih dari itu dipecah.
- Setelah diterapkan, AI menerima hasilnya (saldo baru) dan bisa melanjutkan, mis. "Saldo DANA sekarang Rp X, sama dengan screenshot terakhir."

### 4. AI paham aplikasinya

Prompt sistem ditambah **pengetahuan aplikasi** yang ringkas dan tetap (± 1.500 token, di-cache bila tersedia):
- kantong (bank, e-wallet, tunai, kartu kredit, orang), simpanan/deposito di dalam kantong, tujuan tabungan;
- pindah kantong vs pengeluaran;
- transaksi dari rekening koran: angka bank menang, `ref_bank`;
- "perlu dilengkapi" dan Lengkapi dari gambar;
- draft "Belum selesai";
- ikutan biaya/cashback;
- urutan impor yang benar: rekening koran → screenshot → struk;
- kenapa saldo bisa beda dengan bank.

Ditulis sebagai fakta, bukan contoh jawaban, dan **disinkronkan dengan spec** (bagian ini ikut diperbarui bila perilaku aplikasi berubah).

### 5. Batas baru

| | Flash-Lite | 3.8 Flash |
|---|---|---|
| Putaran fungsi per pertanyaan | 4 (+ `serahkan`) | 10 |
| Riwayat pesan dikirim | 20 | 20 |
| Panjang pertanyaan | 1.000 karakter | 1.000 karakter |
| Batas waktu | 55 detik | 55 detik (risiko: lihat di bawah) |

**Risiko waktu:** 10 putaran 3.8 Flash bisa lebih dari 55 detik, yang menjadi batas fungsi Vercel. Jawabannya **dialirkan** (*streaming*): langkah yang sedang dikerjakan tampil ("Mencari top up DANA…", "Memeriksa saldo Jago…"). Bila waktu habis, jawaban berisi apa yang sudah ditemukan dan tawaran "lanjutkan".

### 6. Keamanan

- **Teks dari data adalah data, bukan perintah.** Nama merchant, keterangan, teks OCR struk, dan uraian rekening koran bisa berisi kalimat seperti perintah. Prompt menegaskan ini, dan yang lebih penting, **tidak ada alat yang bisa menulis tanpa kartu Terapkan** (kecuali yang disetujui di P1). Teks jahat paling jauh hanya menghasilkan usulan aneh yang bisa ditolak user.
- Tidak ada SQL bebas, baik baca maupun tulis. Semua lewat fungsi yang memvalidasi.
- AI tidak pernah melihat data akun lain (RLS + sesi user). `uji:isolasi` ditambah untuk `terapkan_usulan` dan `aksi_asisten`.
- Yang dikirim ke Gemini bertambah: hasil `cari`/`detail` berisi merchant, keterangan, nominal, nama kantong, dan uraian bank. Tetap hanya hasil fungsi, bukan seluruh database.

### 7. Hubungan dengan perbaikan impor DANA

Perbaikan "top up e-wallet tanpa kantong" (impor rekening koran menawarkan **Buat kantong DANA**; pertanyaan "Pindah ke kantong mana?" mendapat pilihan **+ Buat kantong <nama>**; screenshot uang masuk dicocokkan dengan top up yang sudah tercatat) memakai fungsi server yang sama dengan `usul_buat_kantong` & `usul_jadikan_pindah`. Lihat **P7**.

## Perubahan dari spec lain

- **SPEC-analitik-ai, Boundaries.** "Jangan: menulis apa pun ke database dari `/api/tanya`" diganti: **boleh menulis hanya lewat `terapkan_usulan` setelah user menekan Terapkan** (atau aksi kecil yang disetujui di P1). "Tanya dulu: menambah fungsi yang mengubah data" terjawab oleh spec ini.
- **SPEC-analitik-ai, Model & batas.** Diganti oleh §1 dan §5 spec ini.

## Data

- Tabel baru `aksi_asisten`: id, user_id, dibuat, jenis, ringkasan, `sebelum jsonb`, `sesudah jsonb`, `diurungkan_pada`. RLS per user.
- Tabel atau baris hitung kuota harian model berat: `pemakaian_ai(tanggal, model, jumlah)`. Global selama satu pengguna.
- RPC `terapkan_usulan(jsonb)` & `urungkan_aksi(uuid)`.
- Riwayat obrolan: lihat **P4**. Bila disimpan, tabel `obrolan_asisten`.

## Pengujian

- **Unit:**
  - aturan lapis 1 (contoh mudah/berat);
  - validasi usulan (kantong bukan milik user, nominal bank diubah, transaksi sudah berubah);
  - `periksa_saldo` & `cari_kejanggalan` dengan data buatan (dobel, pindah satu sisi, top up tanpa kantong);
  - penghitung kuota & jatuh ke model ringan.
- **RPC:** `terapkan_usulan` atomik (gagal sebagian = tidak berubah), `urungkan_aksi` membalik persis, `uji:isolasi`.
- **AI sungguhan (`eval:tanya` diperluas):**
  - semua kasus lama tetap lulus di Flash-Lite;
  - kasus baru dari contoh perintah user (**P2**);
  - skenario DANA dari data buatan (top up tanpa kantong → asisten mengusulkan buat kantong DANA + jadikan pindah → saldo cocok);
  - akurasi pemilihan model: berapa persen pertanyaan mudah yang tidak naik, berapa persen yang berat yang naik. Diberi jeda karena kuota 3.8.
- **E2E:** kartu usulan → Terapkan → Riwayat & saldo berubah → Urungkan → kembali. Langkah yang dialirkan tampil. Catatan "model ringan" saat kuota habis (ditiru). Di 360px & 1024px.
- **UAT data asli user** (lokal, akun uji sementara): impor semua rekening koran, lalu minta asisten merapikan; saldo semua kantong sama dengan bank.

## Jawaban user (9 Nov 2026)

| # | Jawaban |
|---|---|
| P1 | **Semua perubahan oleh asisten lewat kartu Terapkan** (tanpa aksi langsung). Hasil Catat/unggah juga dicek dulu sebelum tersimpan, diatur terpisah di [SPEC-periksa-dulu](SPEC-periksa-dulu.md). |
| P2 | Belum ada contoh. Set uji awal disusun dari masalah nyata yang sudah ditemui (lihat Pengujian); user menambah contoh nanti. |
| P3 | **Terpisah dulu**: Catat tetap, Tanya AI jadi asisten. |
| P4 | **Riwayat percakapan disimpan, bergaya ChatGPT/Claude, hanya untuk Tanya AI**: daftar percakapan (judul otomatis dari pertanyaan pertama), buka/lanjutkan/hapus, tombol Percakapan baru. Di HP: tombol riwayat & Percakapan baru di kanan atas lembar Tanya AI; daftar menggantikan isi lembar. Di layar lebar: daftar di samping obrolan. Percakapan Catat tidak masuk daftar ini; jejaknya disimpan per transaksi ("Cara dicatat", [SPEC-periksa-dulu](SPEC-periksa-dulu.md)). |
| P5 | 200 transaksi per usulan cukup. |
| P6 | **Urungkan tanpa batas waktu**, selama baris-baris yang diubah belum diubah lagi. |
| P7 | Sudah tidak relevan: perbaikan impor DANA sudah dirilis lebih dulu di 2.14.0 ([SPEC-kantong-sendiri](SPEC-kantong-sendiri.md)). Asisten memakai fungsi bersamanya (`jadikan_pindah`, `cariCalonPindah`, buat kantong). |
| P8 | **Tanpa tanda** model besar; hanya catatan saat kuota habis. |
| P9 | Angka jatah harian belum diketahui. **Tanpa batas hitung di awal**: pakai 3.8 Flash sampai Gemini menolak (429/kuota), lalu jatuh ke Flash-Lite dengan catatan. `GEMINI_MODEL_BERAT_RPD` opsional (kosong = tanpa batas hitung); pemakaian harian tetap dicatat supaya angkanya bisa dilihat dan diisi nanti. |

## Pertanyaan terbuka

- **P4b (terjawab: a, hanya Tanya AI). Bentuk riwayat percakapan.** (a) Seperti ChatGPT/Claude: daftar percakapan (judul otomatis dari pertanyaan pertama), bisa dibuka lagi, dilanjutkan, dan dihapus; tombol "Percakapan baru". (b) Sederhana: hanya percakapan terakhir yang diingat (dibuka lagi saat lembar dibuka), dengan tombol "Percakapan baru" yang menghapusnya.

Riwayat pertanyaan awal (P1–P9):

- **P1. Persetujuan.** Semua perubahan lewat kartu Terapkan, atau ada aksi kecil yang boleh langsung jalan (tetap bisa diurungkan)? Calon aksi langsung: isi kategori satu transaksi, buat kantong e-wallet yang memang belum ada. *Usulan: semua lewat kartu dulu; longgarkan nanti setelah terbukti jarang salah.*
- **P2. Contoh perintah.** 5–10 kalimat yang ingin user ketik ke asisten. Dipakai untuk memastikan alatnya cukup dan sebagai set uji `eval:tanya`.
- **P3. Satu asisten atau dua?** Obrolan **Catat** dan **Tanya AI** digabung jadi satu asisten (mencatat, menjawab, merapikan), atau tetap terpisah dengan Tanya AI yang lebih pintar? *Usulan: tetap terpisah dulu (perubahan tampilan kecil); `usul_catat` hanya untuk kalimat sederhana. Gabung bisa jadi spec berikutnya.*
- **P4. Simpan riwayat obrolan?** Sekarang obrolan hilang saat lembar ditutup. Menyimpannya membuat asisten bisa melanjutkan ("yang tadi itu"), tapi berarti data obrolan tersimpan di database. *Usulan: simpan percakapan terakhir saja (maks 20 pesan), bisa dihapus.*
- **P5. Batas transaksi per usulan.** 200 cukup? Contoh: "jadikan semua top up DANA pindah kantong" dari awal tahun.
- **P6. Batas waktu Urungkan.** Selama baris belum diubah lagi, tanpa batas waktu? Atau maksimal 7 hari?
- **P7. Perbaikan impor DANA ikut spec ini atau duluan?** Kalau ikut, rilisnya lebih lama. Kalau duluan (spec kecil terpisah), data DANA user benar lebih cepat dan fungsinya dipakai ulang di sini. *Usulan: duluan.*
- **P8. Tanda model di jawaban.** Tanpa tombol (D1), tapi perlu tanda kecil "dipikirkan lebih dalam" saat 3.8 dipakai? *Usulan: tidak ada tanda, kecuali catatan saat kuota habis.*
- **P9. Kuota 3.8 Flash.** Angka jatah harian dari halaman AI Studio project user (aistudio.google.com/docs/pricing#gemini-3.8-flash) untuk `GEMINI_MODEL_BERAT_RPD`.

## Keputusan saat implementasi

### Tahap A (9 Nov 2026): fondasi, asisten baca saja + pemilihan model + aliran

Dikerjakan di branch `feat/asisten-agen`, migrasi `20261122000000_pemakaian_ai.sql`. Alat ubah (`usul_*`, `terapkan_usulan`, `urungkan_aksi`, `aksi_asisten`) dan riwayat percakapan (P4) masuk tahap B.

1. **Kode.** `src/lib/rute-model.ts` (lapis 1, `galatKuota`, `CATATAN_KUOTA`), `src/lib/agen.ts` (putaran dua model, murni, model & alat disuntikkan), `src/lib/periksa.ts` (periksa_saldo, cari_kejanggalan, riwayat impor, hasil `cari`; murni), `src/lib/alat-server.ts` (memuat data lewat sesi user untuk keempat alat baca), `src/lib/pengetahuan-aplikasi.ts` (§4), `src/lib/alir.ts` (aliran NDJSON). Deklarasi & pembersih argumen alat baru di `src/lib/tanya.ts`. Uji: `npm run uji:agen`.
2. **Lapis 1 sengaja sempit.** Kuota model besar kecil, jadi "kenapa boros/naik" tentang pengeluaran sebulan **tidak** naik ke model besar: jawabannya ada di ringkasan bulan yang sudah dihitung, dan pertanyaan itu juga kartu saran yang sering ditekan. Yang naik: permintaan merapikan/mengubah banyak ("rapikan", "hapus yang dobel", "buatkan kantong"), penyebab masalah data ("beda sama bank" dalam dua urutan kata, "dobel", "hilang", "saldo … salah/kurang", "kenapa/kok … saldo/tercatat/kantong/rekening koran"), membandingkan semua kantong, rentang > 3 bulan / "dari awal" / "tahun ini", dan lanjutan percakapan yang sudah naik.
3. **Lanjutan tetap di model besar** lewat isian `berat: true` dari browser (dari `model` di jawaban sebelumnya). `model` dikirim di balasan tapi tidak ditampilkan (P8).
4. **Model besar melanjutkan, tidak mulai dari nol**: riwayat + pertanyaan + semua hasil fungsi yang sudah didapat diteruskan sebagai **teks DATA** di pesan user, bukan potongan `functionCall` model ringan. Alasannya penanda pemikiran (thought signature) Gemini terikat pada model yang membuatnya. Hal yang sama berlaku saat model besar kena 429 dan jatuh ke model ringan; sesudah itu `serahkan` tidak ditawarkan lagi.
5. **Naik otomatis**: putaran model ringan habis (4) masih memanggil fungsi, atau jawabannya gagal pemeriksaan angka dua kali (jawaban pertama + satu minta ulang). Di model besar: 10 putaran, pemeriksaan angka + satu minta ulang, lalu `ragu` seperti dulu. Bila model besar tidak boleh dipakai (jatah/kuota), putaran yang habis ditutup dengan panggilan tanpa alat (`toolConfig NONE`) supaya tetap ada jawaban.
6. **Kuota (P9).** Tabel `pemakaian_ai(user_id, tanggal, model, jumlah)`: **baris per user**, bukan satu baris global, supaya RLS tetap per akun dan tidak ada yang bisa membaca/mengubah hitungan akun lain. Selama satu pengguna, hitungannya = global project. Hanya `select` untuk pemilik; tambah lewat RPC `catat_pemakaian_ai(model, jumlah)` (`security definer`, selalu baris `auth.uid()`, jumlah 1–50), baca lewat `pemakaian_ai_hari_ini(model)`. **Tanggal Pasifik** (kuota harian Gemini direset tengah malam waktu Pasifik). Yang dihitung: panggilan sukses ke model besar (satu pertanyaan bisa beberapa panggilan), dicatat sekali di akhir pertanyaan. `GEMINI_MODEL_BERAT_RPD` kosong = tanpa batas hitung; diisi = model besar tidak dipakai bila hitungan hari ini ≥ angka itu. 429/`RESOURCE_EXHAUSTED`/quota dari model besar → model ringan + catatan "Dijawab model ringan, kuota model besar hari ini habis." (juga saat jatah RPD habis).
7. **Saldo bank tidak disimpan saat impor**, tapi pengenal baris rekening koran (`ref_bank`) BRI/Jago/SeaBank memuat saldo sesudah baris itu (`bank:nomor:tanggal[Tjam]:nominal:saldo`). `periksa_saldo` memakai baris rekening koran terakhir kantong itu (urut tanggal, jam, lalu urutan simpan) sebagai saldo bank, dan menghitung saldo aplikasi pada titik yang sama (transaksi sesudah tanggal itu, atau tanggal sama dengan jam lebih besar bila keduanya berjam, tidak ikut). Pengenal tanpa saldo (bunga bulanan, Jago tanpa saldo) dilewati. Tambahan dari spec: argumen opsional **`saldo_bank`** (saldo yang disebut user, dibandingkan dengan saldo aplikasi sekarang atau pada `sampai`); angka yang diketik user sudah boleh dipakai pemeriksa angka.
8. **Calon penyebab `periksa_saldo`**: `dobel` (kantong, jenis, nominal sama, ±1 hari, asal beda), `pindah_lepas` (keluar di satu kantong uang + masuk bernominal sama di kantong uang lain, ±1 hari: satu perpindahan dicatat dua kali), `tampak_pindah_kantong_sendiri` (`cariCalonPindah` ke kantong ini dan dari kantong ini ke kantong uang lain), `pindah_tanpa_baris_bank` (pindah kantong di rentang rekening koran kantong ini tanpa baris bank di sisi kantong ini), `sesudah_rekening_koran` (hanya saat membandingkan dengan saldo sekarang yang disebut user), dan `draft_belum_dihitung`. `cocok_dengan_selisih` menandai yang nominal/totalnya persis selisih. Contoh paling banyak 10 per jenis.
9. **`cari_kejanggalan`**: `perlu_dilengkapi`, `draft`, `dobel`, `topup_tanpa_kantong` (pengeluaran tercatat yang teksnya "top up/isi saldo" ke bank/e-wallet yang dikenal `namaLembaga` dan tidak cocok dengan kantong mana pun, dikelompokkan per lembaga), `pindah_lepas`. Data dimuat sekali per pemanggilan (paling banyak 5.000 transaksi terbaru, semua status), dihitung di kode.
10. **`impor` tanpa tabel riwayat**: tidak ada yang menyimpan riwayat impor, jadi diturunkan dari baris berpengenal rekening koran per kantong & bulan (jumlah baris, rentang, bank dari awalan pengenal, saldo bank di baris terakhir bulan itu, yang perlu dilengkapi, tanggal simpan terakhir). Saldo aplikasi di akhir bulan itu ada di `periksa_saldo` (`sampai`).
11. **`cari`**: satu alat, `saring` berupa objek (model kadang menaruh saringannya di tingkat atas; itu juga dibaca). `asal` memakai nama yang dimengerti (`rekening_koran`, `ketikan`, `struk`, `bukti_bayar`) → kolom `source`. Total `cari` transaksi hanya yang tercatat; draft dijumlah terpisah (`draft_belum_dihitung`) karena belum dihitung ke saldo. Kantong yang disebut tapi tidak ada dilaporkan ke model (`kantong_tidak_dikenal` + daftar kantong), bukan diam-diam mencari di semua kantong. Kata cari dibersihkan `bersihkanCari` (sama dengan Riwayat) sebelum dirangkai ke filter PostgREST. Paling banyak 50 baris rinci dan 50 kelompok; sisanya diringkas. Tautan: `cari` transaksi → Riwayat (draft tanpa tautan; saringan yang tidak dimengerti Riwayat → "Lihat semua di Riwayat"), kantong/simpanan/deposito → Lihat kantong, cicilan/pinjaman → Utang & Piutang, tujuan → tujuan tabungan, `periksa_saldo` → Lihat kantong; `detail` dan `cari_kejanggalan` tanpa tautan.
12. **`detail`**: id harus berbentuk uuid. Transaksi (semua status) beserta ikutan, induk, bagian pecahan, cicilan, baris rekening koran per sisi (bank, tanggal, jam, nominal, saldo bank sesudah baris; 4 digit akhir rekening tidak dikirim), dan "Cara dicatat" lewat RPC `jejak_catat` yang sudah ada (asal, teks ≤ 300 karakter, hasil baca AI, 12 tanya-jawab terakhir, cara simpan, ada gambar; foto tidak dikirim). "Riwayat ubah" hanya waktu dibuat & diubah (tidak ada log perubahan). Id kantong → rincian kantong.
13. **Aliran.** `/api/tanya` mengalirkan NDJSON bila diminta `Accept: application/x-ndjson`: `{t:"langkah",teks}`… lalu `{t:"jawaban",isi}` atau `{t:"galat",error}`. Tanpa header itu, balasannya JSON seperti dulu (skrip `eval:tanya`, tiruan e2e lama). **Jawaban akhir dikirim utuh sesudah pemeriksaan angka**, tidak kata per kata, supaya nominal yang belum terverifikasi tidak sempat tampil lalu berubah. Langkah dibuat kode dari nama & argumen fungsi ("Mencari top up DANA…", "Memeriksa saldo Jago…", "Menyelidiki lebih jauh…" saat naik), tidak pernah menyebut model.
14. **Waktu.** Asisten berhenti sendiri di 50 detik, route memotong di 55. Sisa < 15 detik → fungsi yang diminta tidak dijalankan, model diminta menjawab dengan yang sudah ada dan menawarkan melanjutkan. Waktu benar-benar habis di tengah panggilan → kode menyusun jawaban dari langkah yang sudah dikerjakan. Keduanya `lanjutkan: true` → tombol **Lanjutkan** di bawah jawaban terakhir, yang mengirim "Lanjutkan" beserta riwayatnya.
15. **Batas**: pertanyaan 1.000 karakter (server & `maxLength`), riwayat 20 pesan (browser & server; tiap pesan riwayat dipotong 2.000 karakter), Flash-Lite 4 putaran (+ `serahkan`), model besar 10.
16. **Pengetahuan aplikasi** ± 1.400 token di `src/lib/pengetahuan-aplikasi.ts`, termasuk batas tahap A: asisten belum bisa mengubah data selain usulan ubah kategori dan menjelaskan langkahnya di aplikasi. Cache konteks Gemini (eksplisit) belum dipakai; prompt sistem sama untuk semua pertanyaan di hari & bulan yang sama.
17. **Keamanan**: prompt menegaskan teks di hasil fungsi dan riwayat (merchant, keterangan, uraian rekening koran, hasil baca struk, tanya-jawab "Cara dicatat") adalah data; semua alat hanya membaca lewat sesi user (RLS); tidak ada SQL bebas. Yang ditulis `/api/tanya` hanya hitungan `pemakaian_ai`.
18. **Model besar sibuk/lambat (temuan saat `eval:tanya`, 9 Nov 2026).** `gemini-3.8-flash` di free tier sedang penuh: satu panggilan paling sederhana tidak menjawab lebih dari 3 menit, percobaan berikutnya `503 … high demand` sesudah 48 detik. Tanpa pengaman, setiap pertanyaan berat habis waktu dengan "Waktunya habis…". Maka: satu panggilan model besar dibatasi **20 detik** (`BATAS_PANGGIL_BERAT_MS`, permintaannya dibatalkan lewat `AbortSignal`), dan bila lewat, atau Gemini menjawab 503/500/`UNAVAILABLE`, model ringan melanjutkan dengan hasil yang sudah didapat (seperti 429), dengan catatan **"Dijawab model ringan, model besar sedang sibuk."** (tambahan dari spec: P8 hanya menyebut catatan kuota). Naik ke model besar di tengah jalan hanya bila sisa waktu ≥ 30 detik; bila waktu habis saat model besar masih bekerja sesudah model ringan punya jawaban, jawaban model ringan itu yang dipakai (dengan tanda ragu bila ada), bukan "Waktunya habis…".

## Belum diterapkan

- **Server MCP**: aplikasi menyediakan alat-alat di atas lewat MCP + OAuth supaya Claude (claude.ai / Claude Code) bisa bekerja langsung dengan data user.
- **Batas kuota per pengguna** setelah ada pengguna lain.
- **Mesin AI lain** (Claude lewat API Anthropic) sebagai pilihan lewat env, bila Gemini free tier tidak cukup.
- **Aksi langsung tanpa kartu** di luar yang disetujui di P1.
