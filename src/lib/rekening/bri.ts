import { GalatRekening, type BarisBank, type BarisPdf, type HasilBaca, type Pihak } from "@/lib/rekening/jenis";
import { angkaUS, empatAkhir, rapikan } from "@/lib/rekening/teks";

/**
 * BRI (BRImo) "Laporan Transaksi Finansial" bulanan: `dd/mm/yy HH:MM:SS`,
 * uraian (bisa dua baris), teller, Debet, Kredit, Saldo dengan angka format AS
 * (`6,143,500.00`). Saldo awal & akhir di halaman terakhir. Biaya BI-Fast
 * (Rp 2.500) tercatat sebagai baris terpisah dengan waktu & uraian yang sama.
 */

export const cocokBri = (baris: BarisPdf[]) =>
  baris.some((b) => /LAPORAN TRANSAKSI FINANSIAL/.test(b.teks)) && baris.some((b) => /BRIMO|Bank BRI|BANK BRI/i.test(b.teks));

const WAKTU = /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/;
const ANGKA = /^\d{1,3}(,\d{3})*\.\d{2}$/;

/** Pihak lawan dari uraian BRI. */
export function pihakBri(uraian: string): Pihak | null {
  let m = uraian.match(/^Transfer BI-Fast (?:dari|ke) (.+?) - (\d{6,}) - (.+)$/i);
  if (m) return { nama: m[3].trim(), bank: m[1].trim(), nomor: m[2] };
  m = uraian.match(/^Transfer (?:Ke|Dari) (.+?) via BRImo$/i);
  if (m) return { nama: m[1].trim(), bank: "BRI", nomor: null };
  m = uraian.match(/^Top Up (Shopee|ShopeePay|DANA|GoPay|OVO|LinkAja)\b ?(\S*)/i);
  if (m) return { nama: null, bank: /^shopee/i.test(m[1]) ? "ShopeePay" : m[1], nomor: m[2] || null };
  m = uraian.match(/^Pembayaran BRIVA ke (.+?)(?: - \d+.*)?$/i);
  if (m) return { nama: m[1].trim(), bank: null, nomor: null };
  if (/^QRIS/i.test(uraian)) return { nama: "QRIS", bank: null, nomor: null };
  return null;
}

export function bacaBri(baris: BarisPdf[]): HasilBaca {
  const rek = baris.map((b) => b.teks.match(/No\. Rekening : (\d{6,})/)).find(Boolean);
  const nomorAkhir = empatAkhir(rek?.[1]);
  if (!nomorAkhir) throw new GalatRekening("Nomor rekening BRI tidak terbaca.");
  const per = baris.map((b) => b.teks.match(/Periode Transaksi : (\d{2})\/(\d{2})\/(\d{2}) - (\d{2})\/(\d{2})\/(\d{2})/)).find(Boolean);
  if (!per) throw new GalatRekening("Periode rekening koran BRI tidak terbaca.");
  const dari = `20${per[3]}-${per[2]}-${per[1]}`;
  const sampai = `20${per[6]}-${per[5]}-${per[4]}`;
  const iYth = baris.findIndex((b) => /^Kepada Yth/.test(b.teks));
  const pemilik =
    iYth >= 0
      ? (baris
          .slice(iYth + 1, iYth + 6)
          .map((b) => rapikan(b.items.filter((p) => p.x < 300).map((p) => p.s).join(" ")))
          .find((t) => t && !/^(To|Statement)/.test(t)) ?? null)
      : null;

  // Saldo awal & akhir: baris angka sesudah judul "Saldo Awal … Saldo Akhir".
  const iRingkas = baris.findIndex((b) => /^Saldo Awal .*Saldo Akhir$/.test(b.teks));
  const ringkas = baris.slice(iRingkas + 1, iRingkas + 4).find((b) => b.items.filter((p) => ANGKA.test(p.s.trim())).length === 4);
  if (iRingkas < 0 || !ringkas) throw new GalatRekening("Saldo awal/akhir BRI tidak terbaca.");
  const [saldoAwal, , , saldoAkhir] = ringkas.items.filter((p) => ANGKA.test(p.s.trim())).map((p) => angkaUS(p.s.trim()));

  const judul = baris.find((b) => /^Tanggal Transaksi/.test(b.teks));
  const xUraian = (judul?.items.find((p) => p.s.startsWith("Uraian"))?.x ?? 170) - 70;
  const xTeller = judul?.items.find((p) => p.s.startsWith("Teller"))?.x ?? 305;

  interface Mentah {
    tanggal: string;
    jam: string;
    uraian: string[];
    nominal: number;
    saldo: number;
  }
  const mentah: Mentah[] = [];
  for (const b of baris) {
    const [w, ...sisa] = b.items;
    const m = (w?.s.trim() ?? "").match(WAKTU) ?? b.teks.match(/^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})\b/);
    const angka = b.items.filter((p) => ANGKA.test(p.s.trim()));
    if (m && angka.length >= 3) {
      const [debet, kredit, saldo] = angka.slice(-3).map((p) => angkaUS(p.s.trim()));
      const uraian = sisa.filter((p) => p.x < xTeller - 10 && !WAKTU.test(p.s.trim()) && !/^\d{2}:\d{2}:\d{2}$/.test(p.s.trim())).map((p) => p.s);
      mentah.push({ tanggal: `20${m[3]}-${m[2]}-${m[1]}`, jam: m[4], uraian, nominal: Math.round((kredit - debet) * 100) / 100, saldo });
      continue;
    }
    // Lanjutan uraian: hanya di kolom uraian, langsung sesudah baris transaksi.
    const r = mentah.at(-1);
    if (r && b.items.length && b.items.every((p) => p.x >= xUraian && p.x < xTeller - 10) && !/^(Saldo Awal|Opening|Terbilang)/.test(b.teks)) r.uraian.push(b.teks);
  }
  // Lanjutan uraian tidak boleh melewati judul ringkasan.
  const hasil: BarisBank[] = mentah.map((r, urut) => {
    const uraian = rapikan(r.uraian.join(" "));
    return {
      tanggal: r.tanggal,
      jam: r.jam,
      nominal: r.nominal,
      saldo: r.saldo,
      uraian,
      jenis: null,
      pihak: pihakBri(uraian),
      catatan: null,
      ref: `bri:${nomorAkhir}:${r.tanggal}T${r.jam}:${r.nominal}:${r.saldo}`,
      urut,
    };
  });

  return {
    format: "bri",
    bank: "bri",
    pemilik,
    rekening: [{ bank: "bri", nomorAkhir, saku: null, utama: true, dari, sampai, saldoAwal, saldoAkhir, baris: hasil }],
    deposito: [],
  };
}
