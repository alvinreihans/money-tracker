import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Money Tracker",
  description: "Pencatatan keuangan otomatis dari struk dan rekening koran.",
};

export const viewport: Viewport = {
  // Latar hitam One UI, supaya bilah status HP menyatu.
  themeColor: "#000000",
  // Konten boleh sampai ke bawah notch/gesture bar; padding-nya diatur lewat
  // env(safe-area-inset-*) di navigasi bawah.
  viewportFit: "cover",
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
