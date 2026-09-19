"use client";

import { useEffect, useState } from "react";

/**
 * Pemilih tema tiga pilihan.
 *
 * "Sistem" sengaja jadi bawaan dan tetap disediakan sebagai pilihan, bukan cuma
 * terang/gelap: kalau HP-nya berganti gelap otomatis saat malam, aplikasi ini
 * ikut — kecuali user memang memaksa salah satu.
 *
 * Cara kerjanya bersandar pada globals.css:
 *   tanpa atribut        -> ikut prefers-color-scheme
 *   data-theme="light"   -> paksa terang (media query dijaga :not([data-theme="light"]))
 *   data-theme="dark"    -> paksa gelap
 */

type Tema = "system" | "light" | "dark";

const PILIHAN: { id: Tema; label: string }[] = [
  { id: "system", label: "Sistem" },
  { id: "light", label: "Terang" },
  { id: "dark", label: "Gelap" },
];

export default function ThemeToggle() {
  // null selama render server & hydrate pertama: pilihan tersimpan cuma ada di
  // browser, jadi menebaknya di server malah bikin tampilan salah sesaat.
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    try {
      const simpanan = localStorage.getItem("theme");
      setTema(simpanan === "light" || simpanan === "dark" ? simpanan : "system");
    } catch {
      // Penyimpanan diblokir (mode penyamaran, setelan situs): jatuh ke sistem.
      setTema("system");
    }
  }, []);

  function pilih(baru: Tema) {
    setTema(baru);
    const akar = document.documentElement;

    if (baru === "system") akar.removeAttribute("data-theme");
    else akar.setAttribute("data-theme", baru);

    try {
      if (baru === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", baru);
    } catch {
      // Pilihannya tetap berlaku untuk sesi ini, cuma tidak diingat nanti.
    }
  }

  return (
    <div>
      <p id="label-tema" className="mb-2 text-xs font-medium text-muted-foreground">
        Tampilan
      </p>
      <div
        role="radiogroup"
        aria-labelledby="label-tema"
        className="inline-flex rounded-full border border-border bg-card p-1"
      >
        {PILIHAN.map((p) => {
          const aktif = tema === p.id;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={aktif}
              onClick={() => pilih(p.id)}
              className="min-h-11 rounded-full px-4 text-xs font-semibold transition"
              style={
                aktif
                  ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                  : { color: "var(--muted-foreground)" }
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
