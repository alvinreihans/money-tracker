# Spec: Periksa dulu sebelum tersimpan

Status: **diterapkan, belum dirilis** (arah & K1–K2 diputuskan user 9 Nov 2026; diterapkan 9 Nov 2026) · 9 November 2026 · branch `feat/periksa-dulu` · dikerjakan **sebelum** [SPEC-asisten-agen](SPEC-asisten-agen.md) · menyentuh [SPEC-catat-chat](SPEC-catat-chat.md) (draft), [SPEC-catat-tuntas](SPEC-catat-tuntas.md), [SPEC-lengkapi](SPEC-lengkapi.md) (unggah banyak), [SPEC-impor-rekening](SPEC-impor-rekening.md) (pratinjau), [SPEC-enkripsi](SPEC-enkripsi.md)

## Masalah

Hasil Catat yang sudah lengkap **langsung tersimpan** (kartu "✓ Tersimpan"), lalu dihitung ke saldo dan laporan. Kalau AI salah baca, user baru tahu sesudahnya dan harus mencarinya di Riwayat. Contoh (8 Nov 2026, rekaan dari pola data user): screenshot "Send Money … to <nama user> – JAGO ••1234", user menjawab "Aku kirim", lalu langsung tersimpan sebagai **pengeluaran Rp 400.000**, padahal uangnya hanya pindah ke rekening sendiri.

User: "setiap unggahan harus dicek dulu sebelum tersimpan … harus menampilkan detail transaksi dulu. kalau oke baru disimpan."

Selain itu, setelah tersimpan, **jejak cara mencatatnya hilang**: foto draft dan teks OCR dihapus saat dikonfirmasi (`draft_catat`, `raw_ocr_text = null`). User tidak bisa melihat lagi kenapa transaksi tercatat seperti itu.

## Keputusan dari diskusi (9 Nov 2026)

| # | Keputusan |
|---|---|
| D1 | **Semua hasil Catat dicek dulu**: ketikan, gambar (struk/screenshot), dan bukti transfer. Tersimpan (dihitung) baru setelah user menekan **Simpan**. |
| D2 | **Rekening koran tidak dicek satu per satu** (puluhan sampai ratusan baris). Pratinjau impor yang sudah ada tetap jadi langkah cek, ditambah **rincian per baris yang bisa dicentang**. |
| D3 | **Unggah banyak gambar**: tiap gambar satu kartu, plus tombol **Simpan semua (n)** untuk kartu yang lengkap dan tidak ditandai. |
| D4 | **Riwayat cara mencatat disimpan per transaksi** dan tampil di detail transaksi ("Cara dicatat"). Riwayat percakapan bergaya ChatGPT hanya untuk Tanya AI (SPEC-asisten-agen P4). |

## Usulan perilaku

### 1. Kartu "Periksa dulu" (ketikan, gambar, bukti transfer)

- Hasil Catat **selalu disimpan sebagai draft** (`needs_review`) dulu, juga bila semua isian sudah lengkap. Draft tidak dihitung ke saldo, laporan, budget, dan Analitik (perilaku draft yang sudah ada).
- Pertanyaan yang masih kurang (nominal, arah, kantong, kantong tujuan, kartu, jam, duplikat) diajukan dulu seperti sekarang. Kartu periksa muncul **sesudah semuanya terisi**, menggantikan kartu "✓ Tersimpan".
- **Isi kartu** (hanya baris yang relevan):
  - jenis (Keluar / Masuk / Pindah kantong);
  - nominal;
  - merchant/penerima;
  - kategori & kelompok;
  - kantong, atau dari → ke untuk pindah kantong;
  - tanggal & jam;
  - keterangan;
  - ikutan (biaya admin, cashback);
  - cicilan/paylater bila ada;
  - thumbnail gambar bila dari gambar.
- **Tombol**:
  - **Simpan** (tombol utama, selebar kartu): status → `confirmed`, ikutan ikut, nomor cicilan ditetapkan. Logika "selesai" yang sekarang ada di `jawab/route.ts` dipindah ke satu fungsi bersama.
  - **Ubah**: membuka form edit dengan isian terbaca. Menyimpan form = Simpan.
  - **Buang**: draft dihapus, dengan snackbar Urungkan.
