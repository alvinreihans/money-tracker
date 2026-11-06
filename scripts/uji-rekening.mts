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

/** fmtIDR memakai spasi tak terputus. */
const sp = (t: string | null | undefined) => t?.replace(/ /g, " ") ?? t;

// ------------------------------------------------------------ pembuat teks

type Item = [number, string];
class Halaman {
  items: { x: number; y: number; s: string }[] = [];
  baris(y: number, ...items: Item[]) {
    for (const [x, s] of items) this.items.push({ x, y, s });
    return this;
  }
}
const pdf = (...hal: Halaman[]): BarisPdf[] => susunBaris(hal);

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

// ------------------------------------------------------------ SeaBank

/** Satu baris transaksi SeaBank: pihak di atas, tanggal-nominal-saldo, lalu rekening & jenis di bawah. */
function barisSea(h: Halaman, y: number, r: { atas: string[]; tgl: string; tengah?: string; n: string; x: number; saldo: string; bawah: string[] }) {
  r.atas.forEach((t, i) => h.baris(y + 6 + (r.atas.length - 1 - i) * 10, [139, t]));
  h.baris(y, [46, r.tgl], ...(r.tengah ? ([[139, r.tengah]] as Item[]) : []), [r.x, r.n], [475, r.saldo]);
  r.bawah.forEach((t, i) => h.baris(y - 7 - i * 12, [139, t]));
}
function kepalaSea(h: Halaman, hal: number) {
  h.baris(755, [429, "BANK STATEMENT"]).baris(742, [396, "S/N S01-000000CONTOH"]).baris(729, [461, "01 OCT 2026"]);
  h.baris(40, [464, "page"], [492, String(hal)], [501, "of"], [514, "2"]);
}
const judulSea: Item[] = [[46, "DATE"], [139, "TRANSACTION"], [269, "OUTGOING"], [308, "(IDR)"], [366, "INCOMING"], [405, "(IDR)"], [447, "END BALANCE"], [498, "(IDR)"]];
function seabank(akhir = "911.040") {
  const h1 = new Halaman();
  kepalaSea(h1, 1);
  h1.baris(682, [38, "BUDI SANTOSO"]).baris(664, [38, "SEABANK ACCOUNT: 901000001234"], [340, "Contact Us"]).baris(642, [38, "JALAN CONTOH 1"]);
  h1.baris(556, [216, "ACCOUNT SUMMARY"]).baris(541, [221, "01 SEP 2026 to 30 SEP 2026"]);
  h1.baris(512, [46, "ACCOUNT"], [139, "STARTING BALANCE"], [212, "(IDR)"], [244, "TOTAL OUTGOING"], [308, "(IDR)"], [341, "TOTAL INCOMING"], [405, "(IDR)"], [434, "ENDING BALANCE"], [498, "(IDR)"]);
  h1.baris(483, [46, "SAVINGS"], [189, "3.000.000"], [285, "2.154.440"], [389, "65.480"], [487, akhir]);
  h1.baris(453, [457, `TOTAL: ${akhir}`]);
  h1.baris(406, [46, "TIME DEPOSIT"], [198, "TENURE"], [266, "MATURITY DATE"], [365, "INTEREST RATE"], [436, "PLACEMENT AMOUNT"]);
  h1.baris(376, [46, "Deposito Contoh"], [184, "6 MONTHS"], [274, "06 JAN 2027"], [379, "6.00% P.A."], [475, "2.000.000"]);
  h1.baris(366, [46, "(TD000000001-1)"]).baris(336, [445, "TOTAL: 2.000.000"]);
  h1.baris(287, [46, "TOTAL SAVINGS + ACTIVE TIME DEPOSIT"], [445, "TOTAL: 2.911.040"]);
  h1.baris(242, [176, "SAVINGS - TRANSACTION DETAILS"]).baris(213, ...judulSea);
  barisSea(h1, 181, { atas: ["Savings Interest"], tgl: "01 SEP", n: "200", x: 405, saldo: "3.000.200", bawah: ["Interest"] });
  barisSea(h1, 141, { atas: ["ShopeePay"], tgl: "01 SEP", n: "24.000", x: 297, saldo: "2.976.200", bawah: ["Payment"] });
  barisSea(h1, 100, { atas: ["Savings Withholding", "Tax"], tgl: "01 SEP", n: "40", x: 313, saldo: "2.976.160", bawah: ["Tax"] });
  const h2 = new Halaman();
  kepalaSea(h2, 2);
  h2.baris(684, ...judulSea);
  barisSea(h2, 651, { atas: ["BUDI SANTOSO"], tgl: "02 SEP", tengah: "JAGO 102000005678", n: "100.000", x: 292, saldo: "2.876.160", bawah: ["Transfer"] });
  barisSea(h2, 609, { atas: ["ANI WIJAYA"], tgl: "02 SEP", n: "50.000", x: 393, saldo: "2.926.160", bawah: ["SeaBank 901000009999", "Transfer"] });
  barisSea(h2, 567, { atas: ["DNID SXXX", "WXXX"], tgl: "03 SEP", n: "30.000", x: 297, saldo: "2.896.160", bawah: ["Dana 0890000001", "Top Up - eWallet"] });
  barisSea(h2, 525, { atas: ["Fee"], tgl: "03 SEP", n: "400", x: 309, saldo: "2.895.760", bawah: ["Top Up - eWallet"] });
  barisSea(h2, 483, { atas: ["Savings Interest"], tgl: "03 SEP", n: "180", x: 405, saldo: "2.895.940", bawah: ["Interest"] });
  barisSea(h2, 441, { atas: ["Refund - Shopee"], tgl: "04 SEP", n: "15.000", x: 393, saldo: "2.910.940", bawah: ["Payment"] });
  barisSea(h2, 399, { atas: ["Fund Placement"], tgl: "06 SEP", n: "2.000.000", x: 285, saldo: "910.940", bawah: ["Time Deposit"] });
  barisSea(h2, 357, { atas: ["Savings Interest"], tgl: "30 SEP", n: "100", x: 405, saldo: "911.040", bawah: ["Interest"] });
  h2.baris(215, [155, "TIME DEPOSIT - INTEREST & TAX DETAILS"]).baris(149, [241, "NO TRANSACTION"]);
  return pdf(h1, h2);
}

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

