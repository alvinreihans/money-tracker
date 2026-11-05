# Spec: Analitik insight (fase 3 SPEC-navigasi)

Status: **diterapkan · rilis 2.1.0** (streak hanya di Beranda; merchant digabung tanpa huruf besar-kecil & spasi berlebih) · disinkronkan dengan kode 1 Nov 2026 · branch awal `feat/analitik-insight`

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

- AppBar "Analitik" tanpa subjudul; bulan ada di pemilih bulan (`nav` "Pilih bulan", selebar isi juga di dua kolom).
- Bulan disimpan di URL: `/analitik?bulan=2026-09`. Tanpa parameter, yang tampil bulan berjalan; tautan ke bulan berjalan memakai `/analitik` polos.
- Tombol **›** mati (tidak bisa diketuk, redup) di bulan berjalan; bulan depan belum ada isinya. **‹** tidak dibatasi.
- Parameter yang tidak sah (bukan `YYYY-MM`, atau melewati bulan berjalan) dibuang ke bulan berjalan, sama seperti filter Riwayat.

### Isi halaman (urut dari atas)

1. **Ringkasan bulan** (`RingkasanBulan`): Keluar, Masuk, dan Selisih ("Masih surplus" / "Lebih besar pasak"), plus perbandingan keluar dengan bulan sebelumnya ("↓ turun 12% dari September", tidak ditulis bila 0% atau bulan lalu kosong). Arah perubahan ditulis dengan teks, bukan hanya warna.
   - **Dari tujuan tabungan** (baris di bawah Keluar, hanya bila ada): pembelian dari kantong tujuan tabungan, di luar Keluar ([SPEC-analitik-tujuan](SPEC-analitik-tujuan.md)).
2. **Sorotan**: maksimal 4 baris, hanya yang ada datanya.
   - **Proyeksi** (hanya bulan berjalan, **mulai hari ke-3**, dan bila sudah ada pengeluaran): "Kalau begini terus, bulan ini keluar ± Rp 2,4 jt". Dihitung dari rata-rata per hari sejauh ini dikali jumlah hari di bulan itu. Pembandingnya (`pembandingProyeksi`): metode budgeting aktif → **jatah pengeluaran metode** = penghasilan − jatah tabungan/setoran (wadah tabungan; Kakeibo & Zero-Based: target tabungan), "Lewat Rp X dari jatah pengeluaran 50/30/20 Rp Y" / "Masih di bawah jatah pengeluaran 50/30/20 Rp Y"; tanpa metode, ada budget per kategori → jumlah semua target, "… total budget Rp Y"; tanpa keduanya (atau penghasilan metode belum ada): "Dari rata-rata pengeluaran per hari sejauh ini."
   - **Hari paling boros**: "Paling boros: Selasa, 15 Sep" · "Rp 245.000". Seri → tanggal yang lebih akhir.
   - **Paling sering**: "Paling sering: Warteg Selera Bahari" · "12× · Rp 180.000". Dipilih dari 5 merchant teratas (menurut total), yang paling banyak transaksinya; tidak tampil bila hanya 1×.
   - **Kategori yang paling naik** (kenaikan rupiah terbesar, hanya yang naik): "Makan naik Rp 120 rb (+32%)" · "dari September"; kategori yang bulan lalu kosong: tanpa persen, "September belum ada".
3. **Pengeluaran per kategori** (`KomposisiKategori`), menggantikan rata-rata 3 bulan. Isinya total, bar tersegmen (warna kategori), plus daftar.
   - Tiap kategori menampilkan nominal, porsi (%), dan perubahan dari bulan sebelumnya (nama bulan pendek): "↑ 32% dari Sep", "sama dengan Sep", atau "baru" bila bulan lalu kosong.
   - Hanya pengeluaran yang dihitung. Kosong: "Belum ada pengeluaran di bulan ini".
4. **Merchant teratas**: 5 teratas menurut total, dengan "N× transaksi".
   - Penggabungannya sederhana: nama di-trim, spasi berlebih dirapatkan jadi satu, lalu dibandingkan tanpa memedulikan huruf besar-kecil ("DNID RIDX" = "Dnid  Ridx"). Spasi tidak dihapus seluruhnya ("DNIDRIDX" tetap terpisah). Transaksi tanpa merchant dilewati.
   - Nama yang tampil adalah ejaan yang paling sering dipakai.
5. **Tren 6 bulan** (`TrenBulanan`, SVG) yang berakhir di bulan terpilih. Batang dan label bulan terpilih (paling kanan) disorot.
6. **Budget** untuk bulan terpilih (`KartuBudget`, "Budget Oktober" dengan "Terpakai X dari Y" dan "Atur budget"). Bila metode budgeting aktif, diganti kartu metode ([SPEC-metode-budget](SPEC-metode-budget.md), [SPEC-metode-lanjutan](SPEC-metode-lanjutan.md)), termasuk tombol Refleksi Kakeibo.

Tombol **Tanya AI** ada di halaman ini ([SPEC-analitik-ai](SPEC-analitik-ai.md)) dan memakai bulan terpilih.

**Streak tidak lagi tampil di Analitik.** Ia sudah ada di Beranda, dan streak adalah keadaan hari ini, bukan milik bulan tertentu.

Pembelian dari tujuan tabungan dikecualikan dari semua angka di atas kecuali baris "Dari tujuan tabungan" (SPEC-analitik-tujuan).

