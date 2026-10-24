import s from "@/components/ui.module.css";
import { fmtIDRRingkas } from "@/lib/format";

/** Keluar, masuk, dan selisih bulan berjalan (tab Analitik). */
export default function RingkasanBulan({ keluar, masuk }: { keluar: number; masuk: number }) {
  const selisih = masuk - keluar;

  return (
    <section className={s.blok} aria-label="Ringkasan bulan ini">
      <div className={s.statBaris}>
        <span>Keluar</span>
        <span className={s.nominal}>{fmtIDRRingkas(keluar)}</span>
      </div>
      <div className={s.statBaris}>
        <span>Masuk</span>
        <span className={`${s.nominal} ${masuk > 0 ? s.masuk : ""}`}>{fmtIDRRingkas(masuk)}</span>
      </div>
      <div className={s.statBaris}>
        <span>
          Selisih
          <br />
          <span className={s.redup}>{selisih >= 0 ? "Masih surplus" : "Lebih besar pasak"}</span>
        </span>
        <span className={`${s.nominal} ${selisih < 0 ? s.bahaya : s.masuk}`}>
          {selisih < 0 ? "−" : ""}
          {fmtIDRRingkas(Math.abs(selisih))}
        </span>
      </div>
    </section>
  );
}
