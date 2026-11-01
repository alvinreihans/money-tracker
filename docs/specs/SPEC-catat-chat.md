# Spec: Catat sebagai obrolan (pengganti "Perlu dibenerin")

Status: **diterapkan (Fase A + B)** · rilis 2.1.0 (25 Okt 2026) · migrasi `20261030000000_draft_catat.sql` · 23 Oktober 2026 · disinkronkan dengan kode 1 Nov 2026

Kode utama: `src/components/Obrolan.tsx` (lembar), `src/components/Catat.tsx` (konteks, tombol +, snackbar, antrean), `src/lib/draft.ts` (pertanyaan & pembaca jawaban, fungsi murni), `src/app/api/draft/[id]/jawab/route.ts`.

## Tujuan

Mencatat terasa seperti memakai aplikasi AI (ChatGPT/Gemini/Claude): ketik atau kirim foto, lihat balasan, jawab pertanyaan. Kalau AI kurang yakin, **ia bertanya di tempat**, bukan menaruh transaksi di tab "Perlu dibenerin" yang mudah terlupa. Tab itu **dihapus**.

Keputusan yang sudah diambil (23 Okt):

| | Keputusan |
|---|---|
| Wadah | **Lembar yang bisa membesar** (expandable sheet) — tetap modal |
| Percakapan | **Daftar percakapan**, satu per catatan yang belum lengkap; **dihapus begitu selesai** (beserta foto & chat) |
| Foto | **Thumbnail disimpan** selama percakapan ada (supaya ingat ini transaksi apa) |
| Umur | Maks **30 hari**; pengingat push **hari ke-1 dan ke-7**; lewat 30 hari **dihapus otomatis** |
| Suara | **Tidak ada** voice-to-text |
| Satuan | **1 gambar = 1 transaksi = 1 sesi obrolan.** Kamera sekali jepret, galeri 1 gambar; catatan baru mengosongkan obrolan (yang belum selesai tetap di daftar) |
| Selesai memperbaiki | Kartu **Ubah \| Selesai** + bubble penutup + hitung mundur, lalu lembar menutup sendiri |

## Konsep

```
ketik / foto / bagikan
        │
        ▼
   AI membaca ── lengkap ──▶ tersimpan langsung · kartu hasil [Ubah] [Batalkan]
        │                    (tidak jadi percakapan, tidak ada yang disimpan selain transaksinya)
        └── kurang ─────────▶ PERCAKAPAN: foto/teks asli + pertanyaan
                              dijawab → lengkap → tersimpan, percakapan & foto dihapus
                              tidak dijawab → tetap di daftar (pengingat H+1, H+7; hapus H+30)
```

## Tampilan (One UI)

### Lembar ringkas

```
┌──────────────────────────────────────┐
│               ───                    │ ← pegangan (tarik ke atas = besar)
│ Catat transaksi                      │
│ 📋 2 belum selesai              ›    │ ← hanya kalau ada; ketuk = buka daftar
│ (🕘 warteg 12rb Tunai) (🕘 …)         │ ← saran transaksi terakhir, hanya saat kolom kosong; ketuk = isi kolom
│ ┌──────────────────────────┐  ┌───┐  │
│ │ 📝 kopi 25rb gopay  📎 📷 │  │ ➤ │  │ ← pola WhatsApp (diputuskan 23 Okt)
│ └──────────────────────────┘  └───┘  │
└──────────────────────────────────────┘
```

Kolom ketik ala WhatsApp (`textarea`, Enter mengirim): 📝 kiri = form Manual (saat ada pertanyaan: "Isi manual" = buka halaman detail catatan itu); 📎 = galeri, 📷 = kamera (disembunyikan saat mengetik); tombol kirim bulat di luar kapsul. Gambar yang ditempel (Ctrl+V) ikut jadi lampiran. Tiga ubin Kamera/Galeri/Manual dihapus. Selama membaca: "Lagi dibaca...". Kartu hasil catatan lengkap di lembar ringkas hilang sendiri setelah 5 detik (bilah sisa waktu; tidak hilang selama menulis cerita, SPEC-cerita-tanya).

