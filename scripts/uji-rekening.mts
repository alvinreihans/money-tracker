/**
 * Uji impor rekening koran (SPEC-impor-rekening): parser SeaBank, Jago
 * bulanan & riwayat, BRI terhadap potongan teks BUATAN yang meniru tata letak
 * aslinya (posisi x, baris berlapis, nama bulan, format angka) — bukan data
 * user. Validasi saldo, pengenal baris, aturan kategori, penggabungan bunga,
 * pasangan pindah kantong, "sudah tercatat", impor ulang, dan saldo.
 *
 * Pemakaian: npm run uji:rekening
 */
import assert from "node:assert/strict";
import { bacaRekening, cekSaldo } from "../src/lib/rekening/baca.ts";
import { GalatRekening, PESAN_BANK_LAIN, type BarisPdf } from "../src/lib/rekening/jenis.ts";
import { golongkan, rencanakan, ringkasRupiah, samaPemilik, type DepositoRencana, type KantongRencana, type MasukanRencana, type PeriodeRencana, type TransaksiLama } from "../src/lib/rekening/rencana.ts";
import type { HasilBaca } from "../src/lib/rekening/jenis.ts";
import { angkaID, angkaUS, susunBaris, tanggalTeks } from "../src/lib/rekening/teks.ts";
import { pihakBri } from "../src/lib/rekening/bri.ts";
import { bri as briContoh, Halaman, jagoBulanan, jagoRiwayat, seabank as seabankContoh, seabankBulan } from "./contoh-rekening.mjs";
import { hitungSaldo, type Kantong } from "../src/lib/kantong.ts";
import type { Rencana } from "../src/lib/rekening/rencana.ts";

const pdf = (...hal: { items: { x: number; y: number; s: string }[] }[]): BarisPdf[] => susunBaris(hal);
const seabank = (akhir?: string) => pdf(...seabankContoh(akhir));
const bri = (akhir?: string) => pdf(...briContoh(akhir));

/** fmtIDR memakai spasi tak terputus. */
const sp = (t: string | null | undefined) => t?.replace(/ /g, " ") ?? t;

// ------------------------------------------------------------ teks dasar

assert.equal(angkaID("1.234.567"), 1234567);
assert.equal(angkaID("+7.813.240,00"), 7813240);
assert.equal(angkaID("-60.000"), -60000);
assert.equal(angkaID("0,67"), 0.67);
assert.equal(angkaUS("6,143,500.00"), 6143500);
assert.equal(tanggalTeks("04 Mei 2022"), "2022-05-04");
assert.equal(tanggalTeks("01 Agt 2026"), "2026-08-01");
assert.equal(tanggalTeks("02 Sep 2026"), "2026-09-02");
assert.equal(tanggalTeks("15 OCT 2026"), "2026-10-15");
assert.equal(tanggalTeks("03 Des 2022"), "2022-12-03");
assert.equal(tanggalTeks("31 May 2026"), "2026-05-31");

const sea = bacaRekening(seabank());
assert.equal(sea.format, "seabank");
assert.equal(sea.pemilik, "BUDI SANTOSO");
const rs = sea.rekening[0];
assert.deepEqual([rs.nomorAkhir, rs.dari, rs.sampai, rs.saldoAwal, rs.saldoAkhir, rs.baris.length], ["1234", "2026-09-01", "2026-09-30", 3_000_000, 911_040, 11]);
assert.deepEqual(
  rs.baris.map((b) => b.nominal),
  [200, -24_000, -40, -100_000, 50_000, -30_000, -400, 180, 15_000, -2_000_000, 100],
  "keluar/masuk dari posisi x",
);
assert.deepEqual(rs.baris.map((b) => b.jenis), ["Interest", "Payment", "Tax", "Transfer", "Transfer", "Top Up - eWallet", "Top Up - eWallet", "Interest", "Payment", "Time Deposit", "Interest"]);
assert.equal(rs.baris[2].pihak?.nama, "Savings Withholding Tax", "pihak dua baris");
assert.deepEqual(rs.baris[3].pihak, { nama: "BUDI SANTOSO", bank: "JAGO", nomor: "102000005678" }, "rekening lawan di baris tanggal");
assert.deepEqual(rs.baris[4].pihak, { nama: "ANI WIJAYA", bank: "SeaBank", nomor: "901000009999" });
assert.equal(rs.baris[0].jam, null, "SeaBank tanpa jam");
assert.equal(rs.baris[1].ref, "sea:1234:2026-09-01:-24000:2976200");
assert.deepEqual(sea.deposito, [{ nama: "Deposito Contoh", kode: "TD000000001-1", tenor: 6, satuan: "bulan", jatuhTempo: "2027-01-06", bunga: 6, pokok: 2_000_000 }]);

// Validasi saldo: saldo akhir yang tidak cocok → ditolak dengan pesan.
assert.throws(() => bacaRekening(seabank("911.041")), (e: unknown) => e instanceof GalatRekening && /tidak bisa dicocokkan/.test((e as Error).message) && /Tidak ada yang diimpor/.test((e as Error).message));
assert.match(cekSaldo({ ...rs, baris: rs.baris.map((b, i) => (i === 4 ? { ...b, saldo: 1 } : b)) }) ?? "", /saldo sesudah baris 2026-09-02/);

// Bank lain (K5).
assert.throws(
  () => bacaRekening(pdf(new Halaman().baris(700, [40, "REKENING KORAN"]).baris(680, [40, "Bank Contoh Lain"]))),
  (e: unknown) => e instanceof GalatRekening && (e as Error).message === PESAN_BANK_LAIN,
);
assert.equal(PESAN_BANK_LAIN, "Rekening koran dari bank ini belum bisa dibaca.");

const jb = bacaRekening(pdf(...jagoBulanan()));
assert.equal(jb.format, "jagoBulanan");
assert.equal(jb.pemilik, "BUDI SANTOSO");
assert.deepEqual(
  jb.rekening.map((r) => [r.saku, r.nomorAkhir, r.utama, r.saldoAwal, r.saldoAkhir, r.baris.length, r.dari, r.sampai]),
  [
    ["Kantong Utama", "5678", true, 1000, 176_008, 6, "2026-09-01", "2026-09-30"],
    ["Dana Darurat", "3928", false, 0, 400_800, 3, "2026-09-01", "2026-09-30"],
    ["Kantong Kosong", "8177", false, 0, 0, 0, "2026-09-01", "2026-09-30"],
  ],
);
const ju = jb.rekening[0].baris;
assert.deepEqual(ju.map((b) => b.jam), ["08:12", "08:13", "09:30", "12:00", "04:59", "04:59"]);
assert.deepEqual(ju.map((b) => b.nominal), [500_000, -400_000, 100_000, -25_000, 10, -2]);
assert.deepEqual(ju[0].pihak, { nama: "BUDI SANTOSO", bank: "ShopeePay", nomor: "6280000001234" });
assert.equal(ju[1].jenis, "Pindah uang antar Kantong");
assert.deepEqual(ju[1].pihak, { nama: "Dana Darurat", bank: "Jago", nomor: null });
assert.equal(ju[3].catatan, "Kopi");
assert.equal(jb.rekening[1].baris[0].jenis, "Pindah uang antar Kantong", "rincian terbungkus dua baris");
assert.equal(ju[0].ref, "jago:5678:2026-09-02T08:12:500000:501000");

