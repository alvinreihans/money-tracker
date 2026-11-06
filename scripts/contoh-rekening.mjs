/**
 * Rekening koran BUATAN (bukan data user) untuk uji impor rekening koran:
 * potongan teks dengan posisi x/y yang meniru tata letak asli SeaBank, Jago
 * (bulanan & riwayat), dan BRI. Dipakai scripts/uji-rekening.mts (teks
 * langsung) dan e2e/impor-rekening.mjs (digambar jadi PDF dengan pdf-lib).
 * Tiap fungsi mengembalikan halaman: { items: { x, y, s }[] }[].
 */

/** Satu halaman: potongan teks di posisi PDF (titik, kiri-bawah = 0). */
export class Halaman {
  items = [];
  baris(y, ...items) {
    for (const [x, s] of items) this.items.push({ x, y, s });
    return this;
  }
}

// ------------------------------------------------------------ SeaBank
/** Satu baris transaksi SeaBank: pihak di atas, tanggal-nominal-saldo, lalu rekening & jenis di bawah. */
function barisSea(h, y, r) {
  r.atas.forEach((t, i) => h.baris(y + 6 + (r.atas.length - 1 - i) * 10, [139, t]));
  h.baris(y, [46, r.tgl], ...(r.tengah ? [[139, r.tengah]] : []), [r.x, r.n], [475, r.saldo]);
  r.bawah.forEach((t, i) => h.baris(y - 7 - i * 12, [139, t]));
}
function kepalaSea(h, hal) {
  h.baris(755, [429, "BANK STATEMENT"]).baris(742, [396, "S/N S01-000000CONTOH"]).baris(729, [461, "01 OCT 2026"]);
  h.baris(40, [464, "page"], [492, String(hal)], [501, "of"], [514, "2"]);
}
const judulSea = [[46, "DATE"], [139, "TRANSACTION"], [269, "OUTGOING"], [308, "(IDR)"], [366, "INCOMING"], [405, "(IDR)"], [447, "END BALANCE"], [498, "(IDR)"]];
export function seabank(akhir = "911.040") {
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
  return [h1, h2];
}


// ------------------------------------------------------------ Jago bulanan

const kakiJago = (h) =>
  h.baris(24, [103, "PT Bank Jago Tbk berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK) dan Bank Indonesia, serta"]).baris(19, [498, "www.jago.com"]).baris(16, [103, "merupakan peserta penjaminan Lembaga Penjamin Simpanan (LPS)."]);
const judulJagoBulanan = [[18, "Tanggal & Waktu"], [101, "Sumber/Tujuan"], [191, "Rincian Transaksi"], [281, "Catatan"], [435, "Jumlah"], [525, "Saldo"]];
function bagianJago(h, y, nama, id, awal, akhir) {
  h.baris(y + 2, [299, "Saldo Sebelumnya"], [518, awal]).baris(y, [19, nama]);
  h.baris(y - 13, [299, "Total Pemasukan"], [487, "+0,00"]).baris(y - 15, [19, `ID Kantong ${id}`]);
  h.baris(y - 27, [299, "Total Pengeluaran"], [487, "-0,00"]);
  h.baris(y - 41, [19, "Akun Aktif, mulai"], [81, "04 May 2022"], [191, "Mata Uang Dalam IDR"], [299, "Saldo Akhir"], [521, akhir]);
  h.baris(y - 67, ...judulJagoBulanan);
}
/** Baris Jago: tanggal + sel-sel, jam di baris berikutnya, lalu baris lanjutan. */
function barisJago(h, y, tgl, jam, sel, lanjut = [], xTgl = 18) {
  h.baris(y, [xTgl, tgl], ...sel);
  h.baris(y - 9, [xTgl, jam], ...(lanjut[0] ?? []));
  (lanjut.slice(1) ?? []).forEach((l, i) => h.baris(y - 18 - i * 9, ...l));
}
export function jagoBulanan() {
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
  return [h1, h2];
}

// ------------------------------------------------------------ Jago riwayat

export function jagoRiwayat() {
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
  return [h];
}

// ------------------------------------------------------------ BRI

export function bri(akhir = "730,500.00") {
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
  return [h, h2];
}
