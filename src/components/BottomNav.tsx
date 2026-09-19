"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigasi bawah tiga tab.
 *
 * Sebelumnya semua fitur ditumpuk dalam satu gulungan panjang, sehingga
 * mengurus daftar rekening (sekali seumur hidup) terlihat sepenting memotret
 * struk (tiap hari). Memisahkannya jadi tab mengembalikan urutan kepentingan.
 *
 * Badge di tab Riwayat menampilkan jumlah draft yang gagal dibaca — dulu itu
 * tersimpan diam-diam tanpa satu pun penanda.
 */

const TABS = [
  { href: "/", label: "Beranda", icon: IconBeranda },
  { href: "/riwayat", label: "Riwayat", icon: IconRiwayat, badge: true },
  { href: "/rekening", label: "Rekening", icon: IconRekening },
] as const;

export default function BottomNav({ draftCount = 0 }: { draftCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-border bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon, ...rest }) => {
          const aktif = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const badge = "badge" in rest && rest.badge ? draftCount : 0;

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={aktif ? "page" : undefined}
                className="flex flex-col items-center gap-1 py-2.5"
                style={{ color: aktif ? "var(--primary)" : "var(--muted-foreground)" }}
              >
                <span className="relative">
                  <Icon />
                  {badge > 0 && (
                    <span
                      className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                      style={{ background: "var(--danger)" }}
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] ${aktif ? "font-semibold" : "font-normal"}`}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const svg = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconBeranda() {
  return (
    <svg {...svg}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function IconRiwayat() {
  return (
    <svg {...svg}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function IconRekening() {
  return (
    <svg {...svg}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M16 15h2" />
    </svg>
  );
}
