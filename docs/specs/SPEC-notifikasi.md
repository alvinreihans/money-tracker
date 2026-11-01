# Spec: Push notifikasi (Fase 5)

Status: **diterapkan** · disetujui 22 Oktober 2026 · rilis 2.0.0 (pengingat catatan belum selesai: 2.1.0) · disinkronkan dengan kode 1 Nov 2026

## Tujuan

Aplikasi mengingatkan lewat notifikasi HP, walau aplikasinya tidak dibuka:

1. **Jatuh tempo** — cicilan (paylater/kartu kredit) dan Lend & Borrow yang punya tanggal jatuh tempo.
2. **Pengingat catat** — belum mencatat transaksi apa pun hari ini.
3. **Catatan belum selesai** (SPEC-catat-chat) — draft yang belum dilengkapi, H+1 dan H+7.

Dikirim **sekali sehari pukul 19.00 WIB** (cron Vercel gratis: bisa meleset ±1 jam). Tiap hal jadi **satu notifikasi sendiri**; diketuk langsung ke halaman terkait.

## Isi notifikasi

Fungsi murni `isiNotifikasi(data, sekarang = new Date())` di `src/lib/notifikasi.ts`. "Hari ini" = tanggal WIB (`hariWIB`, zona `Asia/Jakarta`).

| Kapan | Judul | Isi | `url` (diketuk ke) | `tag` |
|---|---|---|---|---|
| Angsuran cicilan belum dibayar, jatuh tempo **3 hari lagi** / **besok** | Cicilan jatuh tempo 3 hari lagi / besok | Spaylater ke-2 · Rp 150.000 | `/pinjaman` (Utang & Piutang) | `cicilan-<id>-<ke>` |
| Angsuran cicilan **telat** (sekali, sehari setelah jatuh tempo) | Cicilan lewat jatuh tempo | Spaylater ke-2 · Rp 150.000 | `/pinjaman` | `cicilan-<id>-<ke>` |
| Kantong `orang` bersaldo ≠ 0, atau `kredit` bersaldo < 0, `jatuh_tempo` **3 hari lagi** / **besok** | Budi bayar besok (saldo > 0) / Bayar ke Budi besok (saldo < 0) / Tagihan BCA Card besok (kredit) | Rp 200.000 (nilai mutlak saldo) | `/pinjaman` | `pinjaman-<id>` |
| Draft dibuat (WIB) **kemarin** (H+1) atau **7 hari lalu** (H+7) | 1 catatan belum selesai | H+1: "Struk 21 Okt — ketuk untuk melengkapi." · H+7: "Catatan 15 Okt — dihapus otomatis 14 Nov. Ketuk untuk melengkapi." ("Catatan" bila `source = 'text'`, selain itu "Struk") | `/?catat=<id>` (membuka percakapannya) | `draft-<id>` |
| Tidak ada transaksi `confirmed` yang `created_at`-nya hari ini (WIB) | Belum nyatat hari ini | Ada pengeluaran hari ini? Catat sebelum lupa. | `/` (Beranda) | `catat` |

- Jam 19.00 sengaja diingatkan **H-3 dan H-1**, bukan hari H: malam sebelumnya masih sempat bayar.
- Jadwal angsuran dari `jadwalCicilan` (jatuh tempo ke-n = jatuh tempo pertama + (n−1) bulan); terbayar = ada transaksi dengan `cicilan_ke` itu. Saldo kantong dari `hitungSaldo`.
- Lend & Borrow yang lewat jatuh tempo **tidak** diingatkan (hanya cicilan yang punya pengingat telat).
- Notifikasi memakai `tag` per hal, jadi kiriman berikutnya untuk hal yang sama menggantikan yang lama, bukan menumpuk.
- Isi notifikasi harian hanya nama kantong/cicilan, tanggal & nominal — **tidak** memakai merchant/keterangan (terenkripsi).
- TTL push 12 jam: kalau HP mati semalaman, pengingat yang basi tidak dikirim.