### Lembar besar (obrolan)

Membesar sendiri saat ada pertanyaan, foto masuk, atau ditarik ke atas (> 40px; ketuk pegangan = bergantian); turun lagi bila ditarik ke bawah.

```
┌──────────────────────────────────────┐
│ ‹  Catat transaksi              ───  │
│                                      │
│                beli makan warteg 20k │ ← kamu
│ Pakai kantong apa?                   │ ← aplikasi
│ (💵 Tunai) (🟢 GoPay) (🏦 BCA) (…)    │ ← ketuk, atau ketik jawabannya
│                               GoPay  │
│ ┌──────────────────────────────────┐ │
│ │ 🍜 Makan · warteg     − Rp 20.000│ │ ← kartu hasil (selalu data terkini)
│ │ GoPay · hari ini                 │ │
│ │              [Batalkan] [Ubah]   │ │
│ └──────────────────────────────────┘ │
│                      ┌─────────┐     │
│                      │ 🧾 foto │     │ ← kamu kirim struk
│                      └─────────┘     │
│ ⏳ Membaca struk…                     │
│ ┌──────────────────────────────┐ (↑) │
│ │ Ketik…                    📎 │     │
│ └──────────────────────────────┘     │
└──────────────────────────────────────┘
```

### Daftar percakapan (di dalam lembar besar)

```
│ ‹  Belum selesai                     │
│ Yang belum lengkap disimpan di sini  │
│ sampai 30 hari, lalu dihapus …       │
│ ┌────┐ Struk · 22 Okt                │ ← merchant, “teks ketikan”, atau "Struk"
│ │🧾  │ Nominal belum kebaca          │ ← yang kurang (lihat tabel pertanyaan)
│ └────┘ Dihapus otomatis 21 Nov  ›    │
│ ┌────┐ "transfer ke budi 50k" · 22 Okt│
│ │ 📝 │ Kantong belum jelas            │
│ └────┘ Dihapus otomatis 21 Nov  ›    │
```

### Kamera, galeri & bagikan

- **Kamera**: layar penuh seperti sekarang, **sekali jepret** → kembali ke obrolan dengan foto terlampir di komposer (boleh ditambah keterangan, mis. "pakai BCA", supaya AI tidak perlu bertanya) → kirim.
- **Galeri**: pilih **1 gambar** → terlampir → kirim. Komposer menampung maksimal 1 lampiran; memilih lagi menggantinya. Lampiran hilang bila lembar ditutup.
- **Bagikan** dari aplikasi lain: tanpa komposer, langsung diproses di latar oleh service worker (Fase B). Android bisa membagikan beberapa gambar sekaligus — **masing-masing diproses sendiri**: yang lengkap tersimpan, yang kurang menjadi percakapannya sendiri.
- **Seret foto** ke aplikasi (desktop/tablet, SPEC-layar-lebar) dan gambar Bagikan yang gagal diunggah di latar masuk **antrean** di halaman: snackbar "Lagi proses struk · sisa n", lalu ringkasan "n tercatat · n belum lengkap · n gagal" dengan aksi "Lengkapi" (buka daftar Belum selesai).
- Sheet "Struk" dihapus.

### Selesai memperbaiki

**Perilakunya sama untuk setiap transaksi yang sempat ditanya, dari mana pun datangnya** — ketik, kamera, galeri, bagikan, atau dibuka dari daftar Belum selesai / kartu Beranda / push:

1. Kartu hasil dengan tombol **Ubah | Selesai** (bukan Batalkan): **Ubah** menutup lembar dan membuka halaman detail transaksi itu; **Selesai** langsung menutup tanpa menunggu.
2. Komposer disembunyikan; bubble penutup: *"Makasih udah dilengkapi! 🙌 Transaksinya sudah tercatat. Kalau perlu diubah lagi, cek di Riwayat."* dengan hitung mundur **8 detik** (`TUTUP_DETIK`) dan bilah sisa waktu tanpa teks.
3. Habis hitungan: lembar ditutup (kembali ke halaman di belakangnya), atau ke daftar **Belum selesai** kalau masih ada draft lain.
4. Ketuk Ubah / Kembali → hitung mundur batal (tidak menutup saat user sedang berbuat sesuatu).

