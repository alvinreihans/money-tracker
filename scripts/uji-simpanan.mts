/**
 * Uji simpanan (SPEC-simpanan): jatuh tempo deposito (hari & bulan), bunga
 * kotor/pajak/bersih, tiga jenis perpanjangan, saldo gabungan induk &
 * rinciannya, dan pilihan kantong tanpa deposito.
 *
 * Pemakaian: npm run uji:simpanan
 */
import assert from "node:assert/strict";
import { kantongSumber, kantongUang } from "../src/lib/pinjaman.ts";
import { ringkasSaldo } from "../src/lib/tanya.ts";
import {
  hasilJatuhTempo,
  hitungBunga,
  jatuhTempoDeposito,
  kantongDeposito,
  labelKantong,
  menungguCek,
  namaDeposito,
  pajakBawaan,
  pajakBerlaku,
  patokanDeposito,
  periodeAktif,
  periodeDeposito,
  rincianInduk,
  ringkasDisisihkan,
  susunKantong,
  teksDeposito,
  teksPratinjau,
  teksSelisih,
  urungRekening,
  validasiDeposito,
  type PeriodeDeposito,
} from "../src/lib/simpanan.ts";

/** fmtIDR memakai spasi tak terputus ("Rp 500"). */
const sp = (t: string | null | undefined) => t?.replace(/ /g, " ") ?? t;

// --- Jatuh tempo: hari
assert.equal(jatuhTempoDeposito("2026-11-06", 14, "hari"), "2026-11-20", "flash sale 14 hari");
assert.equal(jatuhTempoDeposito("2026-12-25", 14, "hari"), "2027-01-08", "melewati tahun");
assert.equal(jatuhTempoDeposito("2026-11-06", 1, "hari"), "2026-11-07", "minimal 1 hari");

// --- Jatuh tempo: bulan (tanggal sama, bulan pendek mundur ke hari terakhir)
assert.equal(jatuhTempoDeposito("2026-11-06", 1, "bulan"), "2026-12-06");
assert.equal(jatuhTempoDeposito("2026-11-06", 12, "bulan"), "2027-11-06");
assert.equal(jatuhTempoDeposito("2027-01-31", 1, "bulan"), "2027-02-28");
assert.equal(jatuhTempoDeposito("2028-01-31", 1, "bulan"), "2028-02-29", "kabisat");
assert.equal(jatuhTempoDeposito("2026-08-31", 3, "bulan"), "2026-11-30");
// Perpanjangan dari 28 Feb tetap kembali ke tanggal 31 (patokan periode ke-1).
assert.equal(jatuhTempoDeposito("2027-02-28", 1, "bulan", 31), "2027-03-31");
const per = (p: Partial<PeriodeDeposito>): PeriodeDeposito => ({
  id: "p1", deposito_id: "d", ke: 1, mulai: "2026-11-06", jatuh_tempo: "2026-12-06", pokok: 2000000,
  bunga_kotor: 7397, pajak: 0, bunga_bersih: 7397, bunga_diterima: null, dievaluasi_pada: null, dicairkan_awal: false, ...p,
});
assert.equal(patokanDeposito([per({ ke: 2, mulai: "2027-02-28" }), per({ ke: 1, mulai: "2027-01-31" })]), 31);

// --- Bunga kotor / pajak / bersih (hari sebenarnya ÷ 365, dibulatkan)
assert.deepEqual(hitungBunga(2000000, 4.5, 0, "2026-11-06", "2026-12-06"), { hari: 30, bunga_kotor: 7397, pajak: 0, bunga_bersih: 7397 });
assert.deepEqual(hitungBunga(10000000, 6, 20, "2026-11-06", "2026-11-20"), { hari: 14, bunga_kotor: 23014, pajak: 4603, bunga_bersih: 18411 });
assert.equal(pajakBawaan(7500000), 0, "≤ Rp 7,5 jt bebas pajak");
assert.equal(pajakBawaan(7500001), 20, "> Rp 7,5 jt pajak 20%");
const d1 = { bunga_persen: 4.5, tenor: 1, satuan_tenor: "bulan" as const, pajak_persen: 0 };
assert.equal(
  sp(teksPratinjau(periodeDeposito(d1, "2026-11-06", 2000000))),
  "Jatuh tempo 6 Des 2026 (30 hari) · bunga ± Rp 7.397 · pajak Rp 0 · bersih Rp 7.397",
);

// --- Tiga jenis perpanjangan
const aturan = (perpanjangan: "sekali" | "pokok" | "pokok_bunga") => ({ ...d1, perpanjangan });
const p1 = per({});
const sekali = hasilJatuhTempo(aturan("sekali"), p1, 7350);
assert.ok(sekali.cair && !sekali.bungaKeDeposito && sekali.baru === null, "sekali saja: cair, bunga ke induk");
assert.equal(sp(sekali.keterangan), "Bunga deposito ke-1 · kotor Rp 7.397, pajak Rp 0");
const pokok = hasilJatuhTempo(aturan("pokok"), p1, 7350, 6);
assert.ok(!pokok.cair && !pokok.bungaKeDeposito, "tanpa bunga: bunga ke induk");
assert.deepEqual([pokok.baru?.mulai, pokok.baru?.jatuh_tempo, pokok.baru?.pokok], ["2026-12-06", "2027-01-06", 2000000]);
const pb = hasilJatuhTempo(aturan("pokok_bunga"), p1, 7350, 6);
assert.ok(!pb.cair && pb.bungaKeDeposito, "dengan bunga: bunga ke deposito");
assert.equal(pb.baru?.pokok, 2007350, "pokok + bunga diterima");
assert.equal(pb.baru?.bunga_kotor, Math.round((2007350 * 4.5 * 31) / 100 / 365));

