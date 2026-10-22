/**
 * Service worker Money Tracker: "Bagikan" dari aplikasi lain (Web Share
 * Target, lihat share_target di app/manifest.ts) dan push notifikasi.
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

/**
 * Push notifikasi harian (SPEC-notifikasi.md). Isi dari server:
 * { judul, isi, url, tag } — lihat src/lib/notifikasi.ts.
 */
self.addEventListener("push", (event) => {
  const n = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(n.judul || "Money Tracker", {
      body: n.isi,
      tag: n.tag,
      icon: "/logo.png",
      data: { url: n.url || "/" },
    }),
  );
});

// Diketuk: pakai jendela aplikasi yang sudah terbuka kalau ada, kalau tidak buka baru.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const jendela = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const ada = jendela.find((c) => c.url.startsWith(self.location.origin));
      if (ada) {
        await ada.focus();
        try {
          await ada.navigate(url);
          return;
        } catch {
          // navigate() hanya untuk jendela yang dikendalikan service worker ini.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
