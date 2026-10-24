import { Flame } from "lucide-react";
import s from "@/components/ui.module.css";

/** Hari berturut-turut mencatat — penyemangat ala "reward karena rajin isi" di spreadsheet. */
export default function BarisStreak({ streak }: { streak: { hari: number; hariIni: boolean } }) {
  return (
    <div className={`${s.blok} ${s.baris}`}>
      <span className={s.barisIkon} style={{ background: "color-mix(in srgb, #ff8a3d 18%, transparent)", color: "#ff8a3d" }} aria-hidden>
        <Flame size={20} />
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul}>{streak.hari > 0 ? `${streak.hari} hari berturut-turut mencatat` : "Mulai streak hari ini"}</span>
        <span className={s.redup}>
          {streak.hari === 0
            ? "Catat satu transaksi tiap hari."
            : streak.hariIni
              ? "Hari ini sudah tercatat. Mantap!"
              : "Catat hari ini biar nggak putus."}
        </span>
      </span>
    </div>
  );
}
