# Spec: Push notifikasi (Fase 5)

Status: **disetujui** · 22 Oktober 2026

## Tujuan

Aplikasi mengingatkan dua hal lewat notifikasi HP, walau aplikasinya tidak dibuka:

1. **Jatuh tempo** — cicilan (paylater/kartu kredit) dan Lend & Borrow yang punya tanggal jatuh tempo.
2. **Pengingat catat** — belum mencatat transaksi apa pun hari ini.

Dikirim **sekali sehari pukul 19.00 WIB** (cron Vercel gratis: bisa meleset ±1 jam). Tiap hal jadi **satu notifikasi sendiri**; diketuk langsung ke halaman terkait.

## Isi notifikasi

| Kapan | Judul | Isi | Diketuk ke |
|---|---|---|---|
| Cicilan jatuh tempo **3 hari lagi** / **besok** | Cicilan jatuh tempo besok | Spaylater ke-2 · Rp 150.000 | Lend & Borrow |
| Cicilan **telat** (sekali, sehari setelah jatuh tempo) | Cicilan lewat jatuh tempo | Spaylater ke-2 · Rp 150.000 | Lend & Borrow |
| Lend/Borrow bersaldo, jatuh tempo **3 hari lagi** / **besok** | Budi bayar besok / Bayar ke Budi besok / Tagihan BCA Card besok | Rp 200.000 | Lend & Borrow |
| Belum ada transaksi dicatat hari ini (WIB) | Belum nyatat hari ini | Ada pengeluaran hari ini? Catat sebelum lupa. | Beranda (Catat) |

- Jam 19.00 sengaja diingatkan **H-3 dan H-1**, bukan hari H: malam sebelumnya masih sempat bayar.
- Notifikasi memakai `tag` per hal, jadi kiriman hari berikutnya untuk hal yang sama menggantikan yang lama, bukan menumpuk.
- Isi notifikasi hanya nama kantong/cicilan & nominal — **tidak** memakai merchant/keterangan (terenkripsi).

## Rancangan

```
Pengaturan ─ "Notifikasi" (sakelar) ─▶ izin browser + PushManager.subscribe(VAPID)
                                         └▶ tabel push_langganan (per perangkat)

Vercel cron 12.00 UTC ─▶ GET /api/cron/notifikasi (Authorization: Bearer CRON_SECRET)
   ├▶ RPC data_notifikasi() (service role) — baris transaksi tanpa teks, cicilan, kantong
   ├▶ isiNotifikasi(data, hariIni) — fungsi murni, pakai statusCicilan & hitungSaldo yang ada
   └▶ web-push ke tiap langganan; langganan kedaluwarsa (404/410) dihapus

public/sw.js ─ event "push" → showNotification · "notificationclick" → buka/fokus halaman
```

1. **Tabel `push_langganan`**: `user_id`, `endpoint` (unik), `p256dh`, `auth`, `dibuat`. RLS: user hanya bisa menambah/menghapus/membaca miliknya sendiri.
2. **Fungsi `data_notifikasi()`** (security definer, hanya bisa dipanggil `service_role`): untuk user yang berlangganan, mengembalikan kolom non-teks transaksi (nominal, jenis, kantong, cicilan, waktu catat), cicilan, dan kantong orang/kredit. Diperlukan karena view `transactions` hanya menampilkan baris `auth.uid()`, sedangkan cron tidak login sebagai siapa pun.
3. **Route cron** dilindungi `CRON_SECRET` (dikirim otomatis oleh Vercel). Sekalian menyentuh database tiap hari → **project Supabase tidak ter-pause** (pengganti PR #17 yang tidak di-merge).
4. **Pengaturan**: satu baris "Notifikasi" dengan sakelar (One UI). Nyala → minta izin, subscribe, simpan. Mati → unsubscribe & hapus barisnya. Kalau izin diblokir browser, tampil keterangan cara membukanya. Tanpa pilihan per jenis (bisa ditambah nanti kalau perlu).
5. **Library `web-push`** (disetujui) untuk VAPID & enkripsi payload.

## Yang perlu kamu siapkan (sekali)

Env baru di `.env.local` dan Vercel (Production):

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

- `npm run uji:notifikasi`: `isiNotifikasi` — H-3/H-1/telat cicilan, Lend vs Borrow vs kartu kredit, yang lunas tidak diingatkan, pengingat catat, batas hari WIB (transaksi 23.30 WIB tetap "hari ini").
- Migrasi diuji kering dulu (transaksi yang di-rollback), termasuk: `data_notifikasi()` ditolak untuk `authenticated`/`anon`.
- Route cron: tanpa/salah secret → 401; dengan secret → kirim ke langganan uji.
- Uji di HP (Chrome Android, aplikasi terpasang): nyalakan di Pengaturan, picu cron manual, notifikasi muncul & diketuk ke halaman yang benar.
- `tsc`, `next build`, semua `uji:*`.

## Boundaries

- **Disetujui lewat spec ini:** tabel `push_langganan`, fungsi `data_notifikasi()`, dependensi `web-push`, cron harian di `vercel.json`.
- **Jangan:** memasukkan merchant/keterangan ke isi notifikasi; mengirim lebih dari sekali sehari untuk hal yang sama.
