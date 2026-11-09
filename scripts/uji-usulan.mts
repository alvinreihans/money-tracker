/**
 * Uji alat ubah asisten tahap B (SPEC-asisten-agen §3) dengan data buatan:
 * usulan disusun tanpa menulis apa pun, divalidasi (kantong/kategori harus
 * ada, angka bank tidak diubah, rekening koran hanya dihapus bila ada
 * kembarannya, batas 200), saldo sebelum → sesudah, dan isian RPC
 * terapkan_usulan. RPC-nya sendiri (atomik, updated_at, urungkan, isolasi)
 * diuji di scripts/uji-isolasi.mjs.
 *
 * Pemakaian: npm run uji:usulan
 */
import assert from "node:assert/strict";
import type { Kantong } from "../src/lib/kantong.ts";
import {
  cariGabung,
  idsDariArgumen,
  MAKS_USULAN,
  usulBuatKantong,
  usulCatat,
  usulHapus,
  usulJadikanPindah,
  usulSelesaikanDraft,
  usulUbahTransaksi,
  type KonteksUsulan,
  type TxUsulan,
} from "../src/lib/usulan.ts";
import { labelLangkah, NAMA_FUNGSI, DEKLARASI_FUNGSI, tautanDari } from "../src/lib/tanya.ts";

