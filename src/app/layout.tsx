import type { Metadata, Viewport } from "next";
import "@cloudscape-design/global-styles/index.css";
import { colorBackgroundLayoutMain } from "@cloudscape-design/design-tokens";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Money Tracker",
  description: "Pencatatan keuangan otomatis dari struk dan rekening koran.",
};

export const viewport: Viewport = {
  // Latar layout Cloudscape mode gelap, supaya bilah status HP menyatu.
  themeColor: "#0f141a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // colorScheme gelap: area di luar AppLayout (overscroll di HP) tidak putih.
    <html lang="id" style={{ colorScheme: "dark" }}>
      {/* Class mode gelap Cloudscape dipasang dari server, bukan lewat
          applyMode() di browser — kalau menunggu JS, halaman sempat berkedip
          terang dulu. */}
      <body className="awsui-dark-mode" style={{ margin: 0, background: colorBackgroundLayoutMain }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
