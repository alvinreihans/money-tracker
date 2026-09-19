import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

// Plus Jakarta Sans memang dirancang untuk Jakarta — pas untuk aplikasi ini.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

// Khusus nominal berukuran besar. Satu berat saja karena memang cuma dipakai
// untuk angka, bukan untuk badan teks.
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Money Tracker",
  description: "Pencatatan keuangan otomatis dari struk dan rekening koran.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2b5741" },
    { media: "(prefers-color-scheme: dark)", color: "#18160f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${jakarta.variable} ${dmSerif.variable}`}>
      <head>
        {/*
          Harus berjalan SEBELUM halaman digambar. Pilihan tema tersimpan di
          localStorage yang cuma ada di browser, jadi server tidak bisa tahu —
          tanpa skrip pemblokir ini, halaman sempat tampil terang dulu lalu
          berkedip jadi gelap. Sengaja inline dan sekecil mungkin.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