- **Ketikan** tetap cepat: tombol Simpan langsung terfokus, jadi **Enter** atau satu ketukan menyimpan. Ketikan berikutnya saat kartu periksa terbuka diperlakukan sebagai koreksi (pola `cerita` yang sudah ada), bukan transaksi baru.
- Kalimat bot sesudah Simpan tetap ("Makasih udah dilengkapi! …"). Kartu sesudah Simpan menampilkan "✓ Tersimpan" seperti sekarang.
- Kartu periksa yang ditinggal (lembar Catat ditutup) tetap ada sebagai draft di **Belum selesai** dengan label **"Tinggal dicek"** (label `konfirmasi` yang sudah ada). Pengingat draft (SPEC-notifikasi) ikut menghitungnya. Umur draft maksimal 30 hari tetap berlaku.
- **Pengecualian**: hasil yang tidak membuat transaksi baru tidak memakai kartu ini, karena sudah punya kartu konfirmasi sendiri:
  - Lengkapi (melengkapi transaksi yang ada; kartu Lengkapi = cek);
  - "Jadikan pindah" (A-3/B-7 SPEC-kantong-sendiri);
  - catat manual lewat form, karena formnya sendiri adalah cek.

### 2. Unggah banyak gambar: Simpan semua

- Unggah beberapa gambar sekaligus (antrean "Lagi proses struk · sisa n", SPEC-lengkapi §unggah banyak): tiap gambar yang membuat transaksi baru → satu kartu periksa.
- Di atas daftar kartu: **Simpan semua (n)**, dengan n = kartu yang **lengkap dan tidak ditandai**.
- **Tidak ikut** Simpan semua, tetap di layar sebagai kartu sendiri:
  - masih ada pertanyaan (mis. kantong mana);
  - ditandai **dugaan dobel** (`duplikat_dari`);
  - hasil AI ragu (angka tidak terbaca pasti / perkiraan).
- Ringkasan sesudahnya: "5 tersimpan · 2 perlu dicek", dengan Urungkan untuk yang baru tersimpan.
- Snackbar ringkasan unggah sekarang ("3 struk: 1 melengkapi transaksi, 2 dicatat baru") menjadi "3 struk: 1 melengkapi transaksi, 2 **perlu dicek**", dengan **Lihat** membuka daftar kartu.

### 3. Rekening koran: rincian di pratinjau

- Pratinjau tetap per rekening (kartu yang ada: baris baru, perlu dilengkapi, saldo bank vs aplikasi, peringatan, tawaran kantong baru), ditambah tautan **Lihat rincian (n baris)**.
- **Rincian** = daftar baris yang akan dibuat/ditautkan/diubah, per rekening. **Yang perlu perhatian di atas**, ditandai:
  - pindah kantong (dikenali) — "Pindah ke DANA";
  - kantong baru;
  - kategori dari bulan lalu;
  - diubah jadi pindah kantong (R2);
  - deposito jatuh tempo;
  - dugaan dobel dengan transaksi yang sudah ada;
  - baris biasa (Lainnya, perlu dilengkapi), dilipat per tanggal.
- Tiap baris **bisa dicentang/tidak** (bawaan: tercentang). Baris yang tidak dicentang tidak diimpor. Saldo "menurut aplikasi" di pratinjau ikut dihitung ulang tanpa baris itu, dan peringatan saldo muncul bila jadi beda dengan bank.
- Baris yang tidak dicentang **tidak diingat**. Impor ulang berkas yang sama menawarkannya lagi sebagai baris baru (perilaku `ref_bank` yang sudah ada).
- Pasangan pindah kantong dua sisi (§6) dicentang/tidak bersama.
- Tanpa membuka rincian, perilaku sama dengan sekarang: tombol Impor mengimpor semuanya.

### 4. "Cara dicatat" per transaksi

- Setiap transaksi yang dibuat lewat Catat menyimpan **jejak pencatatannya**:
  - asal (ketikan / gambar / bukti transfer / unggah banyak);
  - teks ketikan atau ringkasan hasil baca AI (merchant, nominal, tanggal, sumber dana, pengirim/penerima);
  - pertanyaan & jawaban user berurutan ("Ini uang keluar atau masuk?" → "Aku kirim ke …");
  - koreksi lewat ketikan;
  - waktu Simpan;
  - thumbnail gambar (lihat **K1**).
