import NextLink from "next/link";
import { ChevronRight, CircleAlert, CircleCheck, PiggyBank, ShoppingBag, HandHeart, Wallet, type LucideIcon } from "lucide-react";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas } from "@/lib/format";
import { LABEL_METODE, type HasilMetode, type HasilWadah } from "@/lib/metode";

/**
 * Ikon & warna tiap wadah (juga dipakai pratinjau Profil → Budget). Warnanya
 * lolos uji buta warna di permukaan gelap untuk pasangan yang bersebelahan
 * (Keinginan ↔ Tabungan dulu merah muda ↔ hijau: nyaris sama bagi deutan).
 */
export const IKON: Record<string, { ikon: LucideIcon; warna: string }> = {
  kebutuhan: { ikon: Wallet, warna: "#3987e5" },
  pengeluaran: { ikon: Wallet, warna: "#3987e5" },
  "biaya-hidup": { ikon: Wallet, warna: "#3987e5" },
  keinginan: { ikon: ShoppingBag, warna: "#d95926" },
  tabungan: { ikon: PiggyBank, warna: "#199e70" },
  berbagi: { ikon: HandHeart, warna: "#9085e9" },
};
const WARNA_STATUS = { hampir: "var(--peringatan)", lewat: "var(--bahaya)", kurang: "var(--peringatan)" } as const;

/** Keterangan status, ditulis (bukan warna saja). */
function teksStatus(w: HasilWadah): string {
  if (w.tabungan) return w.status === "tercapai" ? "Tercapai" : `Kurang ${fmtIDRRingkas(w.target - w.realisasi)}`;
  if (w.status === "lewat") return `Lewat ${fmtIDRRingkas(w.realisasi - w.target)} (${w.terpakai - 100}%)`;
  return `Sisa ${fmtIDRRingkas(w.target - w.realisasi)}`;
}

/**
 * Metode budgeting bulan itu (SPEC-metode-budget): tiap wadah realisasi dari
 * targetnya, bar progres, dan status. Tabungan dibaca terbalik — makin besar
 * makin baik. Tiap baris membuka Riwayat tersaring ke kelompoknya.
 * `judul`: Beranda memakainya untuk "Budget hampir habis" (hanya yang ≥ 80%).
 */
export default function KartuMetode({
  hasil,
  namaBulanBasis,
  href,
  judul,
}: {
  hasil: HasilMetode;
  /** Nama bulan lalu, bila basisnya dari sana ("berdasarkan pemasukan September"). */
  namaBulanBasis?: string;
  /** Alamat Riwayat untuk satu wadah; tanpa ini baris tidak bisa diketuk (tabungan). */
  href?: (w: HasilWadah) => string | null;
  judul?: string;
}) {
  const wadah = judul ? hasil.wadah.filter((w) => !w.tabungan && w.status !== "aman") : hasil.wadah;
  if (!wadah.length) return null;
  return (
    <section className={s.blok}>
      <div className={s.blokIsi} style={{ paddingBottom: 4 }}>
        <h2 className={s.blokJudul}>{judul ?? `Metode ${LABEL_METODE[hasil.metode].nama}`}</h2>
        {!judul && (
          <p className={s.blokSub}>
            {hasil.basis > 0
              ? `Dari pemasukan ${fmtIDRRingkas(hasil.basis)}${hasil.basisBulanLalu && namaBulanBasis ? `, berdasarkan pemasukan ${namaBulanBasis}` : ""}.`
              : "Belum ada pemasukan untuk dibagi bulan ini."}
          </p>
        )}
      </div>

      {wadah.map((w) => {
        const { ikon: Ikon, warna } = IKON[w.id] ?? IKON.kebutuhan;
        const warnaBar = w.status === "aman" || w.status === "tercapai" ? warna : WARNA_STATUS[w.status];
        const alamat = href?.(w);
        const isi = (
          <>
            <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
              <Ikon size={20} />
            </span>
            <span className={s.barisTeks}>
              <span className={s.budgetAtas}>
                <span className={s.barisJudul}>
                  {w.nama} <span className={s.redup}>{w.persen}%</span>
                </span>
                <span className={s.nominal}>{fmtIDR(w.realisasi)}</span>
              </span>
              <span
                className={s.progres}
                role="progressbar"
                aria-label={`${w.nama}: ${w.terpakai}% dari ${w.tabungan ? "target" : "jatah"}`}
                aria-valuenow={w.terpakai}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${Math.min(w.terpakai, 100)}%`, background: warnaBar }} />
              </span>
              <span className={s.budgetBawah}>
                <span style={w.status === "aman" || w.status === "tercapai" ? undefined : { color: warnaBar, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {w.status === "tercapai" && <CircleCheck size={14} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />}
                  {(w.status === "lewat" || w.status === "kurang") && <CircleAlert size={14} aria-hidden />}
                  {teksStatus(w)}
                </span>
                <span>
                  {w.tabungan ? "target" : "jatah"} {fmtIDR(w.target)}
                </span>
              </span>
            </span>
            {alamat && <ChevronRight size={18} color="var(--teks-2)" aria-hidden style={{ alignSelf: "center" }} />}
          </>
        );
        return alamat ? (
          <NextLink key={w.id} href={alamat} className={`${s.baris} ${s.tekan}`} style={{ alignItems: "flex-start", color: "inherit" }}>
            {isi}
          </NextLink>
        ) : (
          <div key={w.id} className={s.baris} style={{ alignItems: "flex-start" }}>
            {isi}
          </div>
        );
      })}

      <NextLink href="/profil/budget" className={s.blokKaki}>
        Atur metode
      </NextLink>
    </section>
  );
}