const jr = bacaRekening(pdf(...jagoRiwayat()));
assert.equal(jr.format, "jagoRiwayat");
const rr = jr.rekening[0];
assert.deepEqual([rr.saku, rr.nomorAkhir, rr.utama, rr.dari, rr.sampai, rr.saldoAwal, rr.saldoAkhir, rr.baris.length], ["Kantong Utama", "5678", true, "2026-08-01", "2026-09-30", 0, 176_008, 7]);
assert.equal(rr.baris[0].tanggal, "2026-08-15", "bulan Indonesia (Agt)");
assert.equal(rr.baris[2].nominal, -400_000, "debit tanpa desimal");
assert.deepEqual(
  rr.baris.slice(1).map((b) => b.ref),
  ju.map((b) => b.ref),
  "pengenal sama dengan laporan bulanan walau ID# berbeda",
);

const br = bacaRekening(bri());
const rb = br.rekening[0];
assert.equal(br.format, "bri");
assert.equal(br.pemilik, "BUDI SANTOSO");
assert.deepEqual([rb.nomorAkhir, rb.dari, rb.sampai, rb.saldoAwal, rb.saldoAkhir, rb.baris.length], ["4321", "2026-09-01", "2026-09-30", 1_000_000, 730_500, 5]);
assert.deepEqual(rb.baris.map((b) => b.nominal), [-200_000, -2_500, -50_000, -5_000, -12_000]);
assert.equal(rb.baris[0].uraian, "Transfer BI-Fast ke Bank Lain - 1230009876 - Budi Santoso", "uraian dua baris");
assert.equal(rb.baris[0].jam, "09:00:00");
assert.equal(rb.baris[1].ref, "bri:4321:2026-09-01T09:00:00:-2500:797500");
assert.throws(() => bacaRekening(bri("730,501.00")), GalatRekening);
assert.deepEqual(pihakBri("Transfer BI-Fast dari PT BANK CONTOH - 1234567890 - Ani Wijaya"), { nama: "Ani Wijaya", bank: "PT BANK CONTOH", nomor: "1234567890" });
assert.deepEqual(pihakBri("Pembayaran BRIVA ke PT Contoh Jaya - 123456789 - Budi via BRImo"), { nama: "PT Contoh Jaya", bank: null, nomor: null });

// ------------------------------------------------------------ aturan

assert.equal(samaPemilik("BUDX SAXXXXX", "BUDI SANTOSO PUTRA"), true, "huruf tersamar");
assert.equal(samaPemilik("BUDI SANTOSO P", "BUDI SANTOSO PUTRA"), true, "kata terakhir terpotong");
assert.equal(samaPemilik("Budi Santoso Putra", "BUDI SANTOSO PUTRA"), true);
assert.equal(samaPemilik("DNID SXXX WXXX", "BUDI SANTOSO PUTRA"), false);
assert.equal(samaPemilik("BUDI", "BUDI SANTOSO"), false, "satu kata terlalu lemah");
assert.equal(golongkan(rs.baris[0], "seabank"), "bunga");
assert.equal(golongkan(rs.baris[2], "seabank"), "pajak");
assert.equal(golongkan(rs.baris[6], "seabank"), "biaya", "Fee di bawah top up");
assert.equal(golongkan(rs.baris[8], "seabank"), "refund");
assert.equal(golongkan(rs.baris[9], "seabank"), "deposito");
assert.equal(golongkan(ju[1], "jago"), "antarJago");
assert.equal(golongkan(ju[3], "jago"), "bayar");
assert.equal(golongkan(rb.baris[3], "bri"), "biaya");
assert.equal(golongkan(rb.baris[4], "bri"), "bayar");
assert.equal(ringkasRupiah(2_000_000), "Rp 2 jt");
assert.equal(ringkasRupiah(1_500_000), "Rp 1,5 jt");

// ------------------------------------------------------------ rencana

const KANTONG: KantongRencana[] = [
  { id: "sea", name: "SeaBank", kind: "bank", nomor_akhir: "1234", saldo_awal: 3_000_000, saldo_per: "2026-09-01", saldo_sejak: "2026-09-01T00:00:00+07:00" },
  { id: "jago", name: "Jago", kind: "bank", nomor_akhir: "5678", saldo_awal: 1000, saldo_per: "2026-09-01", saldo_sejak: "2026-09-01T00:00:00+07:00" },
  { id: "bri", name: "BRI", kind: "bank", nomor_akhir: "4321", saldo_awal: 0, saldo_per: "2026-01-01", saldo_sejak: "2026-01-01T00:00:00+07:00" },
  { id: "spay", name: "ShopeePay", kind: "ewallet", saldo_awal: 0, saldo_per: "2026-01-01" },
  { id: "tunai", name: "Tunai", kind: "cash", saldo_awal: 0, saldo_per: "2026-01-01" },
  { id: "bca", name: "BCA", kind: "bank", nomor_akhir: "9876", saldo_awal: 0, saldo_per: "2026-10-01" },
];
const dasar = (m: Partial<MasukanRencana> = {}): MasukanRencana => ({ bacaan: [sea, jb, br], kantong: KANTONG, transaksi: [], kategori: null, sudahAda: new Set(), ...m });