Belanja paylater yang jadi rencana cicilan saat dijawab memakai penutup yang sama dengan teks *"Sip, dicatat sebagai cicilan. …"* (SPEC-paylater).

Catatan yang **langsung lengkap** (tanpa pertanyaan): kartu **Batalkan | Ubah**, lembar tetap terbuka untuk catatan berikutnya.

Juga muncul sebagai **kartu di Beranda**: "2 catatan belum selesai · Ketuk untuk melengkapi" → membuka lembar besar di daftar ini. Titik oranye di menu Riwayat pindah ke tombol **+**.

### Kesesuaian One UI

- Komposer & pilihan di **area interaksi** bawah; isi obrolan di area atas (viewing area). [Layout]
- Pilihan jawaban = chip di bawah pertanyaan, mirip dialog pilihan di bawah layar. [Dialog]
- Beranda di belakang lembar diredupkan (lapisan berbeda); tidak redup + bayangan sekaligus. [Visual depth]
- Gerak memakai `--gerak` One UI; ikut setelan "kurangi gerakan".
- Gestur **Kembali** (juga Esc): kamera → obrolan → daftar (kalau dibuka dari daftar)/ringkas → tutup (tidak meninggalkan halaman).

## Pertanyaan yang diajukan

Sebagian besar **tanpa panggilan AI** (cepat, hemat kuota Groq):

Urutannya tetap (`pertanyaanDraft`): nominal/cerita → arah → tenor → kantong → kantong tujuan → jam → duplikat → konfirmasi.

| Yang kurang | Pertanyaan | Cara jawab | AI? |
|---|---|---|---|
| Tidak terbaca sama sekali (nominal 0, tanpa merchant/kategori) | "Aku belum nangkep. Ceritain transaksinya? Misalnya “bensin 150rb pakai BCA”." Putaran berikutnya: "Hmm, masih belum jelas. Sebut nominal & kantongnya ya." | Ketik bebas → digabung dengan teks/OCR asli (ditandai "Penjelasan dari pengguna") → AI membaca ulang | Ya |
| Masih belum jelas setelah 2 putaran (`MAKS_CERITA`) | "Masih belum kebaca nih. Isi manual aja?" | Chip **📝 Isi manual** → halaman detail draft (Edit) | Tidak |
| Nominal (merchant/kategori sudah terbaca) | "Berapa nominalnya?" | Ketik di **kolom bawah** — berubah jadi keyboard angka dengan pemisah ribuan (1.500.000); "150rb", "1,5jt" juga terbaca | Tidak |
| Arah bukti transfer | "Ini kamu yang kirim ke Rina, atau terima dari Dewi?" | Chip (SPEC-catat-tuntas) | Tidak |
| Tenor paylater | "Dicicil berapa kali?" | Chip 1×/3×/6×/12× atau ketik (SPEC-paylater) | Tidak |
| Kantong | "Pakai kantong apa?" | Chip kantong (dengan emoji), atau ketik di kolom bawah | Tidak |
| Kantong tujuan (pindah) | "Pindah ke kantong mana?" | Chip kantong, atau ketik di kolom bawah | Tidak |
| Jam (hanya di hari saldo kantongnya) | "Tadi itu jam berapa?" | Ketik (SPEC-saldo-waktu) | Tidak |
| Duplikat | "Sepertinya ini sudah tercatat: … Catat lagi?" | Chip Ya, catat lagi / Bukan, buang (SPEC-catat-andal) | Tidak |
| Semua ada tapi masih draft (hasil AI tak valid) — hanya saat draft dibuka | "Sudah benar begini?" | Chip **✓ Ya, simpan** / **📝 Ubah manual**; ketikan dibaca ulang AI seperti cerita | Tidak (ketikan: ya) |