## Rancangan

```
Profil ─ "Notifikasi" ─ sakelar "Pengingat harian" ─▶ izin browser + PushManager.subscribe(VAPID)
                                                       ├▶ upsert push_langganan (per perangkat)
                                                       └▶ POST /api/notifikasi/uji → notifikasi konfirmasi

Vercel cron "0 12 * * *" (12.00 UTC) ─▶ GET /api/cron/notifikasi (Authorization: Bearer CRON_SECRET)
   ├▶ RPC hapus_draft_kedaluwarsa() — draft > 30 hari dihapus dulu
   ├▶ RPC data_notifikasi() (service role) — baris transaksi tanpa teks, cicilan, kantong, draft, langganan
   ├▶ isiNotifikasi(data) per user — fungsi murni, pakai jadwalCicilan & hitungSaldo
   └▶ kirimPush (lib/push.ts, web-push) ke tiap langganan; langganan kedaluwarsa (404/410) dihapus

public/sw.js ─ event "push" → showNotification (judul, isi, tag, icon /logo.png, badge /badge.png) + kabari jendela
            ─ "notificationclick" → fokus jendela aplikasi yang terbuka & navigate(url), kalau tidak openWindow(url)
```

1. **Tabel `push_langganan`** (`20261028000000_notifikasi.sql`): `id`, `user_id` (default `auth.uid()`, cascade saat akun dihapus), `endpoint` (CHECK `https://…`), `p256dh`, `auth`, `created_at`. Unik per **(`user_id`, `endpoint`)**: satu HP yang dipakai dua akun menerima notifikasi keduanya. RLS `push_langganan_own` (`auth.uid() = user_id`); `authenticated` hanya SELECT/INSERT/DELETE (tanpa UPDATE: daftar ulang = insert yang mengabaikan duplikat); `service_role` SELECT/DELETE.
2. **Fungsi `data_notifikasi()`** (security definer, `search_path = ''`, hanya `service_role`; definisi terbaru `20261031000000_saldo_waktu.sql`): untuk tiap user yang berlangganan, JSON berisi
   - `langganan`: endpoint & kunci;
   - `kantong`: hanya `orang`/`kredit` (`id`, `name`, `kind`, `saldo_awal`, `saldo_per`, `saldo_sejak`, `jatuh_tempo`);
   - `cicilan`: `id`, `nama`, `nominal`, `tenor`, `jatuh_tempo_awal`;
   - `transaksi`: kolom non-teks (`amount`, `type`, `transaction_date`, `waktu`, `created_at`, `kantong_id`, `kantong_tujuan_id`, `cicilan_id`, `cicilan_ke`), hanya `status = 'confirmed'` dan hanya yang dibutuhkan: bercicilan, dicatat 2 hari terakhir, atau menyentuh kantong orang/kredit;
   - `draft`: `id`, `dibuat`, `source` dari `draft_catat`.
   Diperlukan karena view `transactions` hanya menampilkan baris `auth.uid()`, sedangkan cron tidak login sebagai siapa pun.
