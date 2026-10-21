import s from "@/components/ui.module.css";
import type { Bulan } from "@/lib/analitik";
import { fmtIDRRingkas } from "@/lib/format";

const MASUK = "#5ecb7a";
const KELUAR = "#ff8a65";

/**
 * Pemasukan vs pengeluaran per bulan, seperti grafik "Ringkasan" di
 * spreadsheet. SVG sendiri — dua batang per bulan tidak perlu pustaka chart.
 */
export default function TrenBulanan({ data }: { data: Bulan[] }) {
  const W = 320;
  const dasar = 124; // garis dasar batang
  const tinggi = 112;
  const maks = Math.max(1, ...data.flatMap((b) => [b.masuk, b.keluar]));
  const slot = W / data.length;
  const lebar = 14;
  const skala = (n: number) => Math.max(n > 0 ? 3 : 0, (n / maks) * tinggi);

  const ringkasan = data
    .map((b) => `${b.label}: masuk ${fmtIDRRingkas(b.masuk)}, keluar ${fmtIDRRingkas(b.keluar)}`)
    .join("; ");

  return (
    <section className={s.blok}>
      <div className={s.blokIsi}>
        <h2 className={s.blokJudul}>Tren {data.length} bulan</h2>
        <p className={s.blokSub}>Pemasukan dan pengeluaran per bulan.</p>

        <svg viewBox={`0 0 ${W} 146`} width="100%" role="img" aria-label={ringkasan} style={{ marginTop: 16, display: "block" }}>
          <line x1="0" x2={W} y1={dasar} y2={dasar} stroke="var(--garis)" />
          {data.map((b, i) => {
            const tengah = slot * i + slot / 2;
            const terakhir = i === data.length - 1;
            return (
              <g key={b.kunci}>
                <rect x={tengah - lebar - 2} y={dasar - skala(b.masuk)} width={lebar} height={skala(b.masuk)} rx="4" fill={MASUK} opacity={terakhir ? 1 : 0.75}>
                  <title>{`${b.label} — masuk ${fmtIDRRingkas(b.masuk)}`}</title>
                </rect>
                <rect x={tengah + 2} y={dasar - skala(b.keluar)} width={lebar} height={skala(b.keluar)} rx="4" fill={KELUAR} opacity={terakhir ? 1 : 0.75}>
                  <title>{`${b.label} — keluar ${fmtIDRRingkas(b.keluar)}`}</title>
                </rect>
                <text
                  x={tengah}
                  y={dasar + 18}
                  textAnchor="middle"
                  fontSize="12"
                  fill={terakhir ? "var(--teks)" : "var(--teks-2)"}
                  fontWeight={terakhir ? 700 : 400}
                >
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <span className={s.redup} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className={s.titik} style={{ background: MASUK }} /> Masuk
          </span>
          <span className={s.redup} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className={s.titik} style={{ background: KELUAR }} /> Keluar
          </span>
        </div>
      </div>
    </section>
  );
}