// Pajak otomatis mengikuti pokok tiap periode; yang diubah user tetap.
const auto = { ...aturan("pokok_bunga"), pajak_otomatis: true };
const dekat = per({ pokok: 7495000 });
const naik = hasilJatuhTempo(auto, dekat, 10000, 6).baru!;
assert.equal(naik.pokok, 7505000);
assert.equal(naik.pajak, Math.round(naik.bunga_kotor * 0.2), "pokok baru > Rp 7,5 jt → pajak 20%");
assert.equal(periodeDeposito({ ...d1, pajak_persen: 20, pajak_otomatis: true }, "2026-11-06", 7500000).pajak, 0, "kembali 0% bila pokok ≤ Rp 7,5 jt");
const tetap = hasilJatuhTempo({ ...auto, pajak_persen: 0, pajak_otomatis: false }, dekat, 10000, 6).baru!;
assert.equal(tetap.pajak, 0, "pajak yang diubah user tetap");
assert.equal(pajakBerlaku({ pajak_persen: 10, pajak_otomatis: false }, 9000000), 10);
assert.equal(pajakBerlaku({ pajak_persen: 0 }, 9000000), 20, "data tanpa tanda = otomatis");

// --- Selisih & status
assert.equal(sp(teksSelisih(7350, 7397)), "Bank memberi Rp 7.350, beda −Rp 47 dari perhitungan.");
assert.equal(sp(teksSelisih(7400, 7397)), "Bank memberi Rp 7.400, beda +Rp 3 dari perhitungan.");
assert.equal(sp(teksSelisih(7397, 7397)), "Bank memberi Rp 7.397, sama dengan perhitungan.");
assert.ok(menungguCek(p1, "2026-12-06") && !menungguCek(p1, "2026-12-05"));
assert.ok(!menungguCek({ ...p1, bunga_diterima: 7350 }, "2026-12-10"));
assert.equal(periodeAktif([p1, per({ id: "p2", ke: 2 }), per({ id: "lain", deposito_id: "x", ke: 5 })], "d")?.id, "p2");
assert.equal(teksDeposito({ bunga_persen: 4.5 }, p1, "2026-11-10"), "Deposito · 4,5%/th · jatuh tempo 6 Des");
assert.equal(teksDeposito({ bunga_persen: 4.5 }, p1, "2026-12-06"), "Jatuh tempo 6 Des · menunggu cek bunga");
assert.equal(namaDeposito("Deposito", "SeaBank"), "Deposito SeaBank");
assert.equal(namaDeposito("Deposito SeaBank", "SeaBank"), "Deposito SeaBank");

// --- Saldo gabungan & rincian
const K = (id: string, kind: string, saldo: number, lain: Record<string, unknown> = {}) => ({ id, name: id, kind, saldo, ...lain });
const daftar = [
  K("SeaBank", "bank", 500000),
  K("Deposito", "simpanan", 2000000, { induk_id: "SeaBank", macam_simpanan: "deposito" }),
  K("BCA", "bank", 7000000),
  K("Dana darurat", "tujuan", 3000000, { induk_id: "BCA" }),
  K("Liburan", "tujuan", 400000),
  K("Lama", "simpanan", 0, { induk_id: "SeaBank", macam_simpanan: "deposito" }),
];
const susun = susunKantong(daftar, new Set(["Lama"]));
assert.deepEqual(susun.map((b) => [b.k.id, b.saldo, sp(b.rincian)]), [
  ["SeaBank", 2500000, "Rp 500.000 + Deposito Rp 2.000.000"],
  ["BCA", 10000000, "Rp 7.000.000 + Dana darurat Rp 3.000.000"],
  ["Liburan", 400000, null],
]);
assert.equal(
  susun.reduce((n, b) => n + b.saldo, 0),
  daftar.filter(kantongUang).reduce((n, k) => n + k.saldo, 0),
  "total aset tetap: tiap kantong dihitung sekali",
);
assert.equal(sp(rincianInduk(500000, [{ name: "A", saldo: 1 }, { name: "B", saldo: 2 }])), "Rp 500.000 + A Rp 1 + B Rp 2");
assert.equal(sp(rincianInduk(500000, [{ name: "A", saldo: 1000 }, { name: "B", saldo: 2000 }, { name: "C", saldo: 3000 }])), "Rp 500.000 + 3 simpanan Rp 6.000");

