import NextLink from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { KATEGORI } from "@/components/kategori";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas, labelKategori } from "@/lib/format";
import type { ProgresBudget } from "@/lib/analitik";

const WARNA_STATUS = { waspada: "var(--peringatan)", lewat: "var(--bahaya)" } as const;

/**
 * Budget bulan ini per kategori: aktual/target, bar progres, dan sisa. Bar
 * memakai warna kategori selama aman, lalu kuning di atas 80% dan merah
 * kalau lewat — dan statusnya juga ditulis, bukan warna saja.
 */
export default function KartuBudget({ data, bulan }: { data: ProgresBudget[]; bulan: string }) {
  if (data.length === 0) {
    return (
      <NextLink href="/pengaturan/budget" className={`${s.blok} ${s.baris} ${s.tekan}`}>
        <span className={s.barisIkon} style={{ background: "color-mix(in srgb, #3e91ff 18%, transparent)", color: "#3e91ff" }} aria-hidden>
          <Target size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>Pasang budget bulanan</span>
          <span className={s.redup}>Tentukan batas per kategori, nanti kelihatan sisanya.</span>
        </span>
        <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
      </NextLink>
    );
  }

  const total = data.reduce((t, b) => t + b.target, 0);
  const terpakai = data.reduce((t, b) => t + b.aktual, 0);

  return (
    <section className={s.blok}>
      <div className={s.blokIsi} style={{ paddingBottom: 4 }}>
        <h2 className={s.blokJudul}>Budget {bulan}</h2>
        <p className={s.blokSub}>
          Terpakai {fmtIDRRingkas(terpakai)} dari {fmtIDRRingkas(total)}.
        </p>
      </div>

      {data.map((b) => {
        const { ikon: Ikon, warna } = KATEGORI[b.kategori] ?? KATEGORI.other;
        const warnaBar = b.status === "aman" ? warna : WARNA_STATUS[b.status];
        return (
          <div key={b.kategori} className={s.baris} style={{ alignItems: "flex-start" }}>
            <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
              <Ikon size={20} />
            </span>
            <span className={s.barisTeks}>
              <span className={s.budgetAtas}>
                <span className={s.barisJudul}>{labelKategori(b.kategori)}</span>
                <span className={s.nominal}>{fmtIDR(b.aktual)}</span>
              </span>
              <span
                className={s.progres}
                role="progressbar"
                aria-label={`${labelKategori(b.kategori)}: ${b.persen}% dari budget`}
                aria-valuenow={b.persen}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${Math.min(b.persen, 100)}%`, background: warnaBar }} />
              </span>
              <span className={s.budgetBawah}>
                <span style={b.status === "aman" ? undefined : { color: warnaBar }}>
                  {b.sisa >= 0 ? `Sisa ${fmtIDR(b.sisa)}` : `Lewat ${fmtIDR(-b.sisa)}`}
                </span>
                <span>dari {fmtIDR(b.target)}</span>
              </span>
            </span>
          </div>
        );
      })}

      <NextLink href="/pengaturan/budget" className={s.blokKaki}>
        Atur budget
      </NextLink>
    </section>
  );
}
