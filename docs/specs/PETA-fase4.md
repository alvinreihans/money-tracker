# Peta: Tawaran pecah struk & Fase 4 metode

Status: **diterapkan** · rilis 2.8.0 (31 Oktober 2026) · disetujui 28 Oktober 2026 · branch `feat/analitik-tujuan` (PR #44, satu rilis dengan SPEC-analitik-tujuan) · disinkronkan dengan kode 1 Nov 2026

| Modul | Isi | Bergantung pada | Rilis |
|---|---|---|---|
| `tawar-pecah` | Struk berisi barang dari kategori berbeda → AI menawarkan pecahan. Tawarannya muncul di kartu hasil Catat dan di halaman detail sampai dipecah atau ditutup. Tidak pernah memecah sendiri. Teks ketikan tidak ditawari; tawaran hilang kalau nominal diubah. | — | 2.8.0 |
| `kelompok-baru` | Dua kelompok baru, **Pengembangan diri** dan **Tak terduga**, untuk 6 Jars dan Kakeibo, plus kategori bawaan **Pendidikan**. Di metode lama keduanya dihitung Kebutuhan. | — | 2.8.0 |
| `metode-lanjutan` | Zero-Based, Pay Yourself First, 6 Jars, dan Kakeibo di Profil → Budget, Analitik, Beranda, dan Tanya AI. | `kelompok-baru` | 2.8.0 |
| `pelunasan` | Snowball / Avalanche di Utang & Piutang: utang mana dilunasi dulu, ke mana uang ekstra; bunga per bulan lewat **Atur bunga**. | — | 2.8.0 |

**Urutan (sesuai commit):** migrasi → `tawar-pecah` → `kelompok-baru` → `metode-lanjutan` → `pelunasan`.

**Migrasi:** satu file untuk semua modul (`20261108000000_fase4.sql`), dijalankan user dengan `npm run db:migrate`. Isinya: kelompok `pengembangan`/`tak_terduga` + Pendidikan, `transaksi_data.usulan_pecah_enc` (terenkripsi) + view & trigger tulis, `metode_budget` (`target_tabungan`, `strategi_utang`, `ekstra_utang`, metode baru), `bunga_persen` di `user_accounts` & `cicilan`. Trigger tulis yang memuat `usulan_pecah` didefinisikan ulang di `20261109000000_isolasi_rujukan.sql` (2.8.1, SPEC-normalisasi).

Spec per modul: `SPEC-tawar-pecah.md`, `SPEC-kelompok-baru.md`, `SPEC-metode-lanjutan.md`, `SPEC-pelunasan.md`.

## Belum diterapkan

Semua modul selesai. Yang masih "tanya dulu" di spec masing-masing:

- `tawar-pecah`: tawaran untuk struk sekategori yang beda kelompok.
- `kelompok-baru`: kategori bawaan untuk Tak terduga.
- `metode-lanjutan`: target tabungan yang beda tiap bulan; jurnal refleksi Kakeibo yang disimpan (sekarang lewat Tanya AI, tidak disimpan).
- `pelunasan`: cicilan minimum per utang (untuk proyeksi); pengingat bulanan "uang ekstra belum dibayar".
