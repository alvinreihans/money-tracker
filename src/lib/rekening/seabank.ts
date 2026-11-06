import { GalatRekening, type BarisBank, type BarisPdf, type DepositoBank, type HasilBaca } from "@/lib/rekening/jenis";
import { angkaID, empatAkhir, isoTanggal, nomorBulan, rapikan, sen, tanggalTeks } from "@/lib/rekening/teks";

/**
 * SeaBank "BANK STATEMENT" bulanan. Satu baris transaksi = 3–4 baris teks:
 * pihak lawan di atas, lalu `DD MON  nominal  saldo` (tanpa jam, tahun dari
 * periode), rekening lawan, dan jenis baris dari himpunan tertutup di bawah.
 * Kolom keluar & masuk tidak bisa dibedakan dari teksnya — dari posisi x
 * nominalnya (kolom OUTGOING vs INCOMING), dicek ulang oleh saldo berjalan.
 */

/** Jenis baris SeaBank (baris terakhir di bawah tanggal). */
export const JENIS_SEABANK = ["Payment", "Interest", "Transfer", "Top Up - eWallet", "Time Deposit", "Adjustment", "Tax", "Fee", "Refund", "Withdrawal"];

export const cocokSeabank = (baris: BarisPdf[]) =>
  baris.some((b) => /^SEABANK ACCOUNT:/i.test(b.teks)) && baris.some((b) => b.teks === "BANK STATEMENT");

const TANGGAL_BARIS = /^(\d{2}) ([A-Z]{3})\b/;
const ANGKA = /^\d{1,3}(\.\d{3})*$/;

