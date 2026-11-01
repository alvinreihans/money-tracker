# Peta: Tawaran pecah struk & Fase 4 metode

Status: **disetujui** · 28 Oktober 2026 · branch `feat/analitik-tujuan` (satu rilis dengan SPEC-analitik-tujuan, 2.8.0)

| Modul | Isi | Bergantung pada |
|---|---|---|
| `tawar-pecah` | Struk berisi barang dari kategori berbeda → AI menawarkan pecahan. Tawarannya muncul di kartu hasil Catat dan di halaman detail sampai dipecah atau ditutup. Tidak pernah memecah sendiri. | — |
| `kelompok-baru` | Dua kelompok baru, **Pengembangan diri** dan **Tak terduga**, untuk 6 Jars dan Kakeibo. Di metode lama keduanya dihitung Kebutuhan. | — |
| `metode-lanjutan` | Zero-Based, Pay Yourself First, 6 Jars, dan Kakeibo di Profil → Budget, Analitik, Beranda, dan Tanya AI. | `kelompok-baru` |
| `pelunasan` | Snowball / Avalanche di Utang & Piutang: utang mana dilunasi dulu, ke mana uang ekstra. | — |

**Urutan:** `tawar-pecah`, `kelompok-baru` → `metode-lanjutan`, `pelunasan`.

**Migrasi:** satu file untuk semua modul (`20261108000000_fase4.sql`), dijalankan user dengan `npm run db:migrate`.

Spec per modul: `SPEC-tawar-pecah.md`, `SPEC-kelompok-baru.md`, `SPEC-metode-lanjutan.md`, `SPEC-pelunasan.md`.