Nominal & kantong ditanya satu per satu ("satu pilihan, satu tugas" — panduan Writing One UI). Semua jawaban lewat **kolom ketik yang sama** di bawah, seperti chat biasa — tidak ada isian tambahan di dalam bubble; kolomnya menyesuaikan pertanyaan yang terbuka (placeholder, jenis keyboard).
- Jawaban ketik yang tidak terbaca langsung (mis. "nominalnya 40rb" saat ditanya kantong) dibaca ulang AI; isian yang sedang ditanyakan tetap harus dari jawaban user, bukan tebakan AI.
- Jawaban yang tetap tidak bisa dipakai dibalas (422) dan pertanyaannya tetap terbuka.
- "hapus aja", "ga jadi", "ga usah dicatat" (`mauHapus`) saat ada pertanyaan → draft dibuang.
- Begitu tidak ada yang kurang, draft dikonfirmasi dan ikutan (biaya admin/cashback) ikut dikonfirmasi ke kantong yang sama.

## Data

- **Draft tetap transaksi berstatus `needs_review`** (tidak dihitung di saldo, budget, ringkasan — seperti sekarang).
- Tabel baru **`private.draft_catat`** (satu baris per draft): `transaksi_id` (PK, FK ke `private.transaksi_data`, on delete cascade), `user_id`, `foto_enc bytea` (thumbnail WebP lebar ±720 px q60, **terenkripsi** dengan kunci Vault yang sama), `dibuat`.
  - Dibuat/dihapus **oleh trigger** `sinkron_draft` di `private.transaksi_data` (after insert / update of `status`, `induk_id`): draft masuk → baris dibuat; draft jadi `confirmed` → baris (dan fotonya) hilang; transaksi dihapus → cascade. Ikutan (biaya admin/cashback) bukan percakapan sendiri. Jadi tidak mungkin ada foto yatim.
  - Akses lewat view `public.draft_catat` (`transaksi_id`, `dibuat`, `ada_foto`; hanya milik `auth.uid()`).
  - Foto disimpan lewat RPC `simpan_foto_draft(p_id, p_foto)` (base64, maks 400.000 karakter) dan dibaca lewat RPC `foto_draft(p_id)` di `/api/draft/[id]/foto` (`private, max-age=300`) — hanya saat daftar/percakapan dibuka, tidak ikut daftar transaksi.
  - Thumbnail dibuat `simpanThumbnail` (`src/lib/draft-server.ts`) untuk draft dari gambar (`/api/upload-receipt`); gagal = tanpa foto.
  - Draft yang sudah ada saat migrasi diberi `dibuat = now()` (umur 30 hari dihitung dari migrasi).
- **Transkrip obrolan tidak disimpan.** Percakapan dibangun ulang dari draftnya: foto/teks asli → "yang sudah kebaca" → pertanyaan untuk yang masih kurang. Jawaban langsung mengisi draft, jadi tidak ada yang hilang. Lebih sederhana, tidak ada teks obrolan yang perlu dienkripsi.
- Riwayat & Beranda hanya menampilkan transaksi **terkonfirmasi**; draft hanya ada di daftar percakapan.

## Siklus hidup (cron harian 19.00 WIB yang sudah ada)

Cron Vercel `/api/cron/notifikasi`, `0 12 * * *` (UTC). Umur: `UMUR_DRAFT_HARI = 30` (`src/lib/notifikasi.ts`).

- **H+1** dan **H+7** sejak draft dibuat (hari WIB): satu push per draft, judul "1 catatan belum selesai", isi "Struk 22 Okt — ketuk untuk melengkapi." ("Catatan 22 Okt" untuk teks ketikan) → membuka percakapannya (`/?catat=<id>`). H+7: "… — dihapus otomatis 21 Nov. Ketuk untuk melengkapi."
- **H+30**: draft + foto dihapus otomatis (RPC `hapus_draft_kedaluwarsa()`, hanya `service_role`, dipanggil cron yang sama).

## Fase