// ------------------------------------------------------------ Jago bulanan

const kakiJago = (h: Halaman) =>
  h.baris(24, [103, "PT Bank Jago Tbk berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK) dan Bank Indonesia, serta"]).baris(19, [498, "www.jago.com"]).baris(16, [103, "merupakan peserta penjaminan Lembaga Penjamin Simpanan (LPS)."]);
const judulJagoBulanan: Item[] = [[18, "Tanggal & Waktu"], [101, "Sumber/Tujuan"], [191, "Rincian Transaksi"], [281, "Catatan"], [435, "Jumlah"], [525, "Saldo"]];
function bagianJago(h: Halaman, y: number, nama: string, id: string, awal: string, akhir: string) {
  h.baris(y + 2, [299, "Saldo Sebelumnya"], [518, awal]).baris(y, [19, nama]);
  h.baris(y - 13, [299, "Total Pemasukan"], [487, "+0,00"]).baris(y - 15, [19, `ID Kantong ${id}`]);
  h.baris(y - 27, [299, "Total Pengeluaran"], [487, "-0,00"]);
  h.baris(y - 41, [19, "Akun Aktif, mulai"], [81, "04 May 2022"], [191, "Mata Uang Dalam IDR"], [299, "Saldo Akhir"], [521, akhir]);
  h.baris(y - 67, ...judulJagoBulanan);
}
/** Baris Jago: tanggal + sel-sel, jam di baris berikutnya, lalu baris lanjutan. */
function barisJago(h: Halaman, y: number, tgl: string, jam: string, sel: Item[], lanjut: Item[][] = [], xTgl = 18) {
  h.baris(y, [xTgl, tgl], ...sel);
  h.baris(y - 9, [xTgl, jam], ...(lanjut[0] ?? []));
  (lanjut.slice(1) ?? []).forEach((l, i) => h.baris(y - 18 - i * 9, ...l));
}
function jagoBulanan() {
  const h1 = new Halaman();
  h1.baris(761, [315, "Laporan Keuangan Bulanan"], [415, "September 2026"], [483, "Halaman 1 dari 2"]);
  h1.baris(702, [18, "BUDI SANTOSO / 102000005678"]);
  h1.baris(601, [18, "RINGKASAN SALDO DALAM RUPIAH"]).baris(334, [18, "KANTONG PERSONAL"]);
  h1.baris(307, [18, "Nama Kantong"], [136, "Mata Uang"], [205, "Saldo Sebelumnya"], [305, "Total Pemasukan"], [396, "Total Pengeluaran"], [506, "Saldo Akhir"]);
  h1.baris(287, [18, "Kantong Utama"], [159, "IDR"], [248, "1.000,00"], [315, "+600.010,00"], [410, "-425.002,00"], [528, "176.008,00"]);
  kakiJago(h1);
  const h2 = new Halaman();
  h2.baris(761, [314, "Laporan Keuangan Bulanan"], [415, "September 2026"], [483, "Halaman 2 dari 2"]);
  bagianJago(h2, 702, "Kantong Utama", "102000005678", "1.000,00", "176.008,00");
  barisJago(h2, 615, "02 Sep 2026", "08.12", [[101, "BUDI SANTOSO"], [191, "Transfer Masuk"], [410, "+500.000,00"], [502, "501.000,00"]], [[[191, "ID# 260902-AAAA-000001"]], [[101, "ShopeePay 6280000001234"]]]);
  barisJago(h2, 574, "02 Sep 2026", "08.13", [[101, "Dana Darurat"], [191, "Tambah Uang Kantong"], [413, "-400.000,00"], [502, "101.000,00"]], [[[101, "Pindah uang antar Kantong"], [191, "ID# 260902-AAAA-000002"]]]);
  barisJago(h2, 534, "02 Sep 2026", "09.30", [[101, "BUDI SANTOSO"], [191, "Transfer Masuk"], [410, "+100.000,00"], [502, "201.000,00"]], [[[191, "ID# 260902-AAAA-000003"]], [[101, "Seabank 901000001234"]]]);
  barisJago(h2, 494, "05 Sep 2026", "12.00", [[101, "Toko Kopi Contoh"], [191, "Pembayaran QRIS"], [281, "Kopi"], [414, "-25.000,00"], [502, "176.000,00"]], [[[191, "ID# 260905-AAAA-000004"]]]);
  barisJago(h2, 454, "28 Sep 2026", "04.59", [[101, "Bunga"], [191, "Bunga"], [441, "+10,00"], [502, "176.010,00"]], [[[101, "Kantong Utama"], [191, "ID# 260928-AAAA-000005"]]]);
  barisJago(h2, 414, "28 Sep 2026", "04.59", [[101, "Pajak Bunga"], [191, "Pajak Bunga"], [442, "-2,00"], [502, "176.008,00"]], [[[101, "Kantong Utama"], [191, "ID# 260928-AAAA-000006"]]]);
  bagianJago(h2, 360, "Dana Darurat", "109000003928", "0,00", "400.800,00");
  barisJago(h2, 272, "02 Sep 2026", "08.13", [[101, "Kantong Utama"], [191, "Pindah uang antar"], [412, "+400.000,00"], [499, "400.000,00"]], [[[101, "Pindah uang antar Kantong"]], [[191, "Kantong"]], [[191, "ID# 260902-AAAA-000007"]]]);
  barisJago(h2, 222, "28 Sep 2026", "06.24", [[101, "Bunga"], [191, "Bunga"], [429, "+1.000,00"], [499, "401.000,00"]], [[[101, "Dana Darurat"], [191, "ID# 260928-AAAA-000008"]]]);
  barisJago(h2, 182, "28 Sep 2026", "06.24", [[101, "Pajak Bunga"], [191, "Pajak Bunga"], [426, "-200,00"], [500, "400.800,00"]], [[[101, "Dana Darurat"], [191, "ID# 260928-AAAA-000009"]]]);
  bagianJago(h2, 140, "Kantong Kosong", "113000008177", "0,00", "0,00");
  h2.baris(50, [18, "INFO PENTING"]).baris(40, [18, "* Dokumen ini dibuat oleh sistem dan tidak memerlukan tanda tangan."]);
  kakiJago(h2);
  return pdf(h1, h2);
}
const jb = bacaRekening(jagoBulanan());
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

