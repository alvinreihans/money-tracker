import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Money Tracker",
  description: "Catat pengeluaran dari struk, teks, atau isian sendiri.",
};

export const viewport: Viewport = {
  // Latar hitam One UI, supaya bilah status HP menyatu.
  themeColor: "#000000",
  // Aplikasinya gelap saja; diumumkan sebelum CSS termuat, supaya browser
  // dan bilah sistem tidak sempat memakai tema terang.
  colorScheme: "dark",
  // Konten boleh sampai ke bawah notch/gesture bar; padding-nya diatur lewat
  // env(safe-area-inset-*) di navigasi bawah.
  viewportFit: "cover",
  // Saat keyboard HP muncul, tata letak ikut menyusut — sheet "Catat" yang
  // menempel di bawah layar naik ke atas keyboard, bukan tertutup olehnya.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