- Tampil di **detail transaksi** sebagai bagian terlipat **"Cara dicatat"** di bawah "Masuk lewat", berisi gelembung percakapan ringkas yang hanya-baca.
- Transaksi dari rekening koran: "Cara dicatat" berisi berkas & baris bank asalnya (nama berkas, bank, uraian baris). Bila sudah ada di keterangan/`ref_bank`, tidak disimpan dua kali; ditampilkan dari situ.
- Transaksi yang dilengkapi (Lengkapi): jejak gambar pelengkapnya ditambahkan ke jejak transaksi itu.
- **Dihapus bersama transaksinya.** Disimpan **terenkripsi** dengan kunci Vault yang sama dengan teks transaksi (SPEC-enkripsi), karena berisi merchant, nama, dan nominal.
- Nanti dibaca asisten (SPEC-asisten-agen, alat `detail`) untuk menjawab "kenapa transaksi ini begini?".

## Data

- Tidak ada status baru: "belum dicek" = `needs_review` yang semua isiannya lengkap (`pertanyaanDraft` → `konfirmasi`).
- `simpanTransaksi` dan `upload-receipt` selalu menyisipkan `needs_review` untuk transaksi baru dari Catat. Catat manual tidak berubah.
- Endpoint `POST /api/draft/[id]/simpan` (Simpan satu) dan `POST /api/draft/simpan` `{ids}` (Simpan semua; server memeriksa ulang syarat "lengkap & tidak ditandai" per id).
- Tabel baru `private.jejak_catat` (pola `private.draft_catat`):
  - kolom `transaksi_id` (FK `on delete cascade`), `user_id`, `isi_enc bytea` (JSON terenkripsi), `foto_enc bytea` (opsional, K1), `dibuat`;
  - diakses lewat RPC `security definer` yang memeriksa pemilik: `tambah_jejak(p_id, p_isi jsonb)`, `jejak_catat(p_id)`;
  - RLS aktif, `revoke all` dari anon/authenticated.

  Thumbnail draft yang sekarang dihapus saat dikonfirmasi **dipindah** ke `jejak_catat` bila K1 = simpan.
- Impor: `impor_rekening` menerima daftar `ref` yang dikecualikan. Tanpa perubahan bila pengecualian cukup dilakukan di klien/`rencana.ts` sebelum dikirim.

## Pengujian

- **Unit:**
  - hasil Catat lengkap → `needs_review` + pertanyaan `konfirmasi`;
  - Simpan memakai logika selesai bersama (ikutan, cicilan);
  - syarat Simpan semua (pertanyaan terbuka, dugaan dobel, ragu → tidak ikut);
  - saldo pratinjau impor tanpa baris yang tidak dicentang;
  - isi jejak (urutan tanya-jawab, koreksi).
- **RPC:** `jejak_catat` hanya untuk pemilik; terhapus bersama transaksi; `uji:isolasi` ditambah.
- **E2E** (jawaban AI ditiru seperti suite yang ada):
  - ketikan → kartu periksa → Enter → tersimpan, saldo berubah sesudahnya (bukan sebelumnya);
  - gambar → Ubah → simpan dari form;
  - Buang → Urungkan;
  - tutup lembar → "Tinggal dicek" di Belum selesai → buka → Simpan;
  - unggah 3 gambar (1 dugaan dobel) → Simpan semua (2) → "2 tersimpan · 1 perlu dicek";
  - impor rekening koran → Lihat rincian → hapus centang 1 baris → saldo pratinjau berubah → Impor → baris itu tidak ada;
  - detail transaksi → "Cara dicatat" berisi tanya-jawab;
  - 360px & 1024px.
- Suite E2E lama yang mengharapkan "Tersimpan" langsung disesuaikan (tambah langkah Simpan).

## Keputusan user (9 Nov 2026)

| # | Keputusan |
|---|---|
| K1 | **Thumbnail gambar disimpan** di "Cara dicatat" (WebP ±720 px, terenkripsi, ikut terhapus bersama transaksi). **PDF rekening koran tidak disimpan** (berat): jejak transaksi rekening koran hanya teks (nama berkas, bank, uraian baris). Bila transaksi rekening koran **dilengkapi dari gambar** (Lengkapi), thumbnail gambar pelengkapnya **disimpan**. |
| K2 | **Ketikan sederhana tetap lewat kartu periksa** (Enter = Simpan). |

