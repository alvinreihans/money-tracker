import { fmtIDRRingkas, namaBulan } from "@/lib/format";

/**
 * Header beranda: bulan berjalan dan tiga angka ringkasannya di atas bidang
 * hijau. Menaruhnya di header, bukan sebagai kartu di tengah halaman, membuat
 * angka terpenting terbaca duluan sebelum apa pun sempat mengalihkan.
 */

interface Props {
  keluar: number;
  masuk: number;
  keluarBulanLalu: number;
}

function Tile({
  label,
  value,
  negatif = false,
  children,
  lebar = false,
}: {
  label: string;
  value: string;
  negatif?: boolean;
  children?: React.ReactNode;
  lebar?: boolean;
}) {
  return (
    <div
      className={`rounded-[10px] bg-white/10 px-3 py-3 ${lebar ? "flex items-center justify-between gap-3" : ""}`}
    >
      <p className="m-0 text-[11px] font-medium uppercase tracking-[0.05em] text-[rgba(245,242,236,0.65)]">
        {label}
      </p>
      <div>
        <p
          className={`amount-display m-0 leading-tight ${lebar ? "text-[22px]" : "mt-1 text-[19px]"}`}
          style={{ color: negatif ? "#f08070" : "rgba(245,242,236,0.95)" }}
        >
          {value}
        </p>
        {children}
      </div>
    </div>
  );
}

export default function HomeHeader({ keluar, masuk, keluarBulanLalu }: Props) {
  const selisih = masuk - keluar;
  const sekarang = new Date();

  const bulanLalu = new Date();
  bulanLalu.setDate(1);
  bulanLalu.setMonth(bulanLalu.getMonth() - 1);

  const adaPembanding = keluarBulanLalu > 0;
  const persen = adaPembanding
    ? Math.round(((keluar - keluarBulanLalu) / keluarBulanLalu) * 100)
    : 0;
  const naik = persen > 0;

  return (
    <header
      className="relative overflow-hidden px-5 pb-6 pt-12"
      style={{ background: "var(--primary)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/5"
      />

      <div className="relative">
        <p className="m-0 text-[13px] font-medium text-[rgba(245,242,236,0.65)]">
          {namaBulan(sekarang)} {sekarang.getFullYear()}
        </p>
        <h1 className="mb-5 mt-0.5 text-xl font-bold text-[var(--primary-foreground)]">
          Money Tracker
        </h1>

        <div className="grid grid-cols-2 gap-2.5">
          <Tile label="Keluar bulan ini" value={fmtIDRRingkas(keluar)}>
            {adaPembanding && persen !== 0 && (
              // Arah lewat panah dan teks, bukan warna saja — merah-hijau
              // sendirian tidak terbaca oleh sebagian orang.
              <p
                className="m-0 mt-1 text-[11px] font-medium"
                style={{ color: naik ? "#f08070" : "#7dcfa0" }}
              >
                {naik ? "↑" : "↓"} {Math.abs(persen)}% vs {namaBulan(bulanLalu)}
              </p>
            )}
          </Tile>

          <Tile label="Masuk bulan ini" value={fmtIDRRingkas(masuk)} />

          <div className="col-span-2">
            <Tile
              label="Selisih"
              lebar
              negatif={selisih < 0}
              value={`${selisih < 0 ? "−" : ""}${fmtIDRRingkas(Math.abs(selisih))}`}
            >
              <p className="m-0 mt-1 text-[11px] italic text-[rgba(245,242,236,0.55)]">
                {selisih >= 0 ? "Masih surplus" : "Lebih besar pasak"}
              </p>
            </Tile>
          </div>
        </div>
      </div>
    </header>
  );
}
