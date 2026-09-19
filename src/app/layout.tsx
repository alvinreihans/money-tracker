import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Plus Jakarta Sans memang dirancang untuk Jakarta — pas untuk aplikasi ini.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Money Tracker",
  description: "Pencatatan keuangan otomatis dari struk dan rekening koran.",
};

export const viewport: Viewport = {
  // Aplikasi gelap saja, jadi satu warna saja — disamakan dgn header oranye.
  themeColor: "#f56e0f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
