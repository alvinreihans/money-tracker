/**
 * Diagnostik LOKAL impor rekening koran (SPEC-impor-rekening, Pengujian):
 * membaca PDF rekening koran sungguhan dari folder di LUAR repo dan hanya
 * mencetak angka ringkas — jumlah berkas, baris, hasil validasi saldo,
 * pasangan pindah kantong, baris bunga yang digabung. Isi baris (nama,
 * nomor rekening, nominal, merchant) tidak pernah dicetak atau disimpan, dan
 * tidak ada yang dikirim ke layanan mana pun.
 *
 * Pemakaian: npx tsx scripts/cek-rekening.mts <folder-atau-pdf> [...]
 */
import fs from "node:fs";
import path from "node:path";
import { bacaRekening } from "../src/lib/rekening/baca.ts";
import { NAMA_BANK, type HasilBaca } from "../src/lib/rekening/jenis.ts";
import { teksPdf } from "../src/lib/rekening/pdf.ts";
import { rencanakan, type KantongRencana } from "../src/lib/rekening/rencana.ts";

const masukan = process.argv.slice(2);
if (!masukan.length) {
  console.error("Pemakaian: npx tsx scripts/cek-rekening.mts <folder-atau-pdf> [...]");
  process.exit(1);
}
const berkas: string[] = [];
const telusuri = (p: string) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const n of fs.readdirSync(p)) telusuri(path.join(p, n));
  else if (/\.pdf$/i.test(p)) berkas.push(p);
};
masukan.forEach(telusuri);