{
  const r = rencanakan(dasar());
  assert.deepEqual(r.belumDipetakan, []);
  const cari = (ref: string) => r.sisip.find((t) => t.ref_bank === ref || t.ref_bank_tujuan === ref)!;

  // Pindah kantong dua sisi: SeaBank → Jago (4 digit akhir lawan = nomor kantong).
  const ke = cari(rs.baris[3].ref);
  assert.deepEqual([ke.type, ke.kantong_id, ke.kantong_tujuan_id, ke.amount, ke.ref_bank, ke.ref_bank_tujuan], ["transfer", "sea", "jago", 100_000, rs.baris[3].ref, ju[2].ref]);
  assert.equal(ke.waktu, "09:30", "jam dari sisi yang punya jam");
  // Dari e-wallet sendiri (nama pihak = pemilik, bank ShopeePay): satu sisi.
  const dariSpay = cari(ju[0].ref);
  assert.deepEqual([dariSpay.type, dariSpay.kantong_id, dariSpay.kantong_tujuan_id, dariSpay.ref_bank, dariSpay.ref_bank_tujuan], ["transfer", "spay", "jago", null, ju[0].ref]);
  // Antar kantong Jago (K1): simpanan di dalam Jago, dibuat; kantong kosong tidak.
  assert.deepEqual(
    r.kantongBaru.map((k) => [k.name, k.kind, k.induk_id, k.macam_simpanan, k.saldo_awal, k.saldo_sejak, k.nomor_akhir]),
    [["Dana Darurat", "simpanan", "jago", "tabungan", 0, "2026-09-01T00:00:00+07:00", "3928"]],
  );
  const pocket = cari(ju[1].ref);
  assert.deepEqual([pocket.kantong_id, pocket.kantong_tujuan_id, pocket.ref_bank_tujuan], ["jago", "baru:jago:3928", jb.rekening[1].baris[0].ref]);
  // BRI → BCA (rekening koran BCA tidak diunggah) satu sisi, biaya BI-Fast menempel sebagai ikutan.
  const bifast = cari(rb.baris[0].ref);
  assert.deepEqual([bifast.type, bifast.kantong_id, bifast.kantong_tujuan_id, bifast.ref_bank_tujuan], ["transfer", "bri", "bca", null]);
  const biaya = cari(rb.baris[1].ref);
  assert.deepEqual([biaya.type, biaya.category, biaya.induk, biaya.amount], ["expense", "fees", bifast.kunci, 2500]);
  // Top up ShopeePay dari BRI (nama tersamar = pemilik).
  assert.deepEqual([cari(rb.baris[2].ref).type, cari(rb.baris[2].ref).kantong_tujuan_id], ["transfer", "spay"]);
  // Aturan kategori.
  const t = (ref: string) => {
    const x = cari(ref);
    return [x.type, x.category, x.merchant, x.perlu_dilengkapi];
  };
  assert.deepEqual(t(rs.baris[1].ref), ["expense", "other", "ShopeePay", true], "pembayaran e-wallet: Lainnya, perlu dilengkapi (K3)");
  assert.deepEqual(t(rs.baris[4].ref), ["income", "other", "ANI WIJAYA", true], "transfer dari orang");
  assert.deepEqual(t(rs.baris[5].ref), ["expense", "other", "DNID SXXX WXXX", true], "top up e-wallet orang lain");
  assert.deepEqual(t(rs.baris[6].ref), ["expense", "fees", "SeaBank", false], "fee tanpa transfer induk: berdiri sendiri");
  assert.deepEqual(t(rs.baris[8].ref), ["income", "refund", "Shopee", false]);
  assert.deepEqual(t(rs.baris[9].ref), ["expense", "other", "Fund Placement", true], "deposito tanpa simpanan");
  assert.deepEqual(t(rb.baris[3].ref), ["expense", "fees", "BRI", false]);
  assert.deepEqual(t(rb.baris[4].ref), ["expense", "other", "QRIS", true]);
  assert.deepEqual(t(ju[3].ref), ["expense", "other", "Toko Kopi Contoh", true]);
  // Bunga: satu pemasukan bersih per bulan per rekening (K2), pajak di keterangan.
  const bunga = r.sisip.filter((x) => x.category === "investment");
  assert.deepEqual(
    bunga.map((x) => [x.kantong_id, x.amount, sp(x.description), x.ref_bank, x.transaction_date, x.waktu]),
    [
      ["sea", 440, "Bunga Sep 2026 (3 hari) · kotor Rp 480, pajak Rp 40", "seabank:1234:bunga:2026-09", "2026-09-30", null],
      ["jago", 8, "Bunga Sep 2026 · kotor Rp 10, pajak Rp 2", "jago:5678:bunga:2026-09", "2026-09-28", "04:59"],
      ["baru:jago:3928", 800, "Bunga Sep 2026 · kotor Rp 1.000, pajak Rp 200", "jago:3928:bunga:2026-09", "2026-09-28", "06:24"],
    ],
  );
  const rsea = r.rekening.find((x) => x.kunci === "seabank:1234")!;
  assert.deepEqual([rsea.baris, rsea.barisBunga, rsea.bunga, rsea.pindah, rsea.baru, rsea.perluDilengkapi], [11, 4, 1, 1, 6, 4]);
  // Deposito SeaBank ditawarkan (§8).
  assert.equal(r.tawaranDeposito.length, 1);
  assert.equal(r.tawaranDeposito[0].teks, "Buat deposito Contoh 6 bulan, 6%, Rp 2 jt?");
  assert.deepEqual([r.tawaranDeposito[0].mulai, r.tawaranDeposito[0].pajak_persen], ["2026-07-06", 0]);
  // Saldo (§7): SeaBank & Jago cocok; BRI (saldo awal asal-asalan) ditawari disamakan (K4).
  assert.deepEqual(r.rekening.map((x) => [x.kunci, x.saldoBank, x.saldoAplikasi, Boolean(x.samakan)]), [
    ["seabank:1234", 911_040, 911_040, false],
    ["jago:5678", 176_008, 176_008, false],
    ["jago:3928", 400_800, 400_800, false],
    ["jago:8177", 0, null, false],
    ["bri:4321", 730_500, -269_500, true],
  ]);
  const samakan = r.rekening.find((x) => x.kunci === "bri:4321")!.samakan!;
  assert.deepEqual([samakan.saldo_awal, samakan.saldo_sejak], [1_000_000, "2026-09-01T00:00:00+07:00"]);
  assert.match(sp(samakan.teks)!, /^Samakan saldo awal BRI supaya akhir September( 2026)? = Rp 730\.500$/);
  assert.deepEqual(r.saldo, [], "belum diterima");
  assert.deepEqual(r.nomorAkhir, []);

  // Diterima: deposito dibuat & penempatan jadi pindah kantong; saldo BRI disamakan.
  const r2 = rencanakan(dasar({ pilihan: { deposito: [r.tawaranDeposito[0].kunci], samakan: ["bri:4321"] } }));
  const fp = r2.sisip.find((x) => x.ref_bank === rs.baris[9].ref)!;
  assert.deepEqual([fp.type, fp.kantong_id, fp.kantong_tujuan_id], ["transfer", "sea", r.tawaranDeposito[0].kunci]);
  assert.equal(r2.depositoBaru.length, 1);
  assert.deepEqual(r2.saldo, [{ kantong_id: "bri", saldo_awal: 1_000_000, saldo_sejak: "2026-09-01T00:00:00+07:00" }]);
  assert.equal(r2.rekening.find((x) => x.kunci === "bri:4321")!.saldoAplikasi, 730_500);

  // Impor ulang semua berkas: tidak ada yang baru (ref tersimpan), bunga tidak dobel.
  const sudahAda = new Set(r.sisip.flatMap((x) => [x.ref_bank, x.ref_bank_tujuan].filter((v): v is string => Boolean(v))));
  const lama: TransaksiLama[] = r.sisip.map((x, i) => ({ ...x, id: `x${i}` }));
  const ulang = rencanakan(dasar({ transaksi: lama, sudahAda }));
  assert.equal(ulang.sisip.length, 0);
  assert.equal(ulang.perbarui.length, 0);
  assert.equal(ulang.ringkas.tercatat, ulang.ringkas.baris);
}

// Riwayat & bulanan tumpang tindih di satu unggahan: baris yang sama hanya sekali.
{
  const r = rencanakan(dasar({ bacaan: [jr, jb] }));
  assert.equal(r.ringkas.dobel, 6);
  assert.equal(r.rekening.find((x) => x.kunci === "jago:5678")!.berkas, 2);
  assert.equal(r.sisip.filter((x) => x.ref_bank?.startsWith("jago:5678:2026-09-05")).length, 1);
}