## Pertanyaan terbuka (terjawab)

- **K1. Thumbnail gambar disimpan setelah transaksi tersimpan?** Sekarang thumbnail (WebP ±720 px, terenkripsi) dihapus saat draft selesai.
  - (a) Disimpan di "Cara dicatat". Bisa dilihat lagi kapan saja; ±50 KB per gambar.
  - (b) Tidak disimpan, hanya teks hasil baca.

  *Usulan: (a)*, karena gambar adalah bukti paling jelas saat mengecek kenapa sebuah transaksi tercatat begitu. Ikut terhapus bersama transaksinya.
- **K2. Ketikan yang sangat sederhana** ("kopi 25rb gopay", semua isian pasti dan kantongnya ada): tetap kartu periksa (D1), atau boleh langsung tersimpan dengan Urungkan? *Usulan: tetap kartu periksa (sesuai D1)* dengan Enter untuk Simpan; dilonggarkan nanti bila terasa lambat.

## Keputusan saat implementasi

Diterapkan 9 Nov 2026 di branch `feat/periksa-dulu` (migrasi `20261121000000_jejak_catat.sql`).

1. **Kode bersama.** Logika "selesai" pindah dari `jawab/route.ts` ke `selesaikanDraft` di `src/lib/simpan-draft.ts`, dipakai `POST /api/draft/[id]/simpan`, `POST /api/draft/simpan` `{ids}`, dan form Ubah. `jawab` tidak lagi mengonfirmasi: jawaban terakhir mengembalikan pertanyaan `konfirmasi` (kartu periksa). Syarat Simpan semua = `alasanTidakIkut` di `src/lib/draft.ts` (`tanya` / `dobel` / `ragu` / null), diperiksa ulang di server per id.
2. **"Ragu"** = hasil yang oleh pipeline AI dianggap tidak valid (status `needs_review` dari pipeline, bukan karena dugaan dobel). Ditandai di petunjuk draft (`bukti_transfer.petunjuk.ragu`, tanpa kolom baru); kartunya menulis "Hasil bacanya kurang yakin…" dan tidak ikut Simpan semua.
3. **Belum punya kantong sama sekali**: hasil Catat tetap draft, tapi tidak ditanya "Pakai kantong apa?" (petunjuk `tanpa_kantong`), jadi langsung kartu periksa — sama dengan sebelumnya (dicatat tanpa kantong).
4. **Belanja paylater bertenor** tetap langsung jadi rencana cicilan dengan kartu "Cicilan dibuat" (Ubah | Selesai): tidak membuat transaksi dan tidak mengubah saldo, jadi tidak lewat kartu periksa.
5. **Lembar ringkas.** Ketikan yang langsung lengkap menampilkan kartu periksa di lembar ringkas (tidak membesar); Simpan terfokus, Enter menyimpan, lalu kartu "✓ Tersimpan" hilang sendiri seperti dulu. Ada pertanyaan → lembar membesar seperti dulu. Sesudah Simpan: tanpa pertanyaan → kartu Tersimpan (Batalkan | Ubah | + Tambah cerita); dengan pertanyaan atau dibuka dari Belum selesai → Ubah | Selesai, "Makasih udah dilengkapi!", lalu tutup sendiri. "Saldo GoPay sekarang berapa?" (kantong yang dibuat di tempat) kini ditanya sesudah Simpan.
6. **Ubah** membuka form edit di tempat (lembar di atas obrolan / hasil unggah / detail), bukan pindah ke halaman detail. Untuk draft, form menyimpan isiannya lalu memanggil Simpan (`form: true`: pertanyaan jam & dugaan dobel tidak menghalangi, karena formnya sendiri adalah cek). Tombol "Isi manual" di obrolan juga membuka form ini.
7. **Buang → Urungkan**: baris draft (dengan ikutan & pecahannya) dan thumbnail-nya disalin lalu dimasukkan lagi dengan id sama (pola Urungkan hapus SPEC-catat-tuntas). Jejak tanya-jawab draft yang dibuang tidak ikut kembali.
8. **Detail draft "Tinggal dicek"** menampilkan pesan "Tinggal dicek" dengan **Simpan** dan **Ubah** (bukan "Struk atau teksnya nggak berhasil dibaca").
9. **Push Bagikan di latar**: draft yang lengkap dikabari "Struk barusan tinggal dicek" (bukan "belum lengkap").
10. **Unggah banyak**: teks snackbar tidak perlu diubah — `teksRingkasan` sudah menghitung draft sebagai "perlu dicek"; karena semua hasil baru kini draft, "dicatat baru" tinggal untuk rencana cicilan. Daftar kartu ada di lembar "Hasil unggah" (Lihat): **Simpan semua (n)**, kartu periksa untuk yang lengkap (yang ragu juga kartu, dengan catatan "Tidak ikut Simpan semua"), baris yang dibuka di obrolan untuk yang masih ditanya / dugaan dobel. Urungkan Simpan semua (`POST /api/draft/urungkan`) mengembalikan isi sebelum Simpan (teks, petunjuk, nomor cicilan) dan memindah jejak & thumbnail kembali ke draft.
11. **Rekening koran**: pengecualian lewat `pilihan.kecuali` (ref baris) di `rencana.ts`, jadi RPC `impor_rekening` tidak berubah dan saldo pratinjau otomatis dihitung ulang. Rincian (`src/lib/rekening/rincian.ts`) disusun dari rencana **tanpa** pengecualian (rencana kedua di `susunRencana`), supaya baris yang tidak dicentang tetap tampil. Bunga bulanan bisa tidak dicentang (pengenal bulanannya). Baris deposito jatuh tempo ditampilkan di "Perlu perhatian" tapi **tidak bisa** dikecualikan satu per satu (pencocokan jatuh tempo memakai semua barisnya). Baris yang ditautkan ke transaksi yang sudah ada ikut tampil ("Sudah tercatat, ditautkan") dan bisa tidak dicentang. Rincian dibuka sebagai lembar "Rincian <rekening>" dengan saldo/peringatan di atasnya.
12. **`private.jejak_catat`** boleh lebih dari satu baris per transaksi (kolom `id`): Simpan, Lengkapi dari gambar lain, dan koreksi lewat ketikan sesudah tersimpan masing-masing menambah baris. Jejak selama draft disimpan di kolom baru `private.draft_catat.jejak_enc` (terenkripsi) lewat RPC `catat_jejak_draft`, lalu digabung ke `jejak_catat` oleh `tambah_jejak(p_id, p_isi, p_foto?, p_dari?)` — thumbnail draft ikut pindah (K1); `p_foto` untuk gambar pelengkap Lengkapi; `p_dari` untuk "Lengkapi yang sudah ada" (jejak & thumbnail draft itu pindah ke transaksi yang dilengkapi). RPC tambahan: `foto_jejak(id)` dan `urungkan_jejak(p_id)`. Semuanya `security definer` dengan pemeriksaan pemilik; tabelnya RLS aktif dan `revoke all` dari anon/authenticated/service_role.
13. **Jejak gambar pelengkap dari kartu Lengkapi**: `/api/lengkapi` menerima JSON tanpa gambar, jadi sesudah Lengkapi berhasil obrolan mengirim gambarnya ke `POST /api/transaksi/[id]/jejak` (thumbnail dibuat di server). Unggah banyak yang langsung melengkapi menyimpan thumbnail-nya di `/api/upload-receipt`.
14. **"Cara dicatat" rekening koran**: bank dari awalan `ref_bank` dan uraian baris dari keterangan. **Nama berkas tidak ditampilkan**: tidak disimpan di mana pun, dan menyimpannya berarti menulis jejak per baris saat impor (ratusan baris).
15. **"Cara dicatat"** hanya tampil bila ada jejaknya (transaksi lewat Catat sejak versi ini, atau rekening koran); transaksi manual dan yang lebih lama tidak menampilkannya.
16. **Uji E2E**: `/api/catat-teks` menerima `hasil` (hasil baca yang dikirim balik, tanpa AI) seperti `/api/upload-receipt`, supaya ketikan bisa diuji tanpa kuota AI.
