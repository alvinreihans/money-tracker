import { ChartPie, HandCoins, House, ReceiptText, UserRound } from "lucide-react";

/**
 * Tab utama aplikasi (SPEC-navigasi), ditulis sekali: kapsul bawah di HP,
 * rail di tablet/Fold, sidebar di desktop (SPEC-layar-lebar). `aktif`: alamat
 * yang menyalakan tab itu. `sidebar`: hanya tampil di sidebar.
 */
export const NAVIGASI = [
  { href: "/", label: "Beranda", ikon: House, aktif: (p: string) => p === "/" },
  { href: "/riwayat", label: "Riwayat", ikon: ReceiptText, aktif: (p: string) => p.startsWith("/riwayat") || p.startsWith("/transactions") },
  { href: "/analitik", label: "Analitik", ikon: ChartPie, aktif: (p: string) => p.startsWith("/analitik") },
  // Di HP & rail, Utang & Piutang dibuka dari menu Profil; di sidebar jadi item sendiri.
  { href: "/pinjaman", label: "Utang & Piutang", ikon: HandCoins, aktif: (p: string) => p.startsWith("/pinjaman"), sidebar: true },
  { href: "/profil", label: "Profil", ikon: UserRound, aktif: (p: string) => p.startsWith("/profil") || p.startsWith("/pinjaman") },
] as const;

/** Layar lebar: dua panel (Riwayat, Profil) dan Tanya AI di samping. Samakan dengan CSS. */
export const LAYAR_LEBAR = "(min-width: 840px)";