// Sudah tercatat (§5): transaksi lama dipertahankan & ditautkan; yang ragu dipilih.
{
  const minimarket: TransaksiLama = { id: "a1", amount: 24_000, type: "expense", kantong_id: "sea", kantong_tujuan_id: null, transaction_date: "2026-09-01", waktu: "08:40", merchant: "Minimarket" };
  const r = rencanakan(dasar({ bacaan: [sea], transaksi: [minimarket] }));
  assert.deepEqual(r.tautkan, [{ id: "a1", ref_bank: rs.baris[1].ref }]);
  assert.equal(r.sisip.some((x) => x.ref_bank === rs.baris[1].ref), false);
  assert.equal(r.rekening[0].tercatat, 1);
  assert.equal(r.ragu.length, 0);
  // Tanggal +1 hari juga cocok; kantong lain tidak.
  assert.equal(rencanakan(dasar({ bacaan: [sea], transaksi: [{ ...minimarket, transaction_date: "2026-09-02" }] })).tautkan.length, 1);
  assert.equal(rencanakan(dasar({ bacaan: [sea], transaksi: [{ ...minimarket, kantong_id: "bri" }] })).tautkan.length, 0);
  // Dua kandidat di hari yang sama untuk satu baris tanpa jam: ragu, bawaan yang jamnya lebih awal.
  const dua = [minimarket, { ...minimarket, id: "a2", waktu: "07:00", merchant: "Warung" }];
  const rg = rencanakan(dasar({ bacaan: [sea], transaksi: dua }));
  assert.equal(rg.ragu.length, 1);
  assert.deepEqual(rg.ragu[0].kandidat.map((k) => k.id), ["a2", "a1"]);
  assert.deepEqual(rg.tautkan, [{ id: "a2", ref_bank: rs.baris[1].ref }]);
  const pilihA1 = rencanakan(dasar({ bacaan: [sea], transaksi: dua, pilihan: { ragu: { [rs.baris[1].ref]: "a1" } } }));
  assert.deepEqual(pilihA1.tautkan, [{ id: "a1", ref_bank: rs.baris[1].ref }]);
  const pilihBaru = rencanakan(dasar({ bacaan: [sea], transaksi: dua, pilihan: { ragu: { [rs.baris[1].ref]: "baru" } } }));
  assert.equal(pilihBaru.tautkan.length, 0);
  assert.equal(pilihBaru.sisip.filter((x) => x.ref_bank === rs.baris[1].ref).length, 1);
}

// Sisi kedua diimpor belakangan (§6): tertaut ke pindah kantong yang sama.
{
  const r1 = rencanakan(dasar({ bacaan: [sea] }));
  const t = r1.sisip.find((x) => x.ref_bank === rs.baris[3].ref)!;
  assert.deepEqual([t.kantong_tujuan_id, t.ref_bank_tujuan], ["jago", null]);
  const lama: TransaksiLama[] = r1.sisip.map((x, i) => ({ ...x, id: `s${i}` }));
  const sudah = new Set(r1.sisip.flatMap((x) => [x.ref_bank, x.ref_bank_tujuan].filter((v): v is string => Boolean(v))));
  const r2 = rencanakan(dasar({ bacaan: [jb], transaksi: lama, sudahAda: sudah }));
  assert.ok(r2.tautkan.some((x) => x.id === `s${r1.sisip.indexOf(t)}` && x.ref_bank_tujuan === ju[2].ref));
  assert.equal(r2.sisip.some((x) => x.ref_bank_tujuan === ju[2].ref || x.ref_bank === ju[2].ref), false);
}

// Bunga bulan yang sama dari rekening koran yang lebih lengkap: diperbarui, bukan dobel.
{
  const lama: TransaksiLama[] = [{ id: "b1", amount: 300, type: "income", kantong_id: "sea", kantong_tujuan_id: null, transaction_date: "2026-09-03", ref_bank: "seabank:1234:bunga:2026-09" }];
  const r = rencanakan(dasar({ bacaan: [sea], transaksi: lama }));
  assert.equal(r.sisip.filter((x) => x.category === "investment").length, 0);
  assert.deepEqual(r.perbarui.map((x) => [x.id, x.amount]), [["b1", 440]]);
}

// Rekening belum dipetakan: ditanya; "Buat kantong SeaBank" membuat kantong baru bernomor.
{
  const tanpa = KANTONG.filter((k) => k.id !== "sea");
  const r = rencanakan(dasar({ bacaan: [sea], kantong: tanpa }));
  assert.deepEqual(r.belumDipetakan, [{ kunci: "seabank:1234", nama: "SeaBank …1234", bank: "seabank", nomorAkhir: "1234", utama: true }]);
  assert.equal(r.sisip.length, 0);
  const baru = rencanakan(dasar({ bacaan: [sea], kantong: tanpa, pilihan: { peta: { "seabank:1234": "baru" } } }));
  assert.deepEqual(
    baru.kantongBaru.map((k) => [k.kunci, k.name, k.kind, k.saldo_awal, k.saldo_sejak, k.nomor_akhir]),
    [["baru:seabank:1234", "SeaBank", "bank", 3_000_000, "2026-09-01T00:00:00+07:00", "1234"]],
  );
  assert.equal(baru.rekening[0].saldoAplikasi, 911_040);
  // Dipetakan ke kantong yang ada → 4 digit akhirnya diingat.
  const lain = rencanakan(dasar({ bacaan: [sea], kantong: [...tanpa, { id: "x", name: "Rekening Harian", kind: "bank", saldo_awal: 0, saldo_per: "2026-09-01" }], pilihan: { peta: { "seabank:1234": "x" } } }));
  assert.deepEqual(lain.nomorAkhir, [{ id: "x", nomor_akhir: "1234" }]);
  // Nama "SeaBank" sudah dipakai kantong lain → nama dengan 4 digit akhir.
  const kembar = rencanakan(dasar({ bacaan: [sea], kantong: [...tanpa, { id: "y", name: "seabank", kind: "ewallet" }], pilihan: { peta: { "seabank:1234": "baru" } } }));
  assert.equal(kembar.kantongBaru[0].name, "SeaBank …1234");
}

// Kategori bawaan yang sudah dihapus user → Lainnya.
{
  const r = rencanakan(dasar({ bacaan: [br], kategori: [{ type: "expense", slug: "other" }, { type: "income", slug: "other" }] }));
  assert.equal(r.sisip.find((x) => x.ref_bank === rb.baris[3].ref)!.category, "other");
}


// ------------------------------------------------------------ deposito SeaBank tidak dobel

/**
 * Database tiruan: menerapkan rencana seperti RPC impor_rekening (kantong baru,
 * deposito via buat_simpanan, transaksi, tautan, ubah penempatan jadi pindah),
 * lalu saldo dihitung dengan aturan aplikasi (hitungSaldo, SPEC-saldo-waktu).
 */