const kantong = (id: string, name: string, kind: Kantong["kind"], extra: Partial<Kantong> = {}): Kantong => ({
  id,
  name,
  kind,
  aliases: null,
  saldo_awal: 0,
  saldo_per: "2026-01-01",
  saldo_sejak: "2026-01-01T00:00:00+07:00",
  ...extra,
});
const BCA = "00000000-0000-4000-8000-000000000001";
const GOPAY = "00000000-0000-4000-8000-000000000002";
const DEPO = "00000000-0000-4000-8000-000000000003";
const k: KonteksUsulan = {
  hariIni: "2026-11-09",
  kantong: [kantong(BCA, "BCA", "bank"), kantong(GOPAY, "GoPay", "ewallet"), kantong(DEPO, "Deposito", "simpanan", { macam_simpanan: "deposito", induk_id: BCA })],
  saldo: new Map([
    [BCA, 5_000_000],
    [GOPAY, 100_000],
    [DEPO, 2_000_000],
  ]),
  kategori: [
    { type: "expense", slug: "food", name: "Makan" },
    { type: "expense", slug: "transport", name: "Transportasi" },
    { type: "expense", slug: "other", name: "Lainnya" },
    { type: "income", slug: "other", name: "Lainnya" },
    { type: "income", slug: "salary", name: "Gaji" },
  ],
};
let n = 0;
const id = () => `10000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const tx = (isi: Partial<TxUsulan>): TxUsulan => ({
  id: id(),
  amount: 10000,
  type: "expense",
  status: "confirmed",
  source: "text",
  merchant: null,
  description: null,
  category: "food",
  kantong_id: BCA,
  kantong_tujuan_id: null,
  transaction_date: "2026-11-05",
  waktu: null,
  updated_at: "2026-11-05T10:00:00.000000+00:00",
  ...isi,
});

// ---------------------------------------------------------------- deklarasi & label
for (const nama of ["usul_buat_kantong", "usul_jadikan_pindah", "usul_ubah_transaksi", "usul_hapus", "usul_selesaikan_draft", "usul_catat"] as const) {
  assert.ok(NAMA_FUNGSI.includes(nama), nama);
  assert.ok(DEKLARASI_FUNGSI.some((d) => d.name === nama), `deklarasi ${nama}`);
  assert.equal(tautanDari(nama, {}, { hariIni: k.hariIni, kantong: [], kategori: [] }), null, "usulan tanpa tautan");
  assert.match(labelLangkah(nama, { ke_kantong: "DANA", nama: "DANA" }, { hariIni: k.hariIni, kantong: [], kategori: [] }), /^Menyiapkan/);
}
assert.deepEqual(idsDariArgumen([BCA, BCA.toUpperCase(), "bukan-id", 5]), [BCA], "id: hanya uuid, unik");

// ---------------------------------------------------------------- buat kantong
{
  assert.match(String(usulBuatKantong({ nama: "bca" }, k).untukModel.error), /sudah ada/, "nama yang sudah ada ditolak");
  assert.match(String(usulBuatKantong({ nama: "Kredivo" }, k).untukModel.error), /aplikasi/, "paylater/kartu kredit tidak lewat asisten");
  const h = usulBuatKantong({ nama: "DANA", saldo_awal: 50000 }, k);
  assert.equal(h.usulan?.isian.kantong_baru?.jenis, "ewallet", "jenis ditebak dari nama");
  assert.equal(h.usulan?.isian.kantong_baru?.saldo_awal, 50000);
  assert.deepEqual(h.usulan?.saldo, [{ nama: "DANA", sebelum: null, sesudah: 50000 }]);
  assert.match(String(h.untukModel.status), /BELUM DITERAPKAN/);
}

// ---------------------------------------------------------------- ubah transaksi
{
  const grab1 = tx({ merchant: "Grab", amount: 25000 });
  const grab2 = tx({ merchant: "Grab", amount: 30000, source: "statement", ref_bank: "bri:1" });
  const grab3 = tx({ merchant: "Grab", amount: 15000, category: "transport" });
  const pindah = tx({ type: "transfer", category: "other", kantong_tujuan_id: GOPAY, amount: 50000 });
  const draft = tx({ status: "needs_review", merchant: "Grab" });
  const h = usulUbahTransaksi([grab1, grab2, grab3, pindah, draft], { isian: { kategori: "Transportasi" } }, k);
  assert.equal(h.usulan?.jumlah, 2, "yang sudah Transportasi, pindah kantong, dan draft tidak ikut");
  assert.deepEqual(
    h.usulan?.isian.ubah?.map((u) => [u.id, u.isian]),
    [
      [grab1.id, { category: "transport" }],
      [grab2.id, { category: "transport" }],
    ],
  );
  assert.equal(h.usulan?.baris[0].sebelum, "Makan");
  assert.equal(h.usulan?.baris[0].sesudah, "Transportasi");
  assert.deepEqual(h.usulan?.saldo, [], "kategori tidak menggeser saldo");
  assert.match(h.usulan!.judul, /Ubah 2 transaksi: kategori jadi Transportasi/);

  // Rekening koran: nominal, tanggal & kantong angka bank — dilewati, bagian lain tetap.
  const b = usulUbahTransaksi([grab2], { isian: { nominal: 31000, merchant: "Grab Bike" } }, k);
  assert.deepEqual(b.usulan?.isian.ubah?.[0].isian, { merchant: "Grab Bike" });
  assert.ok(b.usulan?.catatan.some((c) => /rekening koran/.test(c)));
  const b2 = usulUbahTransaksi([grab2], { isian: { nominal: 31000 } }, k);
  assert.equal(b2.usulan, undefined, "hanya nominal bank → tidak ada usulan");

  // Nominal & kantong biasa → saldo bergeser.
  const s = usulUbahTransaksi([grab1], { isian: { kantong: "GoPay", nominal: 20000 } }, k);
  assert.deepEqual(s.usulan?.isian.ubah?.[0].isian, { amount: 20000, kantong_id: GOPAY });
  assert.deepEqual(s.usulan?.saldo, [
    { nama: "BCA", sebelum: 5_000_000, sesudah: 5_025_000 },
    { nama: "GoPay", sebelum: 100_000, sesudah: 80_000 },
  ]);

  assert.match(String(usulUbahTransaksi([grab1], { isian: { kantong: "Jenius" } }, k).untukModel.error), /tidak ada/, "kantong yang tidak ada");
  assert.match(String(usulUbahTransaksi([grab1], { isian: { kantong: "Deposito" } }, k).untukModel.error), /tidak ada/, "deposito bukan pilihan");
  assert.match(String(usulUbahTransaksi([grab1], { isian: { kategori: "Jajan" } }, k).untukModel.error), /Kategori "Jajan" tidak ada/);
  assert.match(String(usulUbahTransaksi([grab1], { isian: {} }, k).untukModel.error), /isian kosong/);
  assert.match(String(usulUbahTransaksi([grab1], { isian: { nominal: -5 } }, k).untukModel.error), /lebih dari 0/);

  // Batas 200: dipotong, sisanya disebut.
  const banyak = Array.from({ length: MAKS_USULAN + 1 }, () => tx({ merchant: "Grab" }));
  const p = usulUbahTransaksi(banyak, { isian: { kategori: "transport" } }, k);
  assert.equal(p.usulan?.isian.ubah?.length, MAKS_USULAN);
  assert.ok(p.usulan?.catatan.some((c) => /200 transaksi pertama; 1 lainnya/.test(c)));
}

// ---------------------------------------------------------------- jadikan pindah
{
  const top1 = tx({ merchant: "Top Up DANA", amount: 100000, source: "statement", ref_bank: "bri:t1", transaction_date: "2026-11-02" });
  const balik = tx({ type: "income", category: "other", merchant: "Tarik dari DANA", amount: 150000, transaction_date: "2026-11-03" });
  const top2 = tx({ merchant: "Top Up DANA", amount: 200000, transaction_date: "2026-11-04" });
  const tanpaKantong = usulJadikanPindah([top1], [], { ke_kantong: "DANA" }, k);
  assert.match(String(tanpaKantong.untukModel.error), /belum ada/);
  assert.match(String(tanpaKantong.untukModel.saran), /buat_kantong/);

  const h = usulJadikanPindah([top1, balik, top2], [], { ke_kantong: "DANA", buat_kantong: "ewallet" }, k);
  const u = h.usulan!;
  // Saldo DANA berjalan: +100.000, −150.000 (minus 50.000), +200.000 → saldo awal 50.000 supaya tidak minus.
  assert.equal(u.isian.kantong_baru?.saldo_awal, 50000);
  assert.equal(u.isian.kantong_baru?.saldo_sejak, "2026-11-02T00:00:00+07:00", "berlaku sejak transaksi paling awal");
  assert.deepEqual(
    u.isian.pindah?.map((p) => [p.id, p.ke, p.gabung]),
    [
      [top1.id, "baru", null],
      [balik.id, "baru", null],
      [top2.id, "baru", null],
    ],
  );
  assert.deepEqual(u.saldo, [{ nama: "DANA", sebelum: null, sesudah: 200000 }], "saldo BCA tetap; DANA = 50.000 + 100.000 − 150.000 + 200.000");
  assert.match(u.judul, /Buat kantong DANA dan jadikan 3 transaksi pindah kantong ke\/dari DANA/);
  assert.equal(u.baris[0].sesudah, "Pindah BCA → DANA");
  assert.equal(u.baris[1].sesudah, "Pindah DANA → BCA");

  // Kantong yang sudah ada: sisi lain di GoPay digabung (nominal sama, ±1 hari).
  const top3 = tx({ merchant: "Top Up GoPay", amount: 75000, transaction_date: "2026-11-06", waktu: "10:15:00" });
  const masukGopay = tx({ type: "income", category: "other", kantong_id: GOPAY, amount: 75000, transaction_date: "2026-11-07", waktu: "10:15:00" });
  const lainGopay = tx({ type: "income", category: "other", kantong_id: GOPAY, amount: 75000, transaction_date: "2026-11-07", waktu: "11:00:00" });
  assert.equal(cariGabung([top3], [lainGopay]).size, 0, "menit beda → bukan pasangan");
  const g = usulJadikanPindah([top3], [lainGopay, masukGopay], { ke_kantong: "gopay" }, k);
  assert.deepEqual(g.usulan?.isian.pindah?.[0].gabung, { id: masukGopay.id, updated_at: masukGopay.updated_at });
  assert.equal(g.usulan?.isian.kantong_baru, undefined);
  assert.deepEqual(g.usulan?.saldo, [], "pengeluaran + pemasukan terpisah → satu pindah: saldo kedua kantong tetap");
  const tanpaGabung = usulJadikanPindah([top3], [], { ke_kantong: "GoPay" }, k);
  assert.deepEqual(tanpaGabung.usulan?.saldo, [{ nama: "GoPay", sebelum: 100000, sesudah: 175000 }]);

  const sudah = usulJadikanPindah([tx({ type: "transfer", kantong_tujuan_id: GOPAY }), tx({ cicilan_id: id() })], [], { ke_kantong: "GoPay" }, k);
  assert.equal(sudah.untukModel.jumlah_transaksi, 0, "pindah kantong & cicilan dilewati");
  assert.match(String(usulJadikanPindah([top1], [], { ke_kantong: "Deposito" }, k).untukModel.error), /belum ada/, "deposito bukan tujuan");
}

// ---------------------------------------------------------------- hapus
{
  const rek = tx({ merchant: "Indomaret", amount: 150000, source: "statement", ref_bank: "bri:d1", transaction_date: "2026-11-06" });
  const ketik = tx({ merchant: "Indomaret", amount: 150000, transaction_date: "2026-11-06" });
  const tunggal = tx({ merchant: "Bank fee", amount: 6500, source: "statement", ref_bank: "bri:f1" });
  const dipecah = tx({ merchant: "Superindo", amount: 90000 });
  const h = usulHapus([ketik], [rek, ketik], new Set(), k);
  assert.deepEqual(h.usulan?.isian.hapus, [{ id: ketik.id, updated_at: ketik.updated_at }]);
  assert.deepEqual(h.usulan?.saldo, [{ nama: "BCA", sebelum: 5_000_000, sesudah: 5_150_000 }]);
  assert.match(h.usulan!.baris[0].sesudah!, /kembarannya tetap/);
  const r = usulHapus([rek], [rek, ketik], new Set(), k);
  assert.equal(r.usulan?.jumlah, 1, "rekening koran dengan kembaran boleh");
  const keduanya = usulHapus([rek, ketik], [rek, ketik], new Set(), k);
  assert.deepEqual(keduanya.usulan?.isian.hapus?.map((x) => x.id), [ketik.id], "kembarannya ikut dihapus → rekening koran dilewati");
  const t = usulHapus([tunggal, dipecah], [tunggal], new Set([dipecah.id]), k);
  assert.equal(t.usulan, undefined);
  assert.equal((t.untukModel.catatan as string[]).length, 2, "rekening koran tanpa kembaran & yang dipecah dilewati");
}

// ---------------------------------------------------------------- selesaikan draft & catat
{
  const d = tx({ status: "needs_review", kantong_id: null, merchant: "Warung", amount: 30000 });
  assert.match(String(usulSelesaikanDraft(d, {}, k).untukModel.error), /belum diisi/);
  assert.match(String(usulSelesaikanDraft(tx({}), {}, k).untukModel.error), /tidak ditemukan/, "bukan draft");
  assert.match(String(usulSelesaikanDraft(tx({ status: "needs_review", amount: 0 }), {}, k).untukModel.error), /belum terbaca/);
  const h = usulSelesaikanDraft(d, { isian: { kantong: "GoPay", jam: "12.30" } }, k);
  assert.deepEqual(h.usulan?.isian.draft?.[0].isian, { kantong_id: GOPAY, waktu: "12:30" });
  assert.deepEqual(h.usulan?.saldo, [{ nama: "GoPay", sebelum: 100000, sesudah: 70000 }], "draft belum dihitung → sesudah disimpan dihitung");

  assert.match(String(usulCatat({ jenis: "keluar", nominal: 25000 }, k, "tadi bakso 25rb").untukModel.error), /belum disebut/);
  assert.match(String(usulCatat({ jenis: "keluar", nominal: 0, kantong: "BCA" }, k, "").untukModel.error), /nominal/);
  const c = usulCatat({ jenis: "keluar", nominal: 25000, kategori: "Makan", merchant: "Bakso", kantong: "gopay", jam: "19:00" }, k, "tadi bakso 25rb pakai gopay");
  assert.deepEqual(c.usulan?.isian.sisip?.[0], {
    type: "expense",
    amount: 25000,
    category: "food",
    merchant: "Bakso",
    description: null,
    kantong_id: GOPAY,
    kantong_tujuan_id: null,
    transaction_date: "2026-11-09",
    waktu: "19:00",
    teks: "tadi bakso 25rb pakai gopay",
  });
  assert.deepEqual(c.usulan?.saldo, [{ nama: "GoPay", sebelum: 100000, sesudah: 75000 }]);
  const lain = usulCatat({ jenis: "keluar", nominal: 5000, kategori: "Jajan", kantong: "BCA", tanggal: "2027-01-01" }, k, "");
  assert.equal(lain.usulan?.isian.sisip?.[0].category, "other", "kategori tak dikenal → Lainnya");
  assert.equal(lain.usulan?.isian.sisip?.[0].transaction_date, "2026-11-09", "tanggal masa depan → hari ini");
  assert.match(String(usulCatat({ jenis: "pindah", nominal: 5000, kantong: "BCA", kantong_tujuan: "BCA" }, k, "").untukModel.error), /berbeda/);
}

console.log("✓ usulan: deklarasi & langkah usul_*, buat kantong, ubah transaksi (angka bank dilewati, batas 200), jadikan pindah (+ kantong baru dengan saldo awal tidak minus, gabung sisi lain), hapus (kembaran rekening koran, pecahan), selesaikan draft, catat, saldo sebelum → sesudah");
