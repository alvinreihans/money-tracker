import { GalatRekening, type BarisBank, type BarisPdf, type HasilBaca, type Potongan, type RekeningBank } from "@/lib/rekening/jenis";
import { bersihkanMerchant, layananGopay } from "@/lib/rekening/merchant";
import { akhirBulanIso, angkaID, empatAkhir, isoTanggal, nomorBulan, rapikan, sen, tanggalTeks } from "@/lib/rekening/teks";

/**
 * Bank Jago, dua format:
 * - **bulanan** "Laporan Keuangan Bulanan": semua kantong (Kantong Utama,
 *   Dana Darurat, Deposito, kartu, …), tiap kantong satu bagian dengan
 *   saldo sebelumnya & akhirnya; bulan baris dalam bahasa Inggris.
 * - **riwayat** "Pockets Transactions History": Kantong Utama saja, bisa
 *   bertahun-tahun; bulan bahasa Indonesia (Mei, Agt, Okt, Des).
 * Baris: tanggal, lalu jam `HH.MM` di baris teks berikutnya; nominal bertanda
 * (`+7.813.240,00`, `-60.000`), saldo, dan `ID#`. Pengenal baris (`ref`) dari
 * kantong, tanggal, jam, nominal & saldo sesudahnya — sama di kedua format,
 * jadi baris yang sama tidak pernah terimpor dua kali.
 */

export const cocokJagoBulanan = (baris: BarisPdf[]) => baris.some((b) => /^Laporan Keuangan Bulanan\b/.test(b.teks)) && baris.some((b) => /jago\.com/i.test(b.teks));
export const cocokJagoRiwayat = (baris: BarisPdf[]) => baris.some((b) => /^Pockets Transactions History\b/.test(b.teks)) && baris.some((b) => /jago\.com/i.test(b.teks));

const NOMINAL = /^[+-]\d{1,3}(\.\d{3})*(,\d{1,2})?$/;
const SALDO = /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$/;
const TANGGAL = /^\d{2} [A-Za-z]{3} \d{4}$/;

/** Baris kaki/kepala halaman & keterangan yang bukan transaksi. */
const bukanTransaksi = (t: string) =>
  /^(PT Bank Jago|www\.jago|merupakan peserta|Laporan Keuangan Bulanan|Pockets Transactions History|INFO PENTING|Info Penting|Dokumen ini|ditampilkan berdasarkan|transaksi dapat|\* )/.test(t) ||
  /Halaman \d+ dari \d+/.test(t);

interface Kolom {
  tanggal: number;
  sumber: number;
  rincian: number;
  catatan: number;
}

const kolomDari = (b: BarisPdf): Kolom => {
  const x = (awal: string) => b.items.find((p) => p.s.startsWith(awal))?.x ?? 0;
  return { tanggal: x("Tanggal"), sumber: x("Sumber"), rincian: x("Rincian"), catatan: x("Catatan") };
};

interface Mentah {
  tanggal: string;
  jam: string | null;
  sumber: string[];
  rincian: string[];
  catatan: string[];
  id: string | null;
  nominal: number | null;
  saldo: number | null;
}

