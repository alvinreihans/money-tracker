import { ChartPie, House, ReceiptText, UserRound } from "lucide-react";

/**
 * Tab utama aplikasi (SPEC-navigasi), ditulis sekali: navigasi bawah di HP
 * sekarang, rail/sidebar di desktop nanti. `aktif`: alamat yang menyalakan
 * tab itu.
 */
export const NAVIGASI = [
  { href: "/", label: "Beranda", ikon: House, aktif: (p: string) => p === "/" },
  { href: "/riwayat", label: "Riwayat", ikon: ReceiptText, aktif: (p: string) => p.startsWith("/riwayat") || p.startsWith("/transactions") },
  { href: "/analitik", label: "Analitik", ikon: ChartPie, aktif: (p: string) => p.startsWith("/analitik") },
  // Lend & Borrow dibuka dari menu Profil.
  { href: "/profil", label: "Profil", ikon: UserRound, aktif: (p: string) => p.startsWith("/profil") || p.startsWith("/pinjaman") },
] as const;
