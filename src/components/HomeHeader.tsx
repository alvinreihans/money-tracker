import { fmtIDRRingkas, namaBulan } from "@/lib/format";

/**
 * Header beranda: bulan berjalan dan tiga angka ringkasannya di atas bidang
 * Liquid Lava.
 *
 * SEMUA teks di sini pakai Dark Void solid, tanpa opasitas. Teks gelap
 * beralfa di atas oranye jatuh ke 3,66–4,25:1 — gagal untuk ukuran kecil.
 * Jadi hierarkinya dibangun lewat tebal dan ukuran huruf, bukan transparansi.
 */

interface Props {
  keluar: number;
  masuk: number;
  keluarBulanLalu: number;
}

function Tile({
  label,
  value,
  children,
  lebar = false,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
  lebar?: boolean;
}) {
  return (
    <div
      className={`rounded-[10px] px-3 py-3 ${lebar ? "flex items-center justify-between gap-3" : ""}`}
      // Void 12% di atas oranye; nominal solid di atasnya tetap 5,04:1.
      style={{ background: "rgba(21,20,25,0.12)" }}
    >
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.05em] text-primary-foreground">
        {label}
      </p>
      <div>
        <p
          className={`amount-display m-0 leading-tight text-primary-foreground ${
            lebar ? "text-[22px]" : "mt-1 text-[19px]"
          }`}
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
        className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full"
        style={{ background: "rgba(21,20,25,0.06)" }}
      />

      <div className="relative">
        <p className="m-0 text-[13px] font-semibold text-primary-foreground">
          {namaBulan(sekarang)} {sekarang.getFullYear()}
        </p>
        <h1 className="mb-5 mt-0.5 text-xl font-extrabold text-primary-foreground">
          Money Tracker
        </h1>

        <div className="grid grid-cols-2 gap-2.5">
          <Tile label="Keluar bulan ini" value={fmtIDRRingkas(keluar)}>
            {adaPembanding && persen !== 0 && (
              // Arah dibawa panah dan teks. Hijau/merah di atas oranye sama-sama
              // gagal kontras, dan warna sendirian memang tidak boleh jadi
              // satu-satunya pembawa makna.
              <p className="m-0 mt-1 text-[11px] font-semibold text-primary-foreground">
                {naik ? "↑ naik" : "↓ turun"} {Math.abs(persen)}% vs{" "}
                {namaBulan(bulanLalu)}
              </p>
            )}
          </Tile>

          <Tile label="Masuk bulan ini" value={fmtIDRRingkas(masuk)} />

          <div className="col-span-2">
            <Tile
              label="Selisih"
              lebar
              value={`${selisih < 0 ? "−" : ""}${fmtIDRRingkas(Math.abs(selisih))}`}
            >
              <p className="m-0 mt-1 text-[11px] font-medium text-primary-foreground">
                {selisih >= 0 ? "Masih surplus" : "Lebih besar pasak"}
              </p>
            </Tile>
          </div>
        </div>
      </div>
    </header>
  );
}