/** Satu potongan teks baris transaksi → kolomnya. */
function isiKolom(r: Mentah, p: Potongan, k: Kolom, ambang: number) {
  const s = p.s.trim();
  if (!s) return;
  if (p.x >= ambang && NOMINAL.test(s) && r.nominal === null) return void (r.nominal = angkaID(s));
  if (p.x >= ambang && SALDO.test(s) && r.nominal !== null && r.saldo === null) return void (r.saldo = angkaID(s));
  if (/^ID# /.test(s)) return void (r.id = s.slice(4).trim());
  if (p.x < k.sumber - 2) {
    if (/^\d{2}\.\d{2}$/.test(s)) r.jam = s.replace(".", ":");
    return;
  }
  if (p.x < k.rincian - 2) r.sumber.push(s);
  else if (p.x < k.catatan - 2) r.rincian.push(s);
  else r.catatan.push(s);
}

const KANTONG_JAGO = /^(Tambah Uang Kantong|Tarik Uang Kantong|Pindah uang antar Kantong)$/i;

/** Baris mentah → baris seragam. */
function jadiBaris(r: Mentah, urut: number, nomorAkhir: string): BarisBank {
  const rincian = rapikan(r.rincian.join(" "));
  const sumber = r.sumber.map((s) => s.trim());
  const antarKantong = KANTONG_JAGO.test(rincian) || sumber.some((s) => /^Pindah uang antar Kantong$/i.test(s));
  // Rekening lawan: baris "Bank 1234567890" (tanpa kata lain sesudah nomornya).
  // Nomor saja (mis. nomor kantong Deposito) juga dianggap nomor lawan.
  const iRek = sumber.findIndex((s) => /^([A-Za-z][\w .-]*? )?\d{6,}$/.test(s));
  const rek = iRek >= 0 ? sumber[iRek].match(/^(?:(.+) )?(\d{6,})$/) : null;
  const nama = rapikan(sumber.filter((s, i) => i !== iRek && !/^Pindah uang antar Kantong$/i.test(s)).join(" ")) || null;
  const catatan = rapikan(r.catatan.join(" ")) || null;
  // Kode referensi tidak jadi nama pihak (SPEC-kantong-sendiri C-2); tetap ada di uraian
  // (keterangan). Jago Pay ke GoPay: "GoPay · GO-RIDE".
  let pihak = antarKantong ? nama : bersihkanMerchant(nama).nama;
  const layanan = !antarKantong && /\b(go\s*-?\s*pay|gojek)\b/i.test(nama ?? "") ? layananGopay([nama, rincian, catatan].join(" ")) : null;
  if (layanan) pihak = `GoPay · ${layanan}`;
  // Bank & 4 digit akhir rekening lawan ikut di uraian, supaya penautan ulang
  // (cariCalonPindah, A-3) masih mengenalinya dari keterangan transaksi.
  const rekLawan = rek && rek[1] && !antarKantong ? `${rek[1]} …${rek[2].slice(-4)}` : null;
  return {
    tanggal: r.tanggal,
    jam: r.jam,
    nominal: r.nominal!,
    saldo: r.saldo,
    uraian: [nama, rincian, rekLawan].filter(Boolean).join(" · "),
    jenis: antarKantong ? "Pindah uang antar Kantong" : rincian || null,
    pihak: { nama: pihak, bank: antarKantong ? "Jago" : (rek?.[1] ?? null), nomor: rek?.[2] ?? null },
    catatan,
    // Bukan ID#: transfer BI-Fast punya ID# berbeda di laporan bulanan dan
    // riwayat. Saldo sesudah baris sama di kedua format.
    ref: r.saldo !== null ? `jago:${nomorAkhir}:${r.tanggal}T${r.jam ?? ""}:${r.nominal}:${r.saldo}` : `jago:${r.id}`,
    urut,
  };
}

/** Baris-baris transaksi sesudah judul kolom, sampai `berhenti` bernilai true. */
function bacaTransaksi(baris: BarisPdf[], mulai: number, berhenti: (b: BarisPdf) => boolean, nomorAkhir: string): { hasil: BarisBank[]; akhir: number } {
  let k: Kolom | null = null;
  let ambang = Infinity;
  const mentah: Mentah[] = [];
  let i = mulai;
  for (; i < baris.length; i++) {
    const b = baris[i];
    if (berhenti(b)) break;
    if (/^Tanggal & Waktu/.test(b.teks)) {
      k = kolomDari(b);
      // Nominal & saldo selalu di kanan kolom Catatan.
      ambang = k.catatan + 60;
      continue;
    }
    if (!k || bukanTransaksi(b.teks)) continue;
    const pertama = b.items[0];
    if (pertama.x < k.sumber - 2 && TANGGAL.test(pertama.s.trim())) {
      const tanggal = tanggalTeks(pertama.s.trim());
      if (!tanggal) continue;
      const r: Mentah = { tanggal, jam: null, sumber: [], rincian: [], catatan: [], id: null, nominal: null, saldo: null };
      for (const p of b.items.slice(1)) isiKolom(r, p, k, ambang);
      mentah.push(r);
      continue;
    }
    // Judul bulan di riwayat ("Mei 2022").
    if (b.items.length === 1 && /^[A-Za-z]+ \d{4}$/.test(b.teks) && nomorBulan(b.teks.split(" ")[0])) continue;
    const r = mentah.at(-1);
    if (r) for (const p of b.items) isiKolom(r, p, k, ambang);
  }
  const rusak = mentah.find((r) => r.nominal === null || !r.id);
  if (rusak) throw new GalatRekening(`Baris Jago tanggal ${rusak.tanggal} tidak terbaca lengkap.`);
  return { hasil: mentah.map((r, i) => jadiBaris(r, i, nomorAkhir)), akhir: i };
}

/** Teks sisi kiri (kolom keterangan) & kanan (angka ringkasan) satu baris. */
const kiri = (b: BarisPdf, batas: number) => rapikan(b.items.filter((p) => p.x < batas).map((p) => p.s).join(" "));
const kanan = (b: BarisPdf, batas: number) => rapikan(b.items.filter((p) => p.x >= batas).map((p) => p.s).join(" "));

export function bacaJagoBulanan(baris: BarisPdf[]): HasilBaca {
  const judul = baris.find((b) => /^Laporan Keuangan Bulanan\b/.test(b.teks))!;
  const m = judul.teks.match(/Laporan Keuangan Bulanan ([A-Za-z]+) (\d{4})/);
  const bulan = m && nomorBulan(m[1]);
  if (!m || !bulan) throw new GalatRekening("Periode laporan Jago tidak terbaca.");
  const dari = isoTanggal(Number(m[2]), bulan, 1);
  const sampai = akhirBulanIso(dari);
  const pemilikBaris = baris.find((b) => /^.+ \/ \d{6,}$/.test(b.teks));
  const pemilik = pemilikBaris?.teks.replace(/ \/ \d+$/, "") ?? null;
  const nomorUtama = pemilikBaris?.teks.match(/(\d{6,})$/)?.[1] ?? null;

  // Batas kiri/kanan kepala bagian kantong: posisi "Saldo Sebelumnya".
  const batas = baris.flatMap((b) => b.items).find((p) => p.s.startsWith("Saldo Sebelumnya") && p.x > 200)?.x ?? 280;

  const rekening: RekeningBank[] = [];
  let calon: { nama: string | null; awal: number | null } = { nama: null, awal: null };
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i];
    const ka = kanan(b, batas - 5);
    const ki = kiri(b, batas - 5);
    const awal = ka.match(/^Saldo Sebelumnya ([-+]?[\d.,]+)$/);
    if (awal) {
      calon = { nama: ki || calon.nama, awal: angkaID(awal[1]) };
      continue;
    }
    const id = ki.match(/^ID Kantong (\d+)/);
    if (!id) {
      if (calon.awal !== null && ki && !ka && !/^(Total|Akun Aktif)/.test(ki)) calon.nama = ki;
      continue;
    }
    if (calon.awal === null || !calon.nama) throw new GalatRekening("Bagian kantong Jago tidak terbaca.");
    // Saldo akhir: di baris "Akun Aktif, mulai … Saldo Akhir x" sesudahnya.
    let saldoAkhir: number | null = null;
    let j = i + 1;
    for (; j < Math.min(baris.length, i + 6); j++) {
      const t = kanan(baris[j], batas - 5).match(/Saldo Akhir ([-+]?[\d.,]+)$/);
      if (t) {
        saldoAkhir = angkaID(t[1]);
        break;
      }
    }
    if (saldoAkhir === null) throw new GalatRekening("Saldo akhir kantong Jago tidak terbaca.");
    const { hasil, akhir } = bacaTransaksi(baris, j + 1, (x) => /^Saldo Sebelumnya [-+]?[\d.,]+$/.test(kanan(x, batas - 5)), empatAkhir(id[1])!);
    rekening.push({
      bank: "jago",
      nomorAkhir: empatAkhir(id[1])!,
      saku: calon.nama,
      utama: id[1] === nomorUtama || /^Kantong Utama$/i.test(calon.nama),
      dari,
      sampai,
      saldoAwal: calon.awal,
      saldoAkhir,
      baris: hasil,
    });
    calon = { nama: null, awal: null };
    i = akhir - 1;
  }
  if (!rekening.length) throw new GalatRekening("Kantong di laporan Jago tidak terbaca.");
  return { format: "jagoBulanan", bank: "jago", pemilik, rekening, deposito: [] };
}