// ------------------------------------------------------------ Jago riwayat

function jagoRiwayat() {
  const h = new Halaman();
  h.baris(762, [340, "Pockets Transactions History"], [469, "Halaman 1 dari 1"]);
  h.baris(721, [19, "BUDI SANTOSO"]).baris(706, [19, "Kantong Utama 102000005678"]);
  h.baris(681, [19, "Menampilkan transaksi IDR dari"], [444, "Saldo terbaru 1 Okt 2026"]);
  h.baris(668, [19, "01 Agt 2026 - 30 Sep 2026"], [504, "IDR 176.008,00"]);
  h.baris(637, [19, "Tanggal & Waktu"], [79, "Sumber/Tujuan"], [175, "Rincian Transaksi"], [268, "Catatan"], [421, "Jumlah"], [526, "Saldo"]);
  h.baris(616, [19, "Agustus 2026"]);
  barisJago(h, 594, "15 Agt 2026", "11.02", [[79, "ANI WIJAYA"], [175, "Transfer Masuk"], [401, "+1.000,00"], [505, "1.000,00"]], [[[175, "ID# 000000001"]], [[79, "BCA 1234567890"]]], 19);
  h.baris(560, [19, "September 2026"]);
  // Bulan yang sama dengan laporan bulanan: ID# beda (BI-Fast), saldo & jam sama.
  barisJago(h, 540, "02 Sep 2026", "08.12", [[79, "BUDI SANTOSO"], [175, "Transfer Masuk"], [401, "+500.000,00"], [505, "501.000,00"]], [[[175, "ID# 260902JAGBIDJA000001"]], [[79, "ShopeePay 6280000001234"]]], 19);
  barisJago(h, 500, "02 Sep 2026", "08.13", [[79, "Dana Darurat"], [175, "Tambah Uang Kantong"], [413, "-400.000"], [505, "101.000,00"]], [[[79, "Pindah uang antar Kantong"], [175, "ID# 260902-AAAA-000002"]]], 19);
  barisJago(h, 460, "02 Sep 2026", "09.30", [[79, "BUDI SANTOSO"], [175, "Transfer Masuk"], [401, "+100.000,00"], [505, "201.000,00"]], [[[175, "ID# 260902-AAAA-000003"]], [[79, "Seabank 901000001234"]]], 19);
  barisJago(h, 420, "05 Sep 2026", "12.00", [[79, "Toko Kopi Contoh"], [175, "Pembayaran QRIS"], [268, "Kopi"], [414, "-25.000"], [505, "176.000,00"]], [[[175, "ID# 260905-AAAA-000004"]]], 19);
  barisJago(h, 380, "28 Sep 2026", "04.59", [[79, "Bunga"], [175, "Bunga"], [424, "+10,00"], [505, "176.010,00"]], [[[79, "MAIN_ACCOUNT"], [175, "ID# 260928-AAAA-000005"]]], 19);
  barisJago(h, 340, "28 Sep 2026", "04.59", [[79, "Pajak Bunga"], [175, "Pajak Bunga"], [425, "-2,00"], [505, "176.008,00"]], [[[79, "MAIN_ACCOUNT"], [175, "ID# 260928-AAAA-000006"]]], 19);
  h.baris(300, [19, "Info Penting"]).baris(290, [19, "Dokumen ini adalah daftar Riwayat Transaksi Jago kamu dan dihasilkan sesuai dengan transaksi yang dilakukan"]);
  h.baris(25, [67, "PT Bank Jago Tbk berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK) dan Bank Indonesia, serta"]).baris(19, [501, "www.jago.com"]);
  return pdf(h);
}
const jr = bacaRekening(jagoRiwayat());
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