3. **Route cron** `src/app/api/cron/notifikasi/route.ts` (Node runtime) dilindungi `CRON_SECRET` (dikirim otomatis oleh Vercel); tanpa/salah → 401, RPC gagal → 500. Membalas `{ pengguna, terkirim, dibuang, gagal, draftDihapus }`; kegagalan selain 404/410 dicatat di log. Sekalian menyentuh database tiap hari → **project Supabase tidak ter-pause** (pengganti PR #17 yang tidak di-merge).
4. **Profil**: bagian "Notifikasi" berisi satu baris **"Pengingat harian"** dengan sakelar (`SakelarNotifikasi`). Keterangan: "Jatuh tempo & belum nyatat, tiap jam 19.00".
   - Nyala → minta izin, subscribe (atau pakai langganan yang ada), upsert ke `push_langganan`, lalu `POST /api/notifikasi/uji` mengirim **"Notifikasi nyala"** ("Pengingat jatuh tempo & catat dikirim tiap jam 19.00.", ke `/profil`) lewat jalur yang sama dengan cron. Gagal terkirim → "Notifikasi percobaan tidak terkirim. Coba matikan lalu nyalakan lagi."
   - Mati → hapus barisnya & unsubscribe.
   - Izin diblokir → "Izin diblokir — buka izin situs di pengaturan browser" (sakelar nonaktif). Browser tanpa dukungan → "Browser ini belum mendukung notifikasi".
   - Tanpa pilihan per jenis.
5. **Library `web-push`** untuk VAPID & enkripsi payload. Kontak VAPID = origin aplikasi (dipaksa `https:`).

Push lain yang memakai `push_langganan` & `kirimPush` (bukan bagian cron harian): "Struk barusan belum lengkap" / "Struk barusan sepertinya sudah tercatat" dari unggahan latar (`kabariDraft`, `src/lib/draft-server.ts`, SPEC-catat-chat). Service worker juga menampilkan notifikasi lokal "Struk belum terkirim" untuk Bagikan yang gagal diunggah.

## Yang perlu kamu siapkan (sekali)

Env di `.env.local` dan Vercel (Production), lihat `.env.example`:

| Nama | Isi |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Dibuatkan dengan `npx web-push generate-vapid-keys` |
| `CRON_SECRET` | String acak (dibuatkan) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys (secret / service_role) |

## Batasan

- Android (Chrome, aplikasi terpasang atau tidak): jalan. **iPhone**: hanya kalau aplikasi dipasang ke Home Screen (iOS 16.4+).
- Cron gratis sekali sehari; jamnya tidak presisi.
- Isi notifikasi melewati server push Google/Apple, tapi **terenkripsi** (hanya HP-mu yang bisa membuka).

## Pengujian

- `npm run uji:notifikasi` (`scripts/uji-notifikasi.mts`): `isiNotifikasi` — H-3/H-1/telat cicilan, telat lama tidak diulang, Lend vs Borrow vs kartu kredit, yang lunas & tanpa jatuh tempo tidak diingatkan, kartu kredit lebih bayar tidak diingatkan, pengingat catat, pergantian bulan, draft H+1/H+7 (H+2 & hari ini diam), batas hari WIB (transaksi 23.30 WIB kemarin bukan "hari ini").
- `npm run uji:isolasi`: akun lain & pengunjung tidak bisa membaca/mengubah/menghapus/menulis `push_langganan` milik orang lain.
- Migrasi diuji kering dulu (transaksi yang di-rollback), termasuk: `data_notifikasi()` ditolak untuk `authenticated`/`anon`.
- Route cron: tanpa/salah secret → 401; dengan secret → kirim ke langganan uji (manual).
- Uji di HP (Chrome Android, aplikasi terpasang): nyalakan di Profil, picu cron manual, notifikasi muncul & diketuk ke halaman yang benar.
- `tsc`, `next build`, semua `uji:*`.

## Boundaries

- **Disetujui lewat spec ini:** tabel `push_langganan`, fungsi `data_notifikasi()`, dependensi `web-push`, cron harian di `vercel.json`.
- **Jangan:** memasukkan merchant/keterangan ke isi notifikasi harian; mengirim lebih dari sekali sehari untuk hal yang sama.

## Belum diterapkan

- **Pengingat tagihan kartu kredit** ada di `isiNotifikasi`, tapi tidak ada UI yang mengisi `jatuh_tempo` kantong `kredit` (`FormPinjaman` hanya mengisinya untuk `orang`), dan `jatuh_tempo` adalah satu tanggal, bukan tanggal bulanan. Dalam praktik notifikasi "Tagihan … besok" tidak pernah terkirim.
- Pilihan per jenis notifikasi.