interface Db {
  kantong: (Kantong & KantongRencana)[];
  tx: (TransaksiLama & { category?: string | null; perlu_dilengkapi?: boolean })[];
}
const tanggalWIB = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
function terapkan(db: Db, r: Rencana, sekarang: string) {
  const peta = new Map<string, string>();
  const id = (v: string | null) => (v ? (peta.get(v) ?? v) : null);
  const tambahKantong = (kunci: string, k: Omit<Kantong & KantongRencana, "id" | "saldo_per">) => {
    const baru = { ...k, id: `k${db.kantong.length}`, saldo_per: tanggalWIB(k.saldo_sejak!) } as Kantong & KantongRencana;
    db.kantong.push(baru);
    peta.set(kunci, baru.id);
  };
  for (const k of [...r.kantongBaru].sort((a, b) => Number(a.kind === "simpanan") - Number(b.kind === "simpanan")))
    tambahKantong(k.kunci, { name: k.name, kind: k.kind, aliases: null, induk_id: id(k.induk_id), macam_simpanan: k.macam_simpanan, saldo_awal: k.saldo_awal, saldo_sejak: k.saldo_sejak ?? sekarang, nomor_akhir: k.nomor_akhir || null });
  for (const d of r.depositoBaru)
    tambahKantong(d.kunci, { name: d.name, kind: "simpanan", aliases: null, induk_id: id(d.induk_id), macam_simpanan: "deposito", saldo_awal: d.didanai ? 0 : d.pokok, saldo_sejak: d.didanai ? `${d.didanai}T00:00:00+07:00` : sekarang });
  for (const t of r.sisip) {
    const baru = { ...t, id: `t${db.tx.length}`, kantong_id: id(t.kantong_id), kantong_tujuan_id: id(t.kantong_tujuan_id), induk_id: t.induk ? id(t.induk) : null };
    db.tx.push(baru);
    peta.set(t.kunci, baru.id);
  }
  for (const x of r.tautkan) Object.assign(db.tx.find((t) => t.id === x.id)!, x.ref_bank ? { ref_bank: x.ref_bank } : {}, x.ref_bank_tujuan ? { ref_bank_tujuan: x.ref_bank_tujuan } : {});
  for (const x of r.jadiPindah) Object.assign(db.tx.find((t) => t.id === x.id)!, { type: "transfer", category: null, kantong_tujuan_id: id(x.kantong_tujuan_id), perlu_dilengkapi: false });
}
/** Impor dengan semua tawaran deposito diterima dan rekening baru → "Buat kantong". */
function impor(db: Db, bacaan: ReturnType<typeof bacaRekening>[], sekarang: string) {
  const sudahAda = new Set(db.tx.flatMap((t) => [t.ref_bank, t.ref_bank_tujuan].filter((v): v is string => Boolean(v))));
  const masukan = { bacaan, kantong: db.kantong, transaksi: db.tx, kategori: null, sudahAda };
  const peta = Object.fromEntries(rencanakan(masukan).belumDipetakan.map((b) => [b.kunci, "baru"]));
  const tawaran = rencanakan({ ...masukan, pilihan: { peta } }).tawaranDeposito.map((t) => t.kunci);
  const r = rencanakan({ ...masukan, pilihan: { peta, deposito: tawaran } });
  terapkan(db, r, sekarang);
  return r;
}
const saldoDb = (db: Db) => Object.fromEntries(hitungSaldo(db.kantong, db.tx).map((x) => [db.kantong.find((k) => k.id === x.id)!.name, x.saldo]));

const PENEMPATAN = { tgl: "06 JUL", atas: ["Fund Placement"], n: -2_000_000, bawah: ["Time Deposit"] };
const bunga = (tgl: string, n: number) => ({ tgl, atas: ["Savings Interest"], n, bawah: ["Interest"] });
// Juli: bulan penempatan, tanpa tabel deposito. Agustus: tabel deposito.
const juli = bacaRekening(pdf(...seabankBulan({ dari: "01 JUL 2026", sampai: "31 JUL 2026", awal: 2_500_000, baris: [PENEMPATAN, bunga("31 JUL", 50)] })));
const agustus = bacaRekening(pdf(...seabankBulan({ dari: "01 AUG 2026", sampai: "31 AUG 2026", awal: 2_500_050 - 2_000_000, baris: [bunga("31 AUG", 40)], deposito: { nama: "Deposito Uji", pokok: 2_000_000 } })));
const SEKARANG = "2026-11-07T10:00:00+07:00";
for (const [nama, urutan] of [
  ["sekaligus", [[juli, agustus]]],
  ["Juli lalu Agustus", [[juli], [agustus]]],
  ["Agustus lalu Juli", [[agustus], [juli]]],
] as const) {
  const db: Db = { kantong: [], tx: [] };
  for (const b of urutan) impor(db, [...b], SEKARANG);
  const saldo = saldoDb(db);
  assert.equal(saldo["Deposito Uji"], 2_000_000, `${nama}: deposito = pokok`);
  assert.equal(saldo.SeaBank, 500_090, `${nama}: SeaBank = saldo akhir rekening koran`);
  assert.equal(Object.values(saldo).reduce((a, b) => a + b, 0), 2_500_090, `${nama}: total aset`);
  assert.equal(db.tx.filter((t) => t.type === "expense" && Number(t.amount) === 2_000_000).length, 0, `${nama}: penempatan bukan pengeluaran`);
  const pindah = db.tx.filter((t) => t.type === "transfer");
  assert.equal(pindah.length, 1, `${nama}: satu pindah kantong SeaBank → deposito`);
  assert.equal(db.kantong.find((k) => k.id === pindah[0].kantong_tujuan_id)?.name, "Deposito Uji", nama);
}
// Penempatan di hari impor (tanpa jam = dianggap sesudah saldo): deposito tetap = pokok,
// karena didanai pindah kantongnya, bukan uang baru + pindah kantong.
{
  const db: Db = { kantong: [], tx: [] };
  const hariIni = bacaRekening(pdf(...seabankBulan({ dari: "01 JUL 2026", sampai: "31 JUL 2026", awal: 2_500_000, baris: [PENEMPATAN], deposito: { nama: "Deposito Uji", pokok: 2_000_000 } })));
  const r = impor(db, [hariIni], "2026-07-06T15:00:00+07:00");
  assert.equal(r.depositoBaru[0].didanai, "2026-07-06");
  const saldo = saldoDb(db);
  assert.deepEqual([saldo["Deposito Uji"], saldo.SeaBank], [2_000_000, 500_000]);
}
// Tanpa baris penempatan (deposito lama): uang baru sejak saat impor.
{
  const db: Db = { kantong: [], tx: [] };
  const r = impor(db, [agustus], SEKARANG);
  assert.equal(r.depositoBaru[0].didanai ?? null, null);
  assert.equal(saldoDb(db)["Deposito Uji"], 2_000_000);
}

// ------------------------------------------------------------ deposito jatuh tempo (SPEC-deposito-jatuh-tempo)

