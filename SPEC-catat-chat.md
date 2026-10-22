# Spec: Catat sebagai obrolan (pengganti "Perlu dibenerin")

Status: **disetujui** · 23 Oktober 2026

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

### Lembar ringkas (seperti sekarang)

```
┌──────────────────────────────────────┐
│               ───                    │ ← pegangan (tarik ke atas = besar)
│ Catat transaksi                      │
│ [📷 Kamera] [🖼 Galeri] [📝 Manual]   │
│ 📋 2 belum selesai              ›    │ ← hanya kalau ada; ketuk = buka daftar
│ (🕘 warteg 12rb Tunai) (🕘 …)         │
│ ┌──────────────────────────────┐ (↑) │
│ │ beli makan di warteg 20k …   │     │
│ └──────────────────────────────┘     │
└──────────────────────────────────────┘
```

### Lembar besar (obrolan)

Membesar sendiri saat ada pertanyaan, foto masuk, atau ditarik ke atas; turun lagi bila ditarik ke bawah.

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
│ ┌────┐ Struk · 22 Okt 07.12          │
│ │🧾  │ Nominal belum kebaca          │
│ └────┘                          ›    │
│ ┌────┐ "transfer ke budi 50k"        │
│ │ ✏️ │ Kantong belum jelas            │
│ └────┘                          ›    │
```

### Kamera, galeri & bagikan

- **Kamera**: layar penuh seperti sekarang, **sekali jepret** → kembali ke obrolan dengan foto terlampir di komposer (boleh ditambah keterangan, mis. "pakai BCA", supaya AI tidak perlu bertanya) → kirim.
- **Galeri**: pilih **1 gambar** → terlampir → kirim. Komposer menampung maksimal 1 lampiran; memilih lagi menggantinya.
- **Bagikan** dari aplikasi lain: tanpa komposer, langsung diproses di latar. Android bisa membagikan beberapa gambar sekaligus — **masing-masing diproses sendiri**: yang lengkap tersimpan, yang kurang menjadi percakapannya sendiri.
- Antrean struk ("Lagi proses struk · sisa n") dan sheet "Struk" dihapus.

### Selesai memperbaiki

**Perilakunya sama untuk setiap transaksi yang sempat ditanya, dari mana pun datangnya** — ketik, kamera, galeri, bagikan, atau dibuka dari daftar Belum selesai / kartu Beranda / push:

1. Kartu hasil dengan tombol **Ubah | Selesai** (bukan Batalkan): **Ubah** menutup lembar dan membuka halaman detail transaksi itu; **Selesai** langsung menutup tanpa menunggu.
2. Komposer disembunyikan; bubble penutup: *"Makasih udah dilengkapi! 🙌 Transaksinya sudah tercatat. Kalau perlu diubah lagi, cek di Riwayat."* dengan hitung mundur (**±8 detik**, disetel lagi saat uji di HP) dan cincin penanda waktu.
3. Habis hitungan: kembali ke **Beranda**, atau ke daftar **Belum selesai** kalau masih ada yang lain ("Lanjut ke yang lain (1 lagi)…").
4. Ketuk Ubah / Kembali → hitung mundur batal (tidak menutup saat user sedang berbuat sesuatu).

Catatan yang **langsung lengkap** (tanpa pertanyaan): kartu **Batalkan | Ubah**, lembar tetap terbuka untuk catatan berikutnya.

Juga muncul sebagai **kartu di Beranda**: "2 catatan belum selesai · Lanjutkan" → membuka lembar besar di daftar ini. Titik oranye di menu Riwayat pindah ke tombol **+**.

### Kesesuaian One UI

- Komposer & pilihan di **area interaksi** bawah; isi obrolan di area atas (viewing area). [Layout]
- Pilihan jawaban = chip di bawah pertanyaan, mirip dialog pilihan di bawah layar. [Dialog]
- Beranda di belakang lembar diredupkan (lapisan berbeda); tidak redup + bayangan sekaligus. [Visual depth]
- Gerak memakai `--gerak` One UI; ikut setelan "kurangi gerakan".
- Gestur **Kembali**: obrolan → daftar/ringkas → tutup (tidak meninggalkan halaman).

## Pertanyaan yang diajukan

Sebagian besar **tanpa panggilan AI** (cepat, hemat kuota Groq):

| Yang kurang | Pertanyaan | Cara jawab | AI? |
|---|---|---|---|
| Kantong | "Pakai kantong apa?" | Chip kantong, atau ketik di kolom bawah | Tidak |
| Kantong tujuan (pindah) | "Pindah ke kantong mana?" | Chip kantong, atau ketik di kolom bawah | Tidak |
| Nominal | "Berapa nominalnya?" | Ketik di **kolom bawah** — berubah jadi keyboard angka dengan pemisah ribuan (1.500.000) | Tidak |
| Tidak terbaca sama sekali | "Aku belum nangkep. Ceritain transaksinya?" | Ketik bebas → digabung dengan teks/OCR asli → AI dibaca ulang | Ya |
| Masih belum jelas setelah 2 putaran, atau AI sibuk (429) | "Isi manual aja?" | Form Manual terisi dengan yang sudah terbaca | Tidak |

Nominal & kantong ditanya satu per satu ("satu pilihan, satu tugas" — panduan Writing One UI). Semua jawaban lewat **kolom ketik yang sama** di bawah, seperti chat biasa — tidak ada isian tambahan di dalam bubble; kolomnya menyesuaikan pertanyaan yang terbuka (placeholder, jenis keyboard). Jawaban yang tidak bisa dipakai dibalas dan pertanyaannya tetap terbuka.

## Data

- **Draft tetap transaksi berstatus `needs_review`** (tidak dihitung di saldo, budget, ringkasan — seperti sekarang).
- Tabel baru **`private.draft_catat`** (satu baris per draft): `transaksi_id` (FK, on delete cascade), `user_id`, `foto_enc bytea` (thumbnail WebP ±720 px, **terenkripsi** dengan kunci Vault yang sama), `dibuat`.
  - Dibuat/dihapus **oleh trigger** di view `transactions`: draft masuk → baris dibuat; draft jadi `confirmed` atau dihapus → baris (dan fotonya) hilang. Jadi tidak mungkin ada foto yatim.
  - Akses lewat view `public.draft_catat` (hanya milik `auth.uid()`); foto hanya diambil saat percakapan dibuka (`/api/draft/[id]/foto`), tidak ikut daftar transaksi.
  - Draft yang sudah ada saat migrasi diberi `dibuat = now()` (umur 30 hari dihitung dari migrasi).
- **Transkrip obrolan tidak disimpan.** Percakapan dibangun ulang dari draftnya: foto/teks asli → "yang sudah kebaca" → pertanyaan untuk yang masih kurang. Jawaban langsung mengisi draft, jadi tidak ada yang hilang. Lebih sederhana, tidak ada teks obrolan yang perlu dienkripsi.
- Riwayat & Beranda hanya menampilkan transaksi **terkonfirmasi**; draft hanya ada di daftar percakapan.

## Siklus hidup (cron harian 19.00 WIB yang sudah ada)

- **H+1** dan **H+7** sejak draft dibuat: push "1 catatan belum selesai · Struk 22 Okt — ketuk untuk melengkapi" → membuka percakapannya (`/?catat=<id>`). H+7 menyebut tanggal hapusnya.
- **H+30**: draft + foto dihapus otomatis (fungsi khusus `service_role`).

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
1. **Perbaiki dengan mengetik** di obrolan: "eh yang tadi pakai BCA" → AI mengubah transaksi terakhir di obrolan itu (diperlihatkan sebelum/sesudah, bisa dibatalkan).
2. **Bagikan tetap jalan walau layar dimatikan**: service worker sendiri yang mengunggah gambar ke server (sekarang halaman `/bagikan` yang mengunggah, dan bisa terhenti kalau HP dikunci).
3. **Push begitu struk dari latar belakang butuh dilengkapi** ("Struk barusan belum lengkap — ketuk").

Bukan cakupan: menjawab pertanyaan soal pengeluaran (Fase C, nanti), suara.

## Pengujian

- Fungsi murni + `uji:*`: aturan pertanyaan (apa yang kurang → pertanyaan apa), penggabungan jawaban, umur draft (H+1/H+7/H+30, batas WIB).
- Migrasi diuji kering (rollback): trigger buat/hapus `draft_catat`, foto terenkripsi, isolasi antar-user, fungsi hapus hanya `service_role`.
- End-to-end akun sungguhan: teks lengkap → kartu hasil; teks tanpa kantong → chip → tersimpan & percakapan hilang; foto tak terbaca → percakapan + thumbnail → isi nominal → tersimpan & foto terhapus; tutup di tengah → muncul di daftar & Beranda; Batalkan; Kembali bertingkat.
- Di HP: lembar membesar, keyboard, gestur Kembali, bagikan + layar dimatikan (Fase B).
- `tsc`, `next build`, semua `uji:*`; data uji dibersihkan, tanda onboarding tidak disentuh.

## Boundaries

- **Disetujui lewat spec ini:** tabel & view `draft_catat`, perubahan trigger view `transactions`, penghapusan otomatis draft H+30, penghapusan tab "Perlu dibenerin".
- **Jangan:** menyimpan foto transaksi yang berhasil dibaca; menyimpan transkrip obrolan; menyimpan foto tanpa enkripsi; menghapus draft sebelum H+30 tanpa aksi user.