// ------------------------------------------------------------ BRI

function bri(akhir = "730,500.00") {
  const h = new Halaman();
  h.baris(808, [458, "LAPORAN TRANSAKSI FINANSIAL"]).baris(797, [471, "STATEMENT OF FINANCIAL TRANSACTION"]);
  h.baris(727, [40, "Kepada Yth. /"], [104, "To :"]).baris(704, [331, "Periode Transaksi"], [417, ":"], [434, "01/09/26 - 30/09/26"]);
  h.baris(702, [40, "BUDI SANTOSO"]).baris(673, [40, "JALAN CONTOH 2"]);
  h.baris(620, [34, "No. Rekening"], [116, ":"], [125, "013000000004321"], [330, "Unit Kerja"], [434, "KC Contoh"]);
  h.baris(521, [37, "Tanggal Transaksi"], [170, "Uraian Transaksi"], [305, "Teller"], [382, "Debet"], [483, "Kredit"], [580, "Saldo"]);
  h.baris(511, [38, "Transaction Date"], [157, "Transaction Description"], [301, "User ID"], [381, "Debit"], [481, "Credit"], [575, "Balance"]);
  h.baris(492, [38, "01/09/26 09:00:00"], [110, "Transfer BI-Fast ke Bank Lain - 1230009876 -"], [299, "8888001"], [404, "200,000.00"], [522, "0.00"], [591, "800,000.00"]);
  h.baris(483, [110, "Budi Santoso"]);
  h.baris(462, [38, "01/09/26 09:00:00"], [110, "Transfer BI-Fast ke Bank Lain - 1230009876 -"], [299, "8888001"], [412, "2,500.00"], [522, "0.00"], [591, "797,500.00"]);
  h.baris(453, [110, "Budi Santoso"]);
  h.baris(432, [38, "05/09/26 10:00:00"], [110, "Top Up Shopee 0851xxxx234 BUDX SAXXXXX via"], [299, "8888002"], [408, "50,000.00"], [522, "0.00"], [591, "747,500.00"]);
  h.baris(422, [110, "BRImo"]);
  h.baris(401, [38, "16/09/26 23:59:59"], [110, "Admin Fee"], [412, "5,000.00"], [522, "0.00"], [597, "742,500.00"]);
  h.baris(380, [38, "20/09/26 08:00:00"], [110, "QRIS000000000001#9360000000000000001"], [299, "8888003"], [408, "12,000.00"], [522, "0.00"], [597, "730,500.00"]);
  h.baris(43, [25, "AASGL17_000000000000_e-"]).baris(41, [576, "Created By BRIMO"]).baris(31, [563, "10/01/2026 23:16:52"]);
  const h2 = new Halaman();
  h2.baris(683, [86, "Saldo Awal"], [218, "Total Transaksi Debet"], [373, "Total Transaksi Kredit"], [543, "Saldo Akhir"]);
  h2.baris(673, [75, "Opening Balance"], [215, "Total Debit Transaction"], [368, "Total Credit Transaction"], [534, "Closing Balance"]);
  h2.baris(655, [121, "1,000,000.00"], [275, "269,500.00"], [425, "0.00"], [589, akhir]);
  h2.baris(41, [576, "Created By BRIMO"]);
  return pdf(h, h2);
}
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
  assert.deepEqual(r.belumDipetakan, [{ kunci: "seabank:1234", nama: "SeaBank …1234", bank: "seabank", nomorAkhir: "1234" }]);
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

console.log("uji:rekening lulus");