{
  type Baris = HasilBaca["rekening"][number]["baris"][number];
  const bJ = (nomor: string, tanggal: string, jam: string, nominal: number, jenis: string, pihak: string, urut: number): Baris => ({
    tanggal, jam, nominal, saldo: null, uraian: jenis, jenis, pihak: { nama: pihak, bank: "Jago", nomor: null }, catatan: null, ref: `jago:${nomor}:${tanggal}T${jam}:${nominal}`, urut,
  });
  const rekJ = (nomor: string, saku: string, utama: boolean, dari: string, sampai: string, saldoAwal: number, baris: Baris[]) => ({
    bank: "jago" as const, nomorAkhir: nomor, saku, utama, dari, sampai, saldoAwal, saldoAkhir: saldoAwal + baris.reduce((n, b) => n + b.nominal, 0), baris,
  });
  const jago = (...rekening: ReturnType<typeof rekJ>[]): HasilBaca => ({ format: "jagoBulanan", bank: "jago", pemilik: "BUDI SANTOSO", rekening, deposito: [] });
  const bS = (tanggal: string, nominal: number, jenis: string, pihak: string, urut: number): Baris => ({
    tanggal, jam: null, nominal, saldo: null, uraian: pihak, jenis, pihak: { nama: pihak, bank: null, nomor: null }, catatan: null, ref: `sea:1234:${tanggal}:${nominal}:${urut}`, urut,
  });
  const seaOkt = (baris: Baris[]): HasilBaca => ({
    format: "seabank", bank: "seabank", pemilik: "BUDI SANTOSO", deposito: [],
    rekening: [{ bank: "seabank", nomorAkhir: "1234", saku: null, utama: true, dari: "2026-10-01", sampai: "2026-10-31", saldoAwal: 100_000, saldoAkhir: 100_000 + baris.reduce((n, b) => n + b.nominal, 0), baris }],
  });

  // Jago: kantong "Deposito" pokok Rp 10 jt, 5%, 30 hari, diperpanjang dengan bunga.
  const KJ: KantongRencana[] = [
    { id: "jago", name: "Jago", kind: "bank", nomor_akhir: "5678", saldo_awal: 500_000, saldo_per: "2026-10-01", saldo_sejak: "2026-10-01T00:00:00+07:00" },
    { id: "depo", name: "Deposito", kind: "simpanan", induk_id: "jago", macam_simpanan: "deposito", nomor_akhir: "7001", saldo_awal: 10_000_000, saldo_per: "2026-10-01", saldo_sejak: "2026-10-01T00:00:00+07:00" },
  ];
  const P1: PeriodeRencana = { id: "p1", ke: 1, mulai: "2026-09-10", jatuh_tempo: "2026-10-10", pokok: 10_000_000, bunga_kotor: 41_096, pajak: 8_219, bunga_bersih: 32_877, bunga_diterima: null, dicairkan_awal: false, transaksi_tutup: null };
  const DJ = (periode: PeriodeRencana[], ubah: Partial<DepositoRencana> = {}): DepositoRencana[] => [
    { kantong_id: "depo", name: "Deposito", induk_id: "jago", bunga_persen: 5, tenor: 1, satuan_tenor: "bulan", pajak_persen: 20, pajak_otomatis: true, perpanjangan: "pokok_bunga", selesai: false, periode, ...ubah },
  ];
  const utamaOkt = rekJ("5678", "Kantong Utama", true, "2026-10-01", "2026-10-31", 500_000, [bJ("5678", "2026-10-31", "04:59", 100, "Bunga", "Bunga", 0), bJ("5678", "2026-10-31", "04:59", -20, "Pajak Bunga", "Pajak Bunga", 1)]);
  const BUNGA = bJ("7001", "2026-10-11", "00:15", 41_096, "Bunga", "Bunga", 0); // sehari sesudah jatuh tempo: masih dalam ± 3 hari
  const PAJAK = bJ("7001", "2026-10-11", "00:15", -8_219, "Pajak Bunga", "Pajak Bunga", 1);
  const okt = jago(utamaOkt, rekJ("7001", "Deposito", false, "2026-10-01", "2026-10-31", 10_000_000, [BUNGA, PAJAK]));
  const masukJ = (m: Partial<MasukanRencana>): MasukanRencana => ({ bacaan: [okt], kantong: KJ, transaksi: [], kategori: null, sudahAda: new Set(), ...m });

  // Belum dievaluasi → ditutup dari rekening koran, periode baru pokok + bunga, tidak masuk "Bunga Okt".
  const r = rencanakan(masukJ({ deposito: DJ([P1]) }));
  assert.equal(r.tutup.length, 1);
  const t = r.tutup[0];
  const bunga = r.sisip.find((x) => x.ref_bank === BUNGA.ref)!;
  assert.deepEqual([bunga.type, bunga.amount, bunga.kantong_id, bunga.category, bunga.merchant, bunga.transaction_date], ["income", 32_877, "depo", "investment", "Deposito", "2026-10-11"]);
  assert.match(sp(bunga.description)!, /^Bunga deposito ke-1 · kotor Rp 41\.096, pajak Rp 8\.219 · dari rekening koran$/);
  assert.deepEqual([t.periode, t.deposito, t.bunga, t.cair, t.transaksi], ["p1", "depo", 32_877, false, [bunga.kunci]]);
  assert.deepEqual(t.baru, { kunci: "periode:depo:2", mulai: "2026-10-10", jatuh_tempo: "2026-11-10", pokok: 10_032_877, bunga_kotor: 42_605, pajak: 8_521, bunga_bersih: 34_084 });
  assert.deepEqual(r.sisip.filter((x) => x.category === "investment").map((x) => [x.kantong_id, x.ref_bank]), [["depo", BUNGA.ref], ["jago", "jago:5678:bunga:2026-10"]], "bunga deposito tidak ikut Bunga Okt");
  const kartu = r.rekening.find((x) => x.kunci === "jago:7001")!;
  assert.deepEqual(kartu.deposito.map((d) => [sp(d.teks), d.peringatan]), [["Deposito Deposito jatuh tempo 10 Okt 2026: bunga bersih Rp 32.877 (perkiraan Rp 32.877) · diperpanjang sampai 10 Nov 2026", false]]);
  assert.equal(kartu.saldoAplikasi, kartu.saldoBank);
  assert.deepEqual([r.sesuaikan, r.tawaranJadikan, r.jadikan], [[], [], []]);

  // Impor ulang sesudahnya: periodenya sudah ditutup dari rekening koran → 0 baru, tidak ditutup lagi.
  const lama: TransaksiLama[] = r.sisip.map((x, i) => ({ ...x, id: `u${i}` }));
  const idBunga = `u${r.sisip.indexOf(bunga)}`;
  const tertutup = [{ ...P1, bunga_diterima: 32_877, transaksi_tutup: [idBunga] }, { id: "p2", ke: 2, ...t.baru!, bunga_diterima: null, dicairkan_awal: false }];
  const sudahAda = new Set(r.sisip.flatMap((x) => [x.ref_bank, x.ref_bank_tujuan].filter((v): v is string => Boolean(v))));
  const ulang = rencanakan(masukJ({ deposito: DJ(tertutup), transaksi: lama, sudahAda }));
  assert.deepEqual([ulang.sisip.length, ulang.tutup.length, ulang.sesuaikan.length, ulang.tautkan.length, ulang.perbarui.length], [0, 0, 0, 0, 0]);
  assert.equal(ulang.ringkas.tercatat, ulang.ringkas.baris);

  // Sudah dievaluasi di aplikasi dengan angka yang sama → ditautkan, tanpa transaksi baru.
  const evaluasi: TransaksiLama = { id: "ev1", amount: 32_877, type: "income", kantong_id: "depo", kantong_tujuan_id: null, transaction_date: "2026-10-12", merchant: "Deposito", description: "Bunga deposito ke-1 · kotor Rp 41.096, pajak Rp 8.219" };
  const P2 = { id: "p2", ke: 2, mulai: "2026-10-10", jatuh_tempo: "2026-11-10", pokok: 10_032_877, bunga_kotor: 42_605, pajak: 8_521, bunga_bersih: 34_084, bunga_diterima: null, dicairkan_awal: false };
  const dicek = rencanakan(masukJ({ deposito: DJ([{ ...P1, bunga_diterima: 32_877, transaksi_tutup: ["ev1"] }, P2]), transaksi: [evaluasi] }));
  assert.deepEqual(dicek.tautkan, [{ id: "ev1", ref_bank: BUNGA.ref }]);
  assert.equal(dicek.sisip.some((x) => x.kantong_id === "depo"), false, "tidak ada transaksi baru untuk deposito");
  assert.deepEqual([dicek.tutup.length, dicek.sesuaikan.length], [0, 0]);
  assert.deepEqual(dicek.rekening.find((x) => x.kunci === "jago:7001")!.deposito.map((d) => d.peringatan), [false]);
  assert.equal(dicek.rekening.find((x) => x.kunci === "jago:7001")!.tercatat, 2);

  // K1: isian user beda dengan bank → transaksi bunga ikut bank, perpanjangan dihitung ulang.
  const k1 = rencanakan(masukJ({ deposito: DJ([{ ...P1, bunga_diterima: 30_000, transaksi_tutup: ["ev1"] }, { ...P2, pokok: 10_030_000 }]), transaksi: [{ ...evaluasi, amount: 30_000 }] }));
  assert.deepEqual(k1.tautkan, [{ id: "ev1", ref_bank: BUNGA.ref }]);
  assert.equal(k1.sesuaikan.length, 1);
  const s1 = k1.sesuaikan[0];
  assert.deepEqual([s1.periode, s1.bunga, s1.transaksi?.id, s1.transaksi?.amount, s1.tambah], ["p1", 32_877, "ev1", 32_877, null]);
  assert.equal(sp(s1.transaksi?.description), "Bunga deposito ke-1 · kotor Rp 41.096, pajak Rp 8.219 · disesuaikan dengan rekening koran");
  assert.deepEqual(s1.berikut, { id: "p2", pokok: 10_032_877, bunga_kotor: 42_605, pajak: 8_521, bunga_bersih: 34_084 });
  assert.equal(k1.rekening.find((x) => x.kunci === "jago:7001")!.deposito[0].peringatan, true);

  // Tidak ada baris yang dikenali (jatuh tempo di luar ± 3 hari) → periode tetap terbuka, bunga ikut bulanan.
  const jauh = rencanakan(masukJ({ deposito: DJ([{ ...P1, jatuh_tempo: "2026-10-20" }]) }));
  assert.deepEqual([jauh.tutup.length, jauh.sisip.some((x) => x.ref_bank === "jago:7001:bunga:2026-10")], [0, true]);
  // Sekali saja tanpa baris pencairan: tidak ditutup otomatis.
  assert.equal(rencanakan(masukJ({ deposito: DJ([P1], { perpanjangan: "sekali" }) })).tutup.length, 0);
  // Tanpa data deposito: seperti sebelumnya.
  const tanpa = rencanakan(masukJ({}));
  assert.deepEqual([tanpa.tutup.length, tanpa.sisip.some((x) => x.ref_bank === "jago:7001:bunga:2026-10")], [0, true]);
  // "Bunga Okt" kantong itu sudah terimpor sebelumnya (isinya hanya baris deposito): dipakai jadi bunga deposito.
  const bulanan: TransaksiLama = { id: "bln", amount: 32_877, type: "income", kantong_id: "depo", kantong_tujuan_id: null, transaction_date: "2026-10-11", ref_bank: "jago:7001:bunga:2026-10" };
  const pakai = rencanakan(masukJ({ deposito: DJ([P1]), transaksi: [bulanan] }));
  assert.deepEqual([pakai.tutup[0].transaksi, pakai.sisip.some((x) => x.kantong_id === "depo"), pakai.tautkan], [["bln"], false, [{ id: "bln", ref_bank: BUNGA.ref }]]);

  // K2: kantong Jago "Deposito" yang masih tabungan → "Jadikan deposito?" (mulai dari baris Penempatan Dana).
  const KT: KantongRencana[] = [KJ[0], { ...KJ[1], macam_simpanan: "tabungan" }];
  const tempat = bJ("7001", "2026-09-10", "09:00", 10_000_000, "Penempatan Dana Pokok", "Kantong Utama", 0);
  const keluar = bJ("5678", "2026-09-10", "09:00", -10_000_000, "Penempatan Dana Pokok", "Deposito", 0);
  const sep = jago(rekJ("5678", "Kantong Utama", true, "2026-09-01", "2026-09-30", 10_500_000, [keluar]), rekJ("7001", "Deposito", false, "2026-09-01", "2026-09-30", 0, [tempat]));
  const tawar = rencanakan({ bacaan: [sep, okt], kantong: KT, transaksi: [], kategori: null, sudahAda: new Set() });
  assert.deepEqual(tawar.tawaranJadikan.map((x) => [x.kunci, x.kantong, x.mulai, x.pokok, x.teks, x.isian, x.galat]), [["jago:7001", "depo", "2026-09-10", 10_000_000, "Jadikan Deposito deposito?", null, null]]);
  assert.equal(tawar.tutup.length, 0, "ditolak: tetap tabungan");
  assert.ok(tawar.sisip.some((x) => x.ref_bank === "jago:7001:bunga:2026-10"), "ditolak: bunganya ikut bulanan");
  const isian = { tenor: 1, satuan_tenor: "bulan" as const, bunga_persen: 5, perpanjangan: "pokok_bunga" as const };
  const jadi = rencanakan({ bacaan: [sep, okt], kantong: KT, transaksi: [], kategori: null, sudahAda: new Set(), pilihan: { jadikan: { "jago:7001": isian } } });
  assert.deepEqual(jadi.jadikan, [{ kantong_id: "depo", bunga_persen: 5, tenor: 1, satuan_tenor: "bulan", pajak_persen: 20, pajak_otomatis: true, perpanjangan: "pokok_bunga", periode: { kunci: "periode:jago:7001:1", mulai: "2026-09-10", jatuh_tempo: "2026-10-10", pokok: 10_000_000, bunga_kotor: 41_096, pajak: 8_219, bunga_bersih: 32_877 } }]);
  assert.deepEqual(jadi.tutup.map((x) => [x.periode, x.bunga, x.baru?.pokok]), [["periode:jago:7001:1", 32_877, 10_032_877]], "periode ke-1 langsung ditutup dari rekening koran");
  assert.equal(jadi.sisip.some((x) => x.ref_bank === "jago:7001:bunga:2026-10"), false);
  // Isian tidak lengkap → galat, tidak diterapkan.
  const salah = rencanakan({ bacaan: [sep, okt], kantong: KT, transaksi: [], kategori: null, sudahAda: new Set(), pilihan: { jadikan: { "jago:7001": { ...isian, bunga_persen: 0 } } } });
  assert.deepEqual([salah.tawaranJadikan[0].galat, salah.jadikan.length], ["Bunganya diisi dulu, mis. 4,5.", 0]);

  // SeaBank cair (sintetis, perlu dicek ulang dengan rekening koran asli).
  const KS: KantongRencana[] = [
    { id: "sea", name: "SeaBank", kind: "bank", nomor_akhir: "1234", saldo_awal: 100_000, saldo_per: "2026-10-01", saldo_sejak: "2026-10-01T00:00:00+07:00" },
    { id: "tds", name: "Deposito Uji", kind: "simpanan", induk_id: "sea", macam_simpanan: "deposito", saldo_awal: 2_000_000, saldo_per: "2026-07-06", saldo_sejak: "2026-07-06T00:00:00+07:00" },
  ];
  const PS: PeriodeRencana = { id: "ps1", ke: 1, mulai: "2026-07-06", jatuh_tempo: "2026-10-06", pokok: 2_000_000, bunga_kotor: 30_247, pajak: 0, bunga_bersih: 30_247, bunga_diterima: null, dicairkan_awal: false, transaksi_tutup: null };
  const DS = (periode: PeriodeRencana[], selesai = false): DepositoRencana[] => [{ kantong_id: "tds", name: "Deposito Uji", induk_id: "sea", bunga_persen: 6, tenor: 3, satuan_tenor: "bulan", pajak_persen: 0, pajak_otomatis: true, perpanjangan: "sekali", selesai, periode }];
  const tabungan = bS("2026-10-06", 15, "Interest", "Savings Interest", 1);
  // Pokok + bunga digabung dalam satu baris pencairan.
  const CAIR = bS("2026-10-07", 2_030_247, "Time Deposit", "Fund Withdrawal", 0);
  const gabung = rencanakan({ bacaan: [seaOkt([CAIR, tabungan])], kantong: KS, transaksi: [], kategori: null, sudahAda: new Set(), deposito: DS([PS]) });
  const bg = gabung.sisip.find((x) => x.ref_bank === `${CAIR.ref}:bunga`)!;
  const pg = gabung.sisip.find((x) => x.ref_bank_tujuan === CAIR.ref)!;
  assert.deepEqual([bg.type, bg.amount, bg.kantong_id], ["income", 30_247, "tds"]);
  assert.deepEqual([pg.type, pg.amount, pg.kantong_id, pg.kantong_tujuan_id], ["transfer", 2_030_247, "tds", "sea"]);
  assert.deepEqual(gabung.tutup.map((x) => [x.periode, x.bunga, x.cair, x.baru, x.transaksi]), [["ps1", 30_247, true, null, [bg.kunci, pg.kunci]]]);
  assert.ok(gabung.sisip.some((x) => x.ref_bank === "seabank:1234:bunga:2026-10" && x.amount === 15), "bunga tabungan tetap bulanan");
  assert.match(sp(gabung.rekening[0].deposito[0].teks)!, /: bunga bersih Rp 30\.247 \(perkiraan Rp 30\.247\) · Rp 2\.030\.247 kembali ke SeaBank$/);
  // Impor ulang sesudahnya (deposito selesai, periode tertutup dari rekening koran): 0 baru.
  {
    const lama: TransaksiLama[] = gabung.sisip.map((x, i) => ({ ...x, id: `g${i}` }));
    const ids = gabung.tutup[0].transaksi.map((k) => `g${gabung.sisip.findIndex((x) => x.kunci === k)}`);
    const sudahAda = new Set(gabung.sisip.flatMap((x) => [x.ref_bank, x.ref_bank_tujuan].filter((v): v is string => Boolean(v))));
    const ulang = rencanakan({ bacaan: [seaOkt([CAIR, tabungan])], kantong: KS, transaksi: lama, kategori: null, sudahAda, deposito: DS([{ ...PS, bunga_diterima: 30_247, transaksi_tutup: ids }], true) });
    assert.deepEqual([ulang.sisip.length, ulang.tutup.length, ulang.sesuaikan.length, ulang.tautkan.length], [0, 0, 0, 0]);
  }
  // Pencairan pokok dengan bunga & pajak terpisah: bunga bersih ke SeaBank.
  const pisah = rencanakan({
    bacaan: [seaOkt([bS("2026-10-06", 2_000_000, "Time Deposit", "Fund Withdrawal", 0), bS("2026-10-06", 30_250, "Interest", "Time Deposit Interest", 1), bS("2026-10-06", -3, "Tax", "Time Deposit Tax", 2)])],
    kantong: KS, transaksi: [], kategori: null, sudahAda: new Set(), deposito: DS([PS]),
  });
  const bp = pisah.sisip.find((x) => x.type === "income")!;
  assert.deepEqual([bp.amount, bp.kantong_id, pisah.sisip.find((x) => x.type === "transfer")?.amount], [30_247, "sea", 2_000_000]);
  assert.deepEqual([pisah.tutup[0].bunga, pisah.tutup[0].cair, pisah.tutup[0].transaksi.length], [30_247, true, 2]);
  assert.equal(pisah.sisip.some((x) => x.ref_bank === "seabank:1234:bunga:2026-10"), false, "bunga deposito bukan bunga bulanan");
  // Sudah dicairkan di aplikasi (deposito selesai): pencairan & bunga ditautkan, bukan pindah kantong kedua.
  const hasilCair: TransaksiLama[] = [
    { id: "eb", amount: 30_000, type: "income", kantong_id: "sea", kantong_tujuan_id: null, transaction_date: "2026-10-06", description: "Bunga deposito ke-1" },
    { id: "ep", amount: 2_000_000, type: "transfer", kantong_id: "tds", kantong_tujuan_id: "sea", transaction_date: "2026-10-06" },
  ];
  const cairDulu = rencanakan({ bacaan: [seaOkt([CAIR])], kantong: KS, transaksi: hasilCair, kategori: null, sudahAda: new Set(), deposito: DS([{ ...PS, bunga_diterima: 30_000, transaksi_tutup: ["eb", "ep"] }], true) });
  assert.deepEqual(cairDulu.sisip, []);
  assert.deepEqual(cairDulu.tautkan, [{ id: "eb", ref_bank: `${CAIR.ref}:bunga` }, { id: "ep", ref_bank_tujuan: CAIR.ref }]);
  assert.deepEqual(cairDulu.sesuaikan.map((x) => [x.bunga, x.transaksi?.amount, x.berikut]), [[30_247, 30_247, null]], "K1");
  // Tanpa baris deposito di sekitar jatuh tempo → tetap terbuka.
  assert.equal(rencanakan({ bacaan: [seaOkt([tabungan])], kantong: KS, transaksi: [], kategori: null, sudahAda: new Set(), deposito: DS([PS]) }).tutup.length, 0);

  // K3 saat impor: deposito "Sudah termasuk" (pindah kantong pembuatan) + pengeluaran Fund Placement
  // tanggal & nominal sama → pengeluarannya dihapus, pengenal barisnya pindah ke pindah kantong itu.
  const fp: TransaksiLama = { id: "fp", amount: 2_000_000, type: "expense", merchant: "Fund Placement", kantong_id: "sea", kantong_tujuan_id: null, transaction_date: "2026-07-06", ref_bank: "sea:1234:2026-07-06:-2000000:500000" };
  const buatan: TransaksiLama = { id: "bt", amount: 2_000_000, type: "transfer", kantong_id: "sea", kantong_tujuan_id: "tds", transaction_date: "2026-10-20" };
  const k3 = rencanakan({ bacaan: [seaOkt([tabungan])], kantong: KS, transaksi: [fp, buatan], kategori: null, sudahAda: new Set([fp.ref_bank!]), deposito: DS([{ ...PS, jatuh_tempo: "2026-11-06" }]) });
  assert.deepEqual([k3.hapus, k3.jadiPindah, k3.tautkan], [["fp"], [], [{ id: "bt", ref_bank: fp.ref_bank }]]);
  // Tanggal beda dengan mulai deposito → seperti sebelumnya (jadi pindah kantong).
  const k3b = rencanakan({ bacaan: [seaOkt([tabungan])], kantong: KS, transaksi: [{ ...fp, transaction_date: "2026-07-07" }, buatan], kategori: null, sudahAda: new Set([fp.ref_bank!]), deposito: DS([{ ...PS, jatuh_tempo: "2026-11-06" }]) });
  assert.deepEqual([k3b.hapus, k3b.jadiPindah.map((x) => x.id)], [[], ["fp"]]);
}

console.log("uji:rekening lulus");