### Telusuri ke Riwayat

Mengetuk sebuah baris membuka Riwayat yang sudah tersaring (`alamatTelusur` di `src/lib/analitik.ts`, di atas `alamatRiwayat`). `<awal>`/`<akhir>` = tanggal pertama/terakhir bulan terpilih. Supaya angka di Riwayat sama dengan Analitik, tautan pengeluaran membawa **`tujuan=tanpa`** (Riwayat menyembunyikan pengeluaran yang dibayar dari tujuan tabungan, chip "Tanpa dari tujuan tabungan" yang bisa dilepas; SPEC-analitik-tujuan), hanya bila user punya tujuan tabungan. Tautan Masuk dan "Dari tujuan tabungan" tidak membawanya. Merchant memakai filter **`merchant=`** (nama persis, tanpa beda huruf/spasi), bukan cari `q=`.

| Baris | Membuka |
|---|---|
| Ringkasan Keluar / Masuk | `/riwayat?jenis=keluar&dari=<awal>&sampai=<akhir>&tujuan=tanpa` / `/riwayat?jenis=masuk&dari=<awal>&sampai=<akhir>` |
| Dari tujuan tabungan | `/riwayat?jenis=keluar&dari=<awal>&sampai=<akhir>&kantong=<id tujuan,…>` |
| Hari paling boros | `/riwayat?jenis=keluar&dari=<tgl>&sampai=<tgl>&tujuan=tanpa` |
| Paling sering, Merchant | `/riwayat?jenis=keluar&dari=<awal>&sampai=<akhir>&merchant=<nama>&tujuan=tanpa` |
| Kategori, Kategori paling naik | `/riwayat?jenis=keluar&dari=<awal>&sampai=<akhir>&kategori=expense:<slug>&tujuan=tanpa` |
| Wadah metode (SPEC-metode-budget) | `/riwayat?jenis=keluar&dari=<awal>&sampai=<akhir>&kelompok=<…>&tujuan=tanpa` |

Proyeksi dan Selisih tidak bisa diketuk.

### Data

Tidak ada perubahan database.

- **Yang dimuat server** (`analitik/page.tsx`):
  - satu query baris 6 bulan (awal tren s.d. akhir bulan terpilih, jadi termasuk bulan terpilih dan sebelumnya): `amount, type, category, merchant, transaction_date, kelompok_efektif, kantong_id`, hanya `confirmed` dan `income`/`expense`, diambil per 1.000 baris;
  - `budgets`;
  - pengaturan metode budgeting & daftar tujuan tabungan (`ambilPengaturanMetode`).
- **Perhitungan.** Fungsi murni `analisisBulan(ini, lalu, { bulan, hariIni })` di `src/lib/analitik.ts` menghasilkan ringkasan, proyeksi, hari boros, kategori, kategori naik, dan merchant. Pembanding proyeksi dipilih `pembandingProyeksi` (`src/lib/metode.ts`) dari hasil metode dan total budget. Pembelian dari tujuan dipisah dulu dengan `pisahTujuan`.
  - Pindah kantong tidak dihitung, sama seperti di tempat lain.
  - Cashback ikut dihitung sebagai masuk.
- **RPC `get_avg_monthly_expense_by_category`** tidak dipakai lagi di Analitik. Halaman Budget masih memakainya untuk saran nominal.
- `// ponytail:` pindahkan ke RPC SQL kalau sebulan sudah ribuan transaksi.

## Pengujian

- **Unit (`uji:analitik`):**
  - ringkasan dan perbandingan, termasuk bulan lalu kosong dan bulan ini kosong;
  - proyeksi (sebelum hari ke-3, bulan lain, Februari, hanya bulan berjalan);
  - hari paling boros;
  - penggabungan merchant (huruf besar-kecil, spasi, tanpa nama);
  - kategori naik dan "baru";
  - pindah kantong dikecualikan;
  - pemisahan pembelian dari tujuan tabungan.
- **E2E** di Edge (360px & 412px), akun uji sementara yang langsung dihapus, dijalankan sekali saat PR (tidak disimpan sebagai suite): ganti bulan lewat ‹ › dan URL; angka ringkasan dan sorotan cocok dengan data uji; tiap tautan telusur membuka Riwayat dengan filter dan jumlah yang benar; tidak ada error di console. Suite permanen yang membuka Analitik: `e2e/lebar.mjs`, `e2e/metode.mjs`, `e2e/tujuan.mjs`.
- `uji:*`, typecheck, `next build`.

## Boundaries

- **Disetujui lewat spec ini:**
  - parameter `?bulan=`;
  - komposisi kategori memakai bulan terpilih (bukan rata-rata 3 bulan);
  - streak hanya di Beranda.
- **Tanya dulu:** mengubah database, atau menambah grafik di luar pola yang ada (bar CSS, SVG sendiri).
- **Jangan:**
  - memakai AI di fase ini (itu fase 4);
  - menambah pustaka grafik.

## Keputusan

1. **Streak dihapus dari Analitik**, hanya di Beranda.
2. **Penggabungan merchant** cukup mengabaikan huruf besar-kecil dan merapatkan spasi berlebih. Nama yang mirip tapi berbeda, seperti "Q DNID RIDX" dan "DNID RIDX", tetap terpisah.