// --- Baris "Disisihkan ke tujuan" (U3)
assert.deepEqual(ringkasDisisihkan([{ saldo: 3000000, induk: "BCA" }]), { total: null, keterangan: "1 tujuan · disimpan di BCA" });
assert.deepEqual(ringkasDisisihkan([{ saldo: 3000000, induk: "BCA" }, { saldo: 400000, induk: null }]), { total: 400000, keterangan: "2 tujuan · 1 disimpan di BCA" });
assert.deepEqual(ringkasDisisihkan([{ saldo: 0, induk: null }, { saldo: 500000, induk: null }]), { total: 500000, keterangan: "2 tujuan tabungan" });

// --- Pilihan kantong: pocket menyebut induknya, deposito tidak tampil
const pocket = K("Pocket Liburan", "simpanan", 100000, { induk_id: "SeaBank", macam_simpanan: "tabungan" });
assert.equal(labelKantong(pocket, daftar), "Pocket Liburan · di SeaBank");
assert.equal(labelKantong(daftar[0], daftar), "SeaBank");
assert.ok(kantongDeposito(daftar[1]) && !kantongDeposito(pocket));
assert.ok(kantongSumber(pocket) && !kantongSumber(daftar[1]), "deposito bukan sumber bayar");
assert.ok(kantongUang(daftar[1]), "deposito tetap ikut total aset");

// --- Tanya AI saldo_kantong: simpanan & tujuan di dalam kantong, info deposito; yang selesai tidak ikut
const depo = { kantong_id: "Deposito", bunga_persen: "4.50", tenor: 1, satuan_tenor: "bulan" as const, pajak_persen: 0, perpanjangan: "pokok" as const, selesai: false };
const r = ringkasSaldo(daftar, new Map(daftar.map((k) => [k.id, k.saldo])), {
  deposito: [depo, { ...depo, kantong_id: "Lama", selesai: true }],
  periode: [per({ deposito_id: "Deposito" })],
  hariIni: "2026-12-06",
});
const sea = r.kantong.find((k) => k.nama === "SeaBank");
// U1: `saldo` induk = gabungan (yang tampil di aplikasi & bank), saldo sendiri terpisah.
assert.deepEqual([sea?.saldo, sea?.saldo_sendiri, sea?.berisi], [2500000, 500000, ["Deposito"]]);
assert.deepEqual(r.kantong.find((k) => k.nama === "Deposito")?.deposito, {
  // U2: tanggal untuk dibaca.
  bunga_persen_per_tahun: 4.5, jatuh_tempo: "6 Desember 2026", estimasi_bunga_bersih: 7397, saat_jatuh_tempo: "Diperpanjang tanpa bunga", menunggu_cek_bunga: true,
});
assert.equal(r.kantong.find((k) => k.nama === "Deposito")?.di_dalam, "SeaBank");
assert.ok(!r.kantong.some((k) => k.nama === "Lama"), "deposito selesai tidak ikut");
assert.equal(r.tujuan_tabungan.find((t) => t.nama_tujuan === "Dana darurat")?.disimpan_di, "BCA");
assert.equal(r.total_aset, 12900000);

// --- Isian deposito
const isian = { bunga: "4,5", tenor: "14", satuan: "hari" as const, mulai: "2026-11-06", pajak: "0" };
assert.deepEqual(validasiDeposito(isian), { ok: true, data: { bunga_persen: 4.5, tenor: 14, satuan_tenor: "hari", pajak_persen: 0, mulai: "2026-11-06" } });
assert.equal((validasiDeposito({ ...isian, tenor: "0" }) as { kolom: string }).kolom, "tenor", "minimal 1 hari");
assert.equal((validasiDeposito({ ...isian, bunga: "" }) as { kolom: string }).kolom, "bunga");
assert.equal((validasiDeposito({ ...isian, bunga: "30" }) as { kolom: string }).kolom, "bunga");
assert.equal((validasiDeposito({ ...isian, pajak: "120" }) as { kolom: string }).kolom, "pajak");

// --- Periode yang ditutup dari rekening koran (SPEC-deposito-jatuh-tempo §4): bisa diurungkan
// selama perpanjangannya belum dicek; yang dievaluasi di aplikasi tidak lewat sini.
{
  const per = (ke: number, dicek: boolean, dari_rekening = false) => ({ ke, bunga_diterima: dicek ? 1000 : null, dicairkan_awal: false, dari_rekening });
  assert.equal(urungRekening([per(1, true, true), per(2, false)])?.ke, 1);
  assert.equal(urungRekening([per(1, true, true)])?.ke, 1, "cair: tanpa perpanjangan");
  assert.equal(urungRekening([per(1, true, false), per(2, false)]), null, "evaluasi di aplikasi");
  assert.equal(urungRekening([per(1, true, true), per(2, true, false), per(3, false)]), null, "yang terakhir ditutup bukan dari rekening koran");
  assert.equal(urungRekening([per(1, false)]), null);
}

console.log("✓ simpanan: isian deposito, jatuh tempo hari/bulan, bunga & pajak, perpanjangan, saldo gabungan, pilihan kantong, pajak otomatis per periode, saldo_kantong Tanya AI, urungkan penutupan dari rekening koran");
