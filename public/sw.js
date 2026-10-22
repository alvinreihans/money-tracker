/**
 * Service worker Money Tracker — saat ini hanya untuk "Bagikan" dari aplikasi
 * lain (Web Share Target, lihat share_target di app/manifest.ts).
 *
 * Android mengirim berkas yang dibagikan sebagai POST /bagikan. Cookie login
 * belum tentu ikut di permintaan itu, jadi berkasnya ditangkap di sini,
 * disimpan sebentar di Cache Storage, lalu halaman /bagikan (GET, dengan
 * sesi biasa) mengambilnya dan mengunggahnya lewat antrean struk yang sudah
 * ada. Permintaan lain tidak disentuh.
 */
const CACHE = "bagikan";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/bagikan") return;

  event.respondWith(
    (async () => {
      const data = await event.request.formData();
      const cache = await caches.open(CACHE);
      for (const lama of await cache.keys()) await cache.delete(lama);

      const berkas = data.getAll("struk").filter((f) => f instanceof File && f.size > 0);
      await Promise.all(
        berkas.map((f, i) =>
          cache.put(
            `/bagikan/berkas/${i}`,
            new Response(f, { headers: { "content-type": f.type, "x-nama": encodeURIComponent(f.name || `struk-${i}`) } }),
          ),
        ),
      );

      const teks = ["title", "text", "url"].map((k) => data.get(k)).filter((v) => typeof v === "string" && v.trim()).join(" ");
      const tujuan = new URL("/bagikan", self.location.origin);
      if (berkas.length) tujuan.searchParams.set("berkas", String(berkas.length));
      if (teks) tujuan.searchParams.set("teks", teks.slice(0, 500));
      return Response.redirect(tujuan.href, 303);
    })(),
  );
});
