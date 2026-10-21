import s from "@/components/ui.module.css";
import { fmtIDRRingkas, namaBulan } from "@/lib/format";

/**
 * Tiga angka bulan berjalan. Arah perubahan dibawa panah dan teks, bukan
 * warna saja — warna sendirian tidak boleh jadi satu-satunya pembawa makna.
 */
export default function RingkasanBulan({
  keluar,
  masuk,
  keluarBulanLalu,
}: {
  keluar: number;
  masuk: number;
  keluarBulanLalu: number;
}) {
  const selisih = masuk - keluar;

  const bulanLalu = new Date();
  bulanLalu.setDate(1);
  bulanLalu.setMonth(bulanLalu.getMonth() - 1);

  const persen =
    keluarBulanLalu > 0 ? Math.round(((keluar - keluarBulanLalu) / keluarBulanLalu) * 100) : 0;

  return (
    <section className={`${s.kotak} ${s.statGrid}`} aria-label="Ringkasan bulan ini">
      <div className={s.stat}>
        <span className={s.redup}>Keluar bulan ini</span>
        <span className={s.statNilai}>{fmtIDRRingkas(keluar)}</span>
        {persen !== 0 && (
          <span className={s.redup}>
            {persen > 0 ? "↑ naik" : "↓ turun"} {Math.abs(persen)}% vs {namaBulan(bulanLalu)}
          </span>
        )}
      </div>

      <div className={s.stat}>
        <span className={s.redup}>Masuk bulan ini</span>
        <span className={`${s.statNilai} ${masuk > 0 ? s.masuk : ""}`}>{fmtIDRRingkas(masuk)}</span>
      </div>

      <div className={s.stat}>
        <span className={s.redup}>Selisih</span>
        <span className={`${s.statNilai} ${selisih < 0 ? s.draft : s.masuk}`}>
          {selisih < 0 ? "−" : ""}
          {fmtIDRRingkas(Math.abs(selisih))}
        </span>
        <span className={s.redup}>{selisih >= 0 ? "Masih surplus" : "Lebih besar pasak"}</span>
      </div>
    </section>
  );
}
