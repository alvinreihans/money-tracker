import webpush from "web-push";
import type { Notifikasi } from "@/lib/notifikasi";

export interface Langganan {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Kirim tiap notifikasi ke tiap langganan. Mengembalikan endpoint yang sudah
 * tidak berlaku (404/410: izin dicabut, aplikasi dihapus) untuk dibuang.
 *
 * `asal`: origin aplikasi, dipakai sebagai kontak VAPID (wajib https).
 */
export async function kirimPush(langganan: Langganan[], notifikasi: Notifikasi[], asal: string) {
  webpush.setVapidDetails(
    asal.replace(/^http:/, "https:"),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  let terkirim = 0;
  const mati = new Set<string>();
  const gagal: string[] = [];
  await Promise.all(
    langganan.flatMap((l) =>
      notifikasi.map((n) =>
        webpush
          .sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, JSON.stringify(n), {
            // Kalau HP mati semalaman, pengingat yang lewat 12 jam tidak ada gunanya.
            TTL: 12 * 3600,
          })
          .then(() => void terkirim++)
          .catch((e: { statusCode?: number; body?: string }) => {
            if (e.statusCode === 404 || e.statusCode === 410) mati.add(l.endpoint);
            else gagal.push(`${e.statusCode ?? "?"} ${String(e.body ?? e).slice(0, 120)}`);
          }),
      ),
    ),
  );
  return { terkirim, mati: [...mati], gagal };
}