export function bacaJagoRiwayat(baris: BarisPdf[]): HasilBaca {
  const iJudul = baris.findIndex((b) => /^Pockets Transactions History\b/.test(b.teks));
  const iKantong = baris.findIndex((b) => /^.+ \d{6,}$/.test(kiri(b, 300)) && b.items.length <= 3);
  const kantong = iKantong >= 0 ? kiri(baris[iKantong], 300).match(/^(.+) (\d{6,})$/) : null;
  if (!kantong) throw new GalatRekening("Nomor kantong Jago tidak terbaca.");
  const pemilik = iKantong - 1 > iJudul ? kiri(baris[iKantong - 1], 300) || null : null;
  const per = baris.map((b) => kiri(b, 300).match(/^(\d{2} [A-Za-z]{3} \d{4}) - (\d{2} [A-Za-z]{3} \d{4})$/)).find(Boolean);
  const dari = per && tanggalTeks(per[1]);
  const sampai = per && tanggalTeks(per[2]);
  if (!dari || !sampai) throw new GalatRekening("Periode riwayat Jago tidak terbaca.");
  const terbaru = baris.map((b) => b.teks.match(/IDR (-?[\d.,]+)$/)).find(Boolean);
  if (!terbaru) throw new GalatRekening("Saldo terbaru Jago tidak terbaca.");
  const saldoAkhir = angkaID(terbaru[1]);

  const { hasil } = bacaTransaksi(baris, iKantong + 1, () => false, empatAkhir(kantong[2])!);
  // Saldo awal periode: sebelum baris pertama.
  const pertama = hasil[0];
  const saldoAwal = pertama && pertama.saldo !== null ? sen(pertama.saldo - pertama.nominal) : saldoAkhir;
  return {
    format: "jagoRiwayat",
    bank: "jago",
    pemilik,
    rekening: [{ bank: "jago", nomorAkhir: empatAkhir(kantong[2])!, saku: kantong[1], utama: /^Kantong Utama$/i.test(kantong[1]), dari, sampai, saldoAwal, saldoAkhir, baris: hasil }],
    deposito: [],
  };
}
