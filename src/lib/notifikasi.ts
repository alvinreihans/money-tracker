import { fmtIDR } from "@/lib/format";
import { hitungSaldo, type BarisSaldo, type Kantong } from "@/lib/kantong";
import { jadwalCicilan, type Cicilan } from "@/lib/pinjaman";

/**
 * Isi push notifikasi harian (SPEC-notifikasi.md). Fungsi murni — diuji di
 * scripts/uji-notifikasi.mts; pengirimannya di lib/push.ts.
 */

export interface Notifikasi {
  judul: string;
  isi: string;
  /** Halaman yang dibuka saat notifikasi diketuk. */
  url: string;
  /** Notifikasi bertag sama menggantikan yang lama, bukan menumpuk. */
  tag: string;
}

/** Bentuk satu user dari RPC data_notifikasi(). */
export interface DataNotifikasi {
  kantong: (Pick<Kantong, "id" | "name" | "kind" | "saldo_awal" | "saldo_per" | "jatuh_tempo">)[];
  cicilan: Pick<Cicilan, "id" | "nama" | "nominal" | "tenor" | "jatuh_tempo_awal">[];
  transaksi: (BarisSaldo & { created_at: string; cicilan_id: string | null; cicilan_ke: number | null })[];
  /** Catatan yang belum selesai dilengkapi (SPEC-catat-chat.md). */
  draft?: { id: string; dibuat: string; source: string }[];
}

/** Umur maksimal catatan yang belum selesai; lewat itu dihapus cron. */
export const UMUR_DRAFT_HARI = 30;

const tglPendek = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

/** "YYYY-MM-DD" menurut jam WIB — server Vercel berjalan di UTC. */
export const hariWIB = (waktu: Date | string) =>
  new Date(waktu).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

const geser = (iso: string, hari: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
};

export function isiNotifikasi(d: DataNotifikasi, sekarang = new Date()): Notifikasi[] {
  const hariIni = hariWIB(sekarang);
  // Dikirim 19.00, jadi diingatkan H-3 dan H-1: malam sebelumnya masih sempat bayar.
  const kapan = (tgl: string) => (tgl === geser(hariIni, 1) ? "besok" : tgl === geser(hariIni, 3) ? "3 hari lagi" : null);
  const hasil: Notifikasi[] = [];

  const dibayar = new Map<string, number[]>();
  for (const t of d.transaksi) {
    if (t.cicilan_id && t.cicilan_ke) dibayar.set(t.cicilan_id, [...(dibayar.get(t.cicilan_id) ?? []), t.cicilan_ke]);
  }
  for (const c of d.cicilan) {
    for (const a of jadwalCicilan(c, dibayar.get(c.id) ?? [])) {
      if (a.dibayar) continue;
      const k = kapan(a.jatuhTempo);
      const telat = a.jatuhTempo === geser(hariIni, -1);
      if (!k && !telat) continue;
      hasil.push({
        judul: telat ? "Cicilan lewat jatuh tempo" : `Cicilan jatuh tempo ${k}`,
        isi: `${c.nama} ke-${a.ke} · ${fmtIDR(Number(c.nominal))}`,
        url: "/pinjaman",
        tag: `cicilan-${c.id}-${a.ke}`,
      });
    }
  }

  const saldo = new Map(hitungSaldo(d.kantong as Kantong[], d.transaksi).map((s) => [s.id, s.saldo]));
  for (const k of d.kantong) {
    const n = saldo.get(k.id) ?? 0;
    const w = k.jatuh_tempo ? kapan(k.jatuh_tempo) : null;
    if (!w || n === 0 || (k.kind === "kredit" && n > 0)) continue;
    hasil.push({
      judul: k.kind === "kredit" ? `Tagihan ${k.name} ${w}` : n > 0 ? `${k.name} bayar ${w}` : `Bayar ke ${k.name} ${w}`,
      isi: fmtIDR(Math.abs(n)),
      url: "/pinjaman",
      tag: `pinjaman-${k.id}`,
    });
  }

  // Catatan belum selesai: diingatkan H+1 dan H+7, lalu dihapus H+30.
  for (const dr of d.draft ?? []) {
    const dibuat = hariWIB(dr.dibuat);
    const h1 = geser(dibuat, 1) === hariIni;
    const h7 = geser(dibuat, 7) === hariIni;
    if (!h1 && !h7) continue;
    const apa = `${dr.source === "text" ? "Catatan" : "Struk"} ${tglPendek(dibuat)}`;
    hasil.push({
      judul: "1 catatan belum selesai",
      isi: h7 ? `${apa} — dihapus otomatis ${tglPendek(geser(dibuat, UMUR_DRAFT_HARI))}. Ketuk untuk melengkapi.` : `${apa} — ketuk untuk melengkapi.`,
      url: `/?catat=${dr.id}`,
      tag: `draft-${dr.id}`,
    });
  }

  if (!d.transaksi.some((t) => hariWIB(t.created_at) === hariIni)) {
    hasil.push({ judul: "Belum nyatat hari ini", isi: "Ada pengeluaran hari ini? Catat sebelum lupa.", url: "/", tag: "catat" });
  }
  return hasil;
}
