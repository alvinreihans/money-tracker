/**
 * Service worker Money Tracker: "Bagikan" dari aplikasi lain (Web Share
 * Target, lihat share_target di app/manifest.ts) dan push notifikasi.
 *
 * Android mengirim berkas yang dibagikan sebagai POST /bagikan. Gambarnya
 * diunggah oleh service worker ini sendiri, di latar: tetap jalan walau
 * aplikasinya langsung ditutup dan HP dikunci (SPEC-catat-chat, Fase B).
 * Tiap gambar = satu transaksi; yang belum lengkap dikabari lewat push oleh
 * server. Fetch dari service worker ke origin sendiri membawa cookie login,
 * berbeda dengan POST dari Android tadi.
 *
 * Yang gagal diunggah (mis. sesi habis) disimpan sebentar di Cache Storage;
 * halaman /bagikan (sesi biasa) mengambil dan mengunggahnya lewat antrean.
 */
const CACHE = "bagikan";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function simpanUntukHalaman(berkas) {
  const cache = await caches.open(CACHE);
  for (const lama of await cache.keys()) await cache.delete(lama);
  await Promise.all(
    berkas.map((f, i) =>
      cache.put(`/bagikan/berkas/${i}`, new Response(f, { headers: { "content-type": f.type, "x-nama": encodeURIComponent(f.name || `struk-${i}`) } })),
    ),
  );
}

/** Satu per satu, seperti antrean di halaman: OCR berat & Groq berbatas. */
async function unggahLatar(berkas) {
  const gagal = [];
  for (const f of berkas) {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("latar", "1");
    try {
      const res = await fetch("/api/upload-receipt", { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) gagal.push(f);
    } catch {
      gagal.push(f);
    }
  }
  if (!gagal.length) return;
  await simpanUntukHalaman(gagal);
  if (self.Notification && Notification.permission === "granted") {
    await self.registration.showNotification("Struk belum terkirim", {
      body: `${gagal.length} gambar belum terkirim. Ketuk untuk coba lagi.`,
      tag: "bagikan-gagal",
      icon: "/logo.png",
      badge: "/badge.png",
      data: { url: `/bagikan?berkas=${gagal.length}` },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/bagikan") return;

  event.respondWith(
    (async () => {
      const data = await event.request.formData();
      const berkas = data.getAll("struk").filter((f) => f instanceof File && f.size > 0);
      // Unggahan berjalan di latar; aplikasinya boleh langsung ditutup.
      if (berkas.length) event.waitUntil(unggahLatar(berkas));

      const teks = ["title", "text", "url"].map((k) => data.get(k)).filter((v) => typeof v === "string" && v.trim()).join(" ");
      const tujuan = new URL("/bagikan", self.location.origin);
      if (berkas.length) tujuan.searchParams.set("latar", String(berkas.length));
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
      // Ikon kecil di status bar Android: harus putih polos (hanya alfa yang
      // dipakai); tanpa ini Chrome memakai ikonnya sendiri.
      badge: "/badge.png",
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
