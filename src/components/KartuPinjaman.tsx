import NextLink from "next/link";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtTanggalPendek } from "@/lib/format";
import type { RingkasBeranda } from "@/lib/pinjaman";

/**
 * Kartu "Utang & Piutang" di Beranda: total yang dipinjamkan & dipinjam,
 * cicilan yang jatuh tempo bulan ini, dan tenggat terdekat. Tidak tampil
 * kalau belum ada pinjaman maupun cicilan (masuk lewat Pengaturan).
 */
export default function KartuPinjaman({ data }: { data: RingkasBeranda }) {
  if (!data.ada) return null;
  const { terdekat, cicilanBulanIni } = data;

  return (
    <section className={s.blok}>
      <div className={s.blokIsi} style={{ paddingBottom: 4 }}>
        <h2 className={s.blokJudul}>Utang & Piutang</h2>
        {terdekat && (
          <p className={`${s.blokSub} ${terdekat.telat ? s.bahaya : ""}`}>
            {terdekat.telat
              ? `${terdekat.nama} telat sejak ${fmtTanggalPendek(terdekat.tanggal)}`
              : `Terdekat: ${terdekat.nama}, ${fmtTanggalPendek(terdekat.tanggal)}`}
          </p>
        )}
      </div>
      <div className={s.statBaris}>
        <span>
          Piutang
          <br />
          <span className={s.redup}>{data.orangLend} orang utang ke kamu</span>
        </span>
        <span className={`${s.nominal} ${s.masuk}`}>{fmtIDR(data.totalLend)}</span>
      </div>
      <div className={s.statBaris}>
        <span>
          Utang
          <br />
          <span className={s.redup}>Ke orang & kartu kredit</span>
        </span>
        <span className={s.nominal}>{fmtIDR(data.totalBorrow)}</span>
      </div>
      {cicilanBulanIni.jumlah > 0 && (
        <div className={s.statBaris}>
          <span>
            Cicilan bulan ini
            <br />
            <span className={s.redup}>{cicilanBulanIni.jumlah} belum dibayar</span>
          </span>
          <span className={s.nominal}>{fmtIDR(cicilanBulanIni.total)}</span>
        </div>
      )}
      <NextLink href="/pinjaman" className={s.blokKaki}>
        Lihat Utang & Piutang
      </NextLink>
    </section>
  );
}
