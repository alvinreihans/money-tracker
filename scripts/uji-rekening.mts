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
import { golongkan, rencanakan, ringkasRupiah, samaPemilik, type KantongRencana, type MasukanRencana, type TransaksiLama } from "../src/lib/rekening/rencana.ts";
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

console.log("uji:rekening lulus");
