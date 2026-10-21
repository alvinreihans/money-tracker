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
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "256x256", type: "image/png" },
    ],
  };
}
