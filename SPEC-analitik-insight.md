# Spec: Analitik insight (fase 3 SPEC-navigasi)

Status: **draf, menunggu persetujuan** · 24 Oktober 2026 · branch `feat/analitik-insight` (ditumpuk di atas PR #34)

## Masalah

Tab Analitik (fase 1) baru berisi kartu yang dipindah dari Beranda:

- **Hanya bulan berjalan.** Bulan lalu tidak bisa dilihat.
- **"Komposisi kategori" menampilkan rata-rata 3 bulan**, bukan isi bulan itu. Akibatnya angkanya tidak cocok dengan Riwayat.
- **Tidak ada pembanding atau sorotan.** Pertanyaan seperti "naik atau turun dibanding bulan lalu?", "hari apa paling boros?", atau "ke mana uangku paling sering?" belum terjawab.
- **Tidak bisa ditelusuri.** Melihat angka "Makan Rp 1,2 jt" tidak membawa ke transaksinya.

## Rancangan

### Pilih bulan

```
Analitik
‹  Oktober 2026  ›
```

- Bulan disimpan di URL: `/analitik?bulan=2026-09`. Tanpa parameter, yang tampil bulan berjalan.
- Tombol **›** mati di bulan berjalan; bulan depan belum ada isinya.
- Parameter yang tidak sah dibuang, sama seperti filter Riwayat.

### Isi halaman (urut dari atas)

1. **Ringkasan bulan**: Keluar, Masuk, dan Selisih, plus perbandingan dengan bulan sebelumnya ("↓ 12% dari September"). Arah perubahan ditulis dengan teks, bukan hanya warna.
2. **Sorotan**: maksimal 4 baris, hanya yang ada datanya.
   - **Proyeksi** (hanya bulan berjalan): "Kalau begini terus, bulan ini keluar ± Rp 2,4 jt". Dihitung dari rata-rata per hari sejauh ini dikali jumlah hari di bulan itu. Kalau ada budget, bandingkan juga dengan total budget.
   - **Hari paling boros**: "Selasa, 15 Sep · Rp 245.000".
   - **Paling sering**: "Warteg Selera Bahari · 12× · Rp 180.000".
   - **Kategori yang paling naik**: "Makan naik Rp 120 rb (+32%) dari September".
3. **Kategori bulan ini**, menggantikan rata-rata 3 bulan. Isinya bar tersegmen plus daftar.
   - Tiap kategori menampilkan nominal, porsi (%), dan perubahan dari bulan sebelumnya. Kategori yang bulan lalu kosong ditandai "baru".
   - Hanya pengeluaran yang dihitung, sama seperti sekarang.
4. **Merchant teratas**: 5 teratas menurut total, dengan jumlah transaksi.
   - Penggabungannya sederhana: nama dibandingkan tanpa memedulikan huruf besar-kecil dan spasi ("DNID RIDX" = "Dnid Ridx").
   - Nama yang tampil adalah ejaan yang paling sering dipakai.
5. **Tren 6 bulan** yang berakhir di bulan terpilih. Batang bulan terpilih disorot.
6. **Budget** untuk bulan terpilih.

**Streak tidak lagi tampil di Analitik.** Ia sudah ada di Beranda, dan streak adalah keadaan hari ini, bukan milik bulan tertentu.

### Telusuri ke Riwayat

Mengetuk sebuah baris membuka Riwayat yang sudah tersaring (memakai filter fase 2):

| Baris | Membuka |
|---|---|
| Kategori | `/riwayat?jenis=keluar&dari=<awal>&sampai=<akhir>&kategori=expense:<slug>` |
| Merchant | `/riwayat?dari=<awal>&sampai=<akhir>&q=<nama>` |
| Hari paling boros | `/riwayat?dari=<tgl>&sampai=<tgl>` |
| Ringkasan Keluar / Masuk | `/riwayat?jenis=keluar\|masuk&dari=<awal>&sampai=<akhir>` |

### Data

Tidak ada perubahan database.

- **Yang dimuat server:**
  - baris bulan terpilih dan bulan sebelumnya (`amount, type, category, merchant, transaction_date`);
  - baris 6 bulan untuk tren;
  - budget.
- **Perhitungan.** Fungsi murni baru, `analisisBulan(ini, lalu, { bulan, hariIni, budget })`, di `src/lib/analitik.ts`. Fungsi ini menghasilkan ringkasan, sorotan, kategori, dan merchant.
  - Pindah kantong tidak dihitung, sama seperti di tempat lain.
  - Cashback ikut dihitung sebagai masuk.
- **RPC `get_avg_monthly_expense_by_category`** tidak dipakai lagi oleh halaman mana pun, tapi fungsinya dibiarkan di database.
- Total dihitung dari seluruh baris bulan itu, diambil per 1.000 baris seperti Riwayat.
- `// ponytail:` pindahkan ke RPC SQL kalau sebulan sudah ribuan transaksi.

## Pengujian

- **Unit (`uji:analitik`, ditambah):**
  - ringkasan dan perbandingan, termasuk bulan lalu kosong;
  - proyeksi (hari ke-1, akhir bulan, Februari, hanya bulan berjalan);
  - hari paling boros;
  - penggabungan merchant (huruf besar-kecil);
  - kategori naik dan "baru";
  - pindah kantong dikecualikan.
- **E2E di Edge (360px & 412px), akun uji sementara yang langsung dihapus:**
  - ganti bulan lewat ‹ › dan URL;
  - angka ringkasan dan sorotan cocok dengan data uji;
  - tiap tautan telusur membuka Riwayat dengan filter dan jumlah yang benar;
  - tidak ada error di console.
- `uji:*`, typecheck, `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - parameter `?bulan=`;
  - komposisi kategori memakai bulan terpilih (bukan rata-rata 3 bulan);
  - streak hanya di Beranda.
- **Tanya dulu:** mengubah database, atau menambah grafik di luar pola yang ada (bar CSS).
- **Jangan:**
  - memakai AI di fase ini (itu fase 4);
  - menambah pustaka grafik.

## Pertanyaan terbuka

1. **Streak dihapus dari Analitik**, karena sudah ada di Beranda. Setuju?
2. **Penggabungan merchant** cukup mengabaikan huruf besar-kecil dan spasi. Nama yang mirip tapi berbeda, seperti "Q DNID RIDX" dan "DNID RIDX", tetap terpisah. Cukup untuk sekarang?