export function bacaSeabank(baris: BarisPdf[]): HasilBaca {
  const iAkun = baris.findIndex((b) => /^SEABANK ACCOUNT:/i.test(b.teks));
  const nomor = baris[iAkun]?.teks.match(/SEABANK ACCOUNT:\s*(\d+)/i)?.[1];
  const nomorAkhir = empatAkhir(nomor);
  if (!nomorAkhir) throw new GalatRekening("Nomor rekening SeaBank tidak terbaca.");
  // Nama pemilik: baris tepat di atas nomor rekening (kolom kiri).
  const pemilik = iAkun > 0 ? rapikan(baris[iAkun - 1].items.filter((p) => p.x < 300).map((p) => p.s).join(" ")) || null : null;

  const per = baris.map((b) => b.teks.match(/(\d{2} [A-Z]{3} \d{4}) to (\d{2} [A-Z]{3} \d{4})/)).find(Boolean);
  const dari = per && tanggalTeks(per[1]);
  const sampai = per && tanggalTeks(per[2]);
  if (!dari || !sampai) throw new GalatRekening("Periode rekening koran SeaBank tidak terbaca.");

  // Ringkasan: SAVINGS saldo-awal keluar masuk saldo-akhir.
  const ringkas = baris.find((b) => /^SAVINGS( [\d.]+){4}$/.test(b.teks));
  if (!ringkas) throw new GalatRekening("Ringkasan saldo SeaBank tidak terbaca.");
  const [saldoAwal, , , saldoAkhir] = ringkas.teks.split(" ").slice(1).map(angkaID);

  // Deposito: di antara judul tabel TIME DEPOSIT dan TOTAL-nya.
  const deposito: DepositoBank[] = [];
  const iDepo = baris.findIndex((b) => /^TIME DEPOSIT TENURE/.test(b.teks));
  if (iDepo >= 0) {
    for (let i = iDepo + 1; i < baris.length && !/^TOTAL:/.test(baris[i].teks); i++) {
      const m = baris[i].teks.match(/^(.+?) (\d+) (MONTHS?|DAYS?) (\d{2} [A-Z]{3} \d{4}) ([\d.,]+)% P\.A\. ([\d.]+)$/);
      if (!m) continue;
      const kode = baris[i + 1]?.teks.match(/^\((.+)\)$/)?.[1] ?? null;
      deposito.push({
        nama: m[1],
        kode,
        tenor: Number(m[2]),
        satuan: /^DAY/.test(m[3]) ? "hari" : "bulan",
        jatuhTempo: tanggalTeks(m[4])!,
        bunga: Number(m[5].replace(",", ".")),
        pokok: angkaID(m[6]),
      });
    }
  }

  // Daftar transaksi.
  const mulai = baris.findIndex((b) => /^SAVINGS - TRANSACTION DETAILS/.test(b.teks));
  const iAkhir = baris.findIndex((b, i) => i > mulai && /^TIME DEPOSIT - INTEREST/.test(b.teks));
  const bagian = baris.slice(mulai + 1, iAkhir < 0 ? baris.length : iAkhir);
  const judul = bagian.find((b) => /^DATE TRANSACTION OUTGOING/.test(b.teks));
  const xKeluar = judul?.items.find((p) => p.s === "OUTGOING")?.x;
  const xMasuk = judul?.items.find((p) => p.s === "INCOMING")?.x;
  // Batas kolom: nominal keluar rata kanan di bawah "(IDR)" pertama; masuk mulai dari "INCOMING".
  const xIdr = judul?.items.find((p) => p.s === "(IDR)" && xKeluar !== undefined && p.x > xKeluar)?.x;
  const batasMasuk = xMasuk !== undefined && xIdr !== undefined ? (xIdr + xMasuk) / 2 : null;
  const xTeks = judul?.items.find((p) => p.s === "TRANSACTION")?.x ?? 0;

  const abaikan = (b: BarisPdf) =>
    /^DATE TRANSACTION/.test(b.teks) ||
    /^page \d+ of \d+$/i.test(b.teks) ||
    b.teks === "BANK STATEMENT" ||
    /^S\/N /.test(b.teks) ||
    /^\d{2} [A-Z]{3} \d{4}$/.test(b.teks) ||
    /^\(IDR\)/.test(b.teks);

  interface Kepala {
    b: BarisPdf;
    tanggal: string;
    nominal: number;
    saldo: number;
    tengah: string;
    atas: { y: number; teks: string }[];
    bawah: { y: number; teks: string }[];
  }
  const [thAwal, blnAwal] = dari.split("-").map(Number);
  const kepala: Kepala[] = [];
  const lain: BarisPdf[] = [];
  for (const b of bagian) {
    if (abaikan(b)) continue;
    const m = b.teks.match(TANGGAL_BARIS);
    const angka = b.items.filter((p) => ANGKA.test(p.s.trim()) && p.x > xTeks + 100);
    const bulan = m && nomorBulan(m[2]);
    if (m && bulan && angka.length >= 2 && b.items[0].x < xTeks) {
      const nom = angka[angka.length - 2];
      const nilai = angkaID(nom.s.trim());
      const tahun = bulan < blnAwal ? thAwal + 1 : thAwal;
      const tengah = rapikan(b.items.filter((p) => p.x >= xTeks && p !== nom && p.x < nom.x).map((p) => p.s).join(" "));
      kepala.push({
        b,
        tanggal: isoTanggal(tahun, bulan, Number(m[1])),
        // Tanda dari posisi x; tanpa judul kolom, dari selisih saldo (di bawah).
        nominal: batasMasuk === null ? nilai : nom.x >= batasMasuk ? nilai : -nilai,
        saldo: angkaID(angka[angka.length - 1].s.trim()),
        tengah,
        atas: [],
        bawah: [],
      });
    } else lain.push(b);
  }
  if (batasMasuk === null) {
    let sebelum = saldoAwal;
    for (const k of kepala) {
      k.nominal = sen(k.saldo - sebelum);
      sebelum = k.saldo;
    }
  }
  // Baris teks lain milik baris transaksi terdekat di halaman yang sama.
  for (const b of lain) {
    let dekat: Kepala | null = null;
    for (const k of kepala) {
      if (k.b.halaman !== b.halaman) continue;
      if (!dekat || Math.abs(k.b.y - b.y) < Math.abs(dekat.b.y - b.y)) dekat = k;
    }
    if (!dekat || Math.abs(dekat.b.y - b.y) > 30) continue;
    (b.y > dekat.b.y ? dekat.atas : dekat.bawah).push({ y: b.y, teks: b.teks });
  }

  const hasil: BarisBank[] = kepala.map((k, urut) => {
    const atas = k.atas.sort((a, b) => b.y - a.y).map((x) => x.teks);
    const bawah = k.bawah.sort((a, b) => b.y - a.y).map((x) => x.teks);
    const akhir = bawah.at(-1);
    const jenis = akhir && JENIS_SEABANK.includes(akhir) ? bawah.pop()! : null;
    const rekLawan = [k.tengah, ...bawah].filter(Boolean).join(" ");
    const rek = rekLawan.match(/^(.+?) (\d{6,})$/);
    const nama = rapikan(atas.join(" ")) || null;
    return {
      tanggal: k.tanggal,
      jam: null,
      nominal: k.nominal,
      saldo: k.saldo,
      uraian: [nama, rek ? rek[1] : rekLawan].filter(Boolean).join(" · "),
      jenis,
      pihak: { nama, bank: rek ? rek[1] : rekLawan || null, nomor: rek ? rek[2] : null },
      catatan: null,
      ref: `sea:${nomorAkhir}:${k.tanggal}:${k.nominal}:${k.saldo}`,
      urut,
    };
  });

  return {
    format: "seabank",
    bank: "seabank",
    pemilik,
    rekening: [{ bank: "seabank", nomorAkhir, saku: null, utama: true, dari, sampai, saldoAwal, saldoAkhir, baris: hasil }],
    deposito,
  };
}
