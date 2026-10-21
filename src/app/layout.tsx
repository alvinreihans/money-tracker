import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Money Tracker",
  description: "Pencatatan keuangan otomatis dari struk dan rekening koran.",
};

export const viewport: Viewport = {
  // Latar header gelap Primer, supaya bilah status HP menyatu.
  themeColor: "#151b23",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Tema dipasang lewat atribut dari server, bukan dipilih di browser —
    // kalau menunggu JS, halaman sempat berkedip terang dulu.
    //
    // suppressHydrationWarning: polyfill focus-visible milik Primer kadang
    // sempat menambah class ke <html> sebelum React hydrate. Hanya berlaku
    // untuk atribut elemen ini, bukan anak-anaknya.
    <html
      lang="id"
      data-color-mode="dark"
      data-dark-theme="dark"
      data-light-theme="dark"
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