interface Angka {
  berkas: number;
  format: Record<string, number>;
  rekening: number;
  baris: number;
  lolos: number;
  gagal: number;
  galat: Record<string, number>;
}
const perBank: Record<string, Angka> = {};
const bacaan: HasilBaca[] = [];
for (const f of berkas) {
  let hasil: HasilBaca;
  try {
    hasil = bacaRekening(await teksPdf(new Uint8Array(fs.readFileSync(f))));
  } catch (e) {
    const a = (perBank["(tidak terbaca)"] ??= { berkas: 0, format: {}, rekening: 0, baris: 0, lolos: 0, gagal: 0, galat: {} });
    a.berkas++;
    a.gagal++;
    // Pesan galat bisa menyebut tanggal/nominal; yang dicetak hanya jenisnya.
    const jenis = String((e as Error).message).replace(/\d[\d.,:-]*/g, "#").replace(/Rp #/g, "Rp #");
    a.galat[jenis] = (a.galat[jenis] ?? 0) + 1;
    continue;
  }
  bacaan.push(hasil);
  const a = (perBank[hasil.bank] ??= { berkas: 0, format: {}, rekening: 0, baris: 0, lolos: 0, gagal: 0, galat: {} });
  a.berkas++;
  a.format[hasil.format] = (a.format[hasil.format] ?? 0) + 1;
  a.rekening += hasil.rekening.length;
  a.baris += hasil.rekening.reduce((n, r) => n + r.baris.length, 0);
  a.lolos++;
}

console.log(`Berkas PDF: ${berkas.length}`);
for (const [bank, a] of Object.entries(perBank)) {
  console.log(`\n${bank}: ${a.berkas} berkas (${Object.entries(a.format).map(([k, v]) => `${k} ${v}`).join(", ") || "-"})`);
  console.log(`  rekening/kantong: ${a.rekening}, baris: ${a.baris}`);
  console.log(`  validasi saldo: ${a.lolos} lolos, ${a.gagal} gagal`);
  for (const [g, n] of Object.entries(a.galat)) console.log(`    ${n}× ${g}`);
}

// Rencana impor dengan kantong rekaan: tiap rekening utama punya kantong
// bernama banknya, bersaldo awal = saldo awal rekening koran paling awal
// (kantong Jago lain jadi simpanan, dibuat rencana), ditambah e-wallet
// ShopeePay, DANA, GoPay. Tidak ada transaksi lama.
if (bacaan.length) {
  const kantong: KantongRencana[] = ["ShopeePay", "DANA", "GoPay"].map((name, i) => ({ id: `e${i}`, name, kind: "ewallet" }));
  const cakupan = new Map<string, [string, string][]>();
  const idRek = new Map<string, string>();
  for (const h of bacaan)
    for (const r of [...h.rekening].sort((a, b) => a.dari.localeCompare(b.dari))) {
      if (!r.utama) continue;
      const k = `${r.bank}:${r.nomorAkhir}`;
      const ada = kantong.find((x) => x.id === idRek.get(k));
      if (!ada) {
        idRek.set(k, `k${idRek.size}`);
        kantong.push({ id: idRek.get(k)!, name: NAMA_BANK[r.bank], kind: "bank", nomor_akhir: r.nomorAkhir, saldo_awal: r.saldoAwal, saldo_per: r.dari });
      } else if (r.dari < ada.saldo_per!) Object.assign(ada, { saldo_awal: r.saldoAwal, saldo_per: r.dari });
      cakupan.set(idRek.get(k)!, [...(cakupan.get(idRek.get(k)!) ?? []), [r.dari, r.sampai]]);
    }
  const r = rencanakan({ bacaan, kantong, transaksi: [], kategori: null, sudahAda: new Set() });
  console.log(`\nRencana (semua berkas sekaligus, kantong rekaan, tanpa transaksi lama):`);
  console.log(`  baris unik: ${r.ringkas.baris} (dobel antar-berkas dilewati: ${r.ringkas.dobel})`);
  console.log(`  transaksi baru: ${r.ringkas.baru}, pindah kantong: ${r.ringkas.pindah} (pasangan dua sisi: ${r.ringkas.pasangan}, antar kantong Jago: ${r.ringkas.antarJago})`);
  console.log(`  bunga: ${r.ringkas.barisBunga} baris bunga/pajak → ${r.ringkas.bunga} transaksi bunga bulanan`);
  console.log(`  perlu dilengkapi: ${r.ringkas.perluDilengkapi}, biaya menempel ke transfer: ${r.ringkas.ikutan}`);
  console.log(`  per jenis: ${Object.entries(r.ringkas.perKategori).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const dipetakan = r.rekening.filter((x) => x.saldoAplikasi !== null);
  console.log(`  saldo akhir kantong = rekening koran: ${dipetakan.filter((x) => Math.abs(x.saldoAplikasi! - x.saldoBank) < 0.005).length} dari ${dipetakan.length} rekening/kantong`);

  // Mutu pasangan: pindah kantong satu sisi padahal rekening koran lawannya
  // ada di berkas ini dan periodenya mencakup tanggal itu.
  let satuSisi = 0;
  let lawanAda = 0;
  for (const t of r.sisip) {
    if (t.type !== "transfer" || (t.ref_bank && t.ref_bank_tujuan)) continue;
    satuSisi++;
    const lawan = t.ref_bank ? t.kantong_tujuan_id : t.kantong_id;
    if ((cakupan.get(lawan ?? "") ?? []).some(([a, b]) => t.transaction_date >= a && t.transaction_date <= b)) lawanAda++;
  }
  console.log(`  pindah kantong satu sisi: ${satuSisi}, di antaranya rekening lawan ada & periodenya mencakup: ${lawanAda}`);

  // Impor ulang: semua ref sudah tersimpan → tidak ada yang baru.
  const sudahAda = new Set(r.sisip.flatMap((t) => [t.ref_bank, t.ref_bank_tujuan].filter((x): x is string => Boolean(x))));
  const lama = r.sisip.map((t, i) => ({ ...t, id: `x${i}`, kantong_id: t.kantong_id, kantong_tujuan_id: t.kantong_tujuan_id }));
  const ulang = rencanakan({ bacaan, kantong, transaksi: lama, kategori: null, sudahAda });
  console.log(`  impor ulang semua berkas: ${ulang.sisip.length} transaksi baru, ${ulang.perbarui.length} diperbarui, ${ulang.ringkas.tercatat} baris sudah tercatat`);
}