### A — Obrolan & daftar percakapan
1. Lembar bisa membesar (ringkas ⇄ besar; pegangan, tarik, keyboard tidak menutupi komposer).
2. Obrolan per sesi (1 transaksi): bubble teks & foto, status "Membaca…", kartu hasil **Batalkan | Ubah** (Batalkan = hapus transaksi barusan); kamera sekali jepret & galeri 1 gambar sebagai lampiran.
3. Pertanyaan sesuai tabel di atas; jawaban mengisi draft; lengkap → tersimpan & percakapan selesai.
4. Thumbnail terenkripsi untuk draft dari foto/bagikan.
5. Daftar percakapan di lembar + kartu Beranda; titik di tombol +; tautan `/?catat=<id>`; penutup perbaikan (Ubah | Selesai, hitung mundur, tutup sendiri).
6. Hapus tab & filter "Perlu dibenerin", titik di menu Riwayat, dan alur "Benerin" di halaman detail (draft lama dialihkan ke percakapannya).
7. Pengingat H+1/H+7 & hapus H+30 di cron.

### B — Lanjutan
1. **Perbaiki dengan mengetik** di obrolan: "eh yang tadi pakai BCA" (dikenali `apakahKoreksi`) → `/api/transaksi/[id]/koreksi` membaca ulang transaksi + koreksinya lewat AI dan menyimpan yang berubah saja (nominal, jenis, kategori, nama, keterangan, tanggal, jam, kantong, kantong tujuan). Daftar perubahan ("Nominal: Rp 20.000 → Rp 25.000") tampil dengan tombol **↩ Batalkan perubahan**. Tidak ada yang berubah → "Nggak ada yang berubah…" (422). "hapus aja" setelah kartu tersimpan → transaksinya dihapus.
2. **Bagikan tetap jalan walau layar dimatikan**: service worker (`public/sw.js`, `unggahLatar`) mengunggah gambar ke `/api/upload-receipt` dengan `latar=1`, lalu mengalihkan ke `/bagikan?latar=n` ("n struk diproses di latar…"). Gagal diunggah → disimpan di Cache Storage dan `/bagikan?berkas=n` memasukkannya ke antrean halaman.
3. **Push begitu struk dari latar belakang butuh dilengkapi** (`kabariDraft`): "Struk barusan belum lengkap" / "Struk barusan sepertinya sudah tercatat" (duplikat), isi "<merchant · nominal> — ketuk untuk …", ke `/?catat=<id>`.

Bukan cakupan: menjawab pertanyaan soal pengeluaran (Fase C), suara. Lihat "Belum diterapkan".

## Pengujian

- Fungsi murni + `uji:*`: aturan pertanyaan (apa yang kurang → pertanyaan apa), pembaca jawaban, koreksi/hapus (`uji:draft`); umur draft (H+1/H+7, batas WIB; `uji:notifikasi`).
- Migrasi diuji kering (rollback): trigger buat/hapus `draft_catat`, foto terenkripsi, isolasi antar-user, fungsi hapus hanya `service_role`.
- End-to-end akun sungguhan: teks lengkap → kartu hasil; teks tanpa kantong → chip → tersimpan & percakapan hilang; foto tak terbaca → percakapan + thumbnail → isi nominal → tersimpan & foto terhapus; tutup di tengah → muncul di daftar & Beranda; Batalkan; Kembali bertingkat.
- Di HP: lembar membesar, keyboard, gestur Kembali, bagikan + layar dimatikan (Fase B).
- `tsc`, `next build`, semua `uji:*`; data uji dibersihkan, tanda onboarding tidak disentuh.

## Boundaries

- **Disetujui lewat spec ini:** tabel & view `draft_catat`, trigger `sinkron_draft` di `private.transaksi_data`, RPC foto, penghapusan otomatis draft H+30, penghapusan tab "Perlu dibenerin".
- **Jangan:** menyimpan foto transaksi yang berhasil dibaca; menyimpan transkrip obrolan; menyimpan foto tanpa enkripsi; menghapus draft sebelum H+30 tanpa aksi user.

## Belum diterapkan

- Fase C (menjawab pertanyaan soal pengeluaran) diganti Tanya AI (SPEC-analitik-ai), di panel tersendiri, bukan di lembar Catat.
- Suara (voice-to-text): sengaja tidak dibuat.
