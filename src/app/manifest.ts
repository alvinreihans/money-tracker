import type { MetadataRoute } from "next";

/**
 * Manifest untuk "Install app" / "Tambahkan ke layar utama". Tanpa ini HP
 * memasang situsnya sebagai pintasan biasa, dan bilah navigasi sistem Android
 * memakai warna bawaannya (putih) — tidak menyatu dengan latar hitam.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Money Tracker",
    short_name: "Money",
    description: "Catat pengeluaran dari struk, teks, atau isian sendiri.",
    lang: "id",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    // Chrome butuh 192 & 512 supaya bisa dipasang sebagai aplikasi. Versi
    // maskable kotak penuh; launcher Android memotong bentuknya sendiri.
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
