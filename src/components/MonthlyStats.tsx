import { fmtIDRRingkas, isoLokal, namaBulan } from "@/lib/format";

/**
 * Tiga stat tile: keluar, masuk, dan selisihnya bulan ini.
 *
 * Sengaja BUKAN "saldo". Saldo butuh saldo awal tiap rekening, dan aplikasi ini
 * cuma punya arus transaksi — menyebutnya saldo berarti menampilkan angka yang
 * kelihatan pasti padahal salah. Selisih pemasukan dikurangi pengeluaran adalah
 * hal terdekat yang bisa dihitung dengan jujur.
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
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 rounded-lg bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      {/* Angka proporsional, bukan tabular-nums: pada ukuran besar tabular
          bikin angka terlihat renggang. tabular-nums untuk kolom saja. */}
      <p className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      {children}
    </div>
  );
}

export default function MonthlyStats({ keluar, masuk, keluarBulanLalu }: Props) {
  const selisih = masuk - keluar;
  const bulanLalu = new Date();
  bulanLalu.setDate(1);
  bulanLalu.setMonth(bulanLalu.getMonth() - 1);

  // Delta hanya berarti kalau ada pembandingnya.
  const adaPembanding = keluarBulanLalu > 0;
  const persen = adaPembanding
    ? Math.round(((keluar - keluarBulanLalu) / keluarBulanLalu) * 100)
    : 0;
  const naik = persen > 0;

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <Tile label="Keluar bulan ini" value={fmtIDRRingkas(keluar)}>
        {adaPembanding && persen !== 0 && (
          // Arah dinyatakan lewat panah + teks, bukan warna saja — biar tetap
          // terbaca buat yang sulit membedakan warna.
          <p
            className={`mt-1 text-xs ${naik ? "text-red-600" : "text-emerald-700"}`}
          >
            {naik ? "↑" : "↓"} {Math.abs(persen)}% vs {namaBulan(bulanLalu)}
          </p>
        )}
      </Tile>

      <Tile label="Masuk bulan ini" value={fmtIDRRingkas(masuk)} />

      <Tile
        label="Selisih"
        value={`${selisih >= 0 ? "+" : "−"}${fmtIDRRingkas(Math.abs(selisih))}`}
      >
        <p
          className={`mt-1 text-xs ${selisih >= 0 ? "text-emerald-700" : "text-red-600"}`}
        >
          {selisih >= 0 ? "Masih surplus" : "Lebih besar pasak"}
        </p>
      </Tile>
    </div>
  );
}

/** Rentang tanggal yang dipakai query, dihitung di zona waktu lokal. */
export function rentangBulan() {
  const awalIni = new Date();
  awalIni.setDate(1);

  const awalLalu = new Date(awalIni);
  awalLalu.setMonth(awalLalu.getMonth() - 1);

  return {
    awalBulanIni: isoLokal(awalIni),
    awalBulanLalu: isoLokal(awalLalu),
  };
}
