/**
 * Uji Lend & Borrow dan cicilan (src/lib/pinjaman.ts).
 *
 * Pemakaian: npm run uji:pinjaman
 */
import assert from "node:assert/strict";
import { hitungSaldo, type Kantong } from "../src/lib/kantong.ts";
import {
  arahPindah,
  bagiRata,
  jadwalCicilan,
  rencanaPaylater,
  jatuhTempoKe,
  kantongUang,
  pilihCicilan,
  ringkasanPinjaman,
  SALDO_PER_PINJAMAN,
  ringkasBeranda,
  statusCicilan,
} from "../src/lib/pinjaman.ts";

// --- Jatuh tempo per bulan ---
assert.equal(jatuhTempoKe("2026-10-15", 1), "2026-10-15");
assert.equal(jatuhTempoKe("2026-10-15", 3), "2026-12-15");
assert.equal(jatuhTempoKe("2026-10-15", 4), "2027-01-15"); // ganti tahun
assert.equal(jatuhTempoKe("2026-01-31", 2), "2026-02-28"); // Februari pendek
assert.equal(jatuhTempoKe("2028-01-31", 2), "2028-02-29"); // kabisat
assert.equal(jatuhTempoKe("2026-01-31", 3), "2026-03-31"); // kembali ke tgl 31
assert.equal(jatuhTempoKe("2026-08-31", 2), "2026-09-30");

// --- Jadwal & status cicilan ---
const hp = { tenor: 6, jatuh_tempo_awal: "2026-08-10", nominal: "500000.00" };
const jadwal = jadwalCicilan(hp, [1, 2]);
assert.equal(jadwal.length, 6);
assert.deepEqual(jadwal[2], { ke: 3, jatuhTempo: "2026-10-10", dibayar: false });
const st = statusCicilan(hp, [1, 2], "2026-10-22");
assert.equal(st.terbayar, 2);
assert.equal(st.sisa, 4);
assert.equal(st.berikutnya?.ke, 3);
assert.equal(st.telat, true); // cicilan ke-3 jatuh tempo 10 Okt, belum dibayar
assert.equal(st.sisaNominal, 2_000_000);
assert.equal(statusCicilan(hp, [1, 2, 3], "2026-10-22").telat, false);
const lunas = statusCicilan(hp, [1, 2, 3, 4, 5, 6], "2026-10-22");
assert.equal(lunas.lunas, true);
assert.equal(lunas.berikutnya, null);
// Bayar loncat (ke-2 dulu): yang berikutnya tetap ke-1.
assert.equal(statusCicilan(hp, [2], "2026-08-01").berikutnya?.ke, 1);

// --- Arah pindah kantong ---
assert.deepEqual(arahPindah("beri", "bca", "budi"), { dari: "bca", ke: "budi" });
assert.deepEqual(arahPindah("terima_bayar", "bca", "budi"), { dari: "budi", ke: "bca" });
assert.deepEqual(arahPindah("pinjam", "bri", "ibu"), { dari: "ibu", ke: "bri" });
assert.deepEqual(arahPindah("bayar", "bri", "ibu"), { dari: "bri", ke: "ibu" });

// --- Saldo kantong orang lewat rumus saldo yang sama, lalu ringkasan ---
const k = (id: string, kind: Kantong["kind"], saldo_awal = 0, saldo_per = SALDO_PER_PINJAMAN): Kantong => ({
  id, name: id, kind, aliases: null, saldo_awal, saldo_per,
});
const daftar = [k("bca", "bank", 5_000_000, "2026-10-01"), k("budi", "orang"), k("ibu", "orang"), k("andi", "orang"), k("cc", "kredit", -1_200_000, "2026-10-01")];
const tx = (amount: number, type: string, dari: string | null, ke: string | null, tanggal = "2026-10-05") => ({
  amount, type, transaction_date: tanggal, kantong_id: dari, kantong_tujuan_id: ke,
});
const saldo = hitungSaldo(daftar, [
  tx(500_000, "transfer", ...Object.values(arahPindah("beri", "bca", "budi")) as [string, string]),
  tx(200_000, "transfer", ...Object.values(arahPindah("terima_bayar", "bca", "budi")) as [string, string]),
  tx(1_000_000, "transfer", ...Object.values(arahPindah("pinjam", "bca", "ibu")) as [string, string], "2025-12-01"), // mundur
  tx(100_000, "transfer", ...Object.values(arahPindah("beri", "bca", "andi")) as [string, string]),
  tx(100_000, "transfer", ...Object.values(arahPindah("terima_bayar", "bca", "andi")) as [string, string]),
  tx(300_000, "expense", "cc", null), // belanja pakai kartu kredit
  tx(1_000_000, "transfer", "bca", "cc"), // bayar tagihan
]);
const denganSaldo = daftar.map((d) => ({ ...d, saldo: saldo.find((x) => x.id === d.id)!.saldo }));
const r = ringkasanPinjaman(denganSaldo);
assert.deepEqual(r.lend.map((x) => [x.kantong.id, x.jumlah]), [["budi", 300_000]]);
assert.deepEqual(r.borrow.map((x) => [x.kantong.id, x.jumlah]), [["ibu", 1_000_000], ["cc", 500_000]]);
assert.deepEqual(r.lunas.map((x) => x.id), ["andi"]);
assert.equal(r.totalLend, 300_000);
assert.equal(r.totalBorrow, 1_500_000);
// Total aset hanya kantong uang.
assert.deepEqual(denganSaldo.filter(kantongUang).map((x) => x.id), ["bca"]);

// --- Ringkasan kartu Beranda ---
const rb = ringkasBeranda(
  [
    { kind: "orang", name: "Budi", saldo: 300_000, jatuh_tempo: "2026-11-05" },
    { kind: "orang", name: "Ibu", saldo: -1_000_000, jatuh_tempo: null },
    { kind: "kredit", name: "Kartu", saldo: -500_000 },
    { kind: "bank", name: "BCA", saldo: 9_000_000 },
  ],
  [
    { id: "hp", nama: "HP", tenor: 6, jatuh_tempo_awal: "2026-08-10", nominal: 500_000 }, // ke-3 telat 10 Okt, ke-4 10 Nov
    { id: "tv", nama: "TV", tenor: 3, jatuh_tempo_awal: "2026-10-28", nominal: 200_000 }, // ke-1 28 Okt
    { id: "kl", nama: "Kulkas", tenor: 2, jatuh_tempo_awal: "2026-06-01", nominal: 100_000 }, // lunas
  ],
  { hp: [1, 2], kl: [1, 2] },
  "2026-10-22",
);
assert.equal(rb.totalLend, 300_000);
assert.equal(rb.totalBorrow, 1_500_000);
assert.deepEqual(rb.cicilanBulanIni, { jumlah: 2, total: 700_000 }); // HP ke-3 (telat) + TV ke-1
assert.deepEqual(rb.terdekat, { nama: "HP", tanggal: "2026-10-10", telat: true });
assert.equal(rb.ada, true);
assert.equal(ringkasBeranda([{ kind: "bank", name: "BCA", saldo: 1 }], [], {}, "2026-10-22").ada, false);

// --- Mencocokkan sebutan cicilan ke rencananya ---
const rencana = [
  { id: "hp", nama: "HP Samsung", penyedia: "Shopee PayLater", tenor: 6, jatuh_tempo_awal: "2026-08-10", nominal: 500_000 },
  { id: "tv", nama: "TV", penyedia: "Shopee PayLater", tenor: 3, jatuh_tempo_awal: "2026-09-05", nominal: 200_000 },
  { id: "kl", nama: "Kulkas", penyedia: "Kredivo", tenor: 2, jatuh_tempo_awal: "2026-06-01", nominal: 100_000 },
];
const sudah = { hp: [1, 2], tv: [1, 2, 3], kl: [1] };
assert.deepEqual(pilihCicilan("Shopee PayLater", rencana, sudah, "2026-10-22"), { rencana: rencana[0], ke: 3 }); // TV sudah lunas
assert.deepEqual(pilihCicilan("hp samsung", rencana, sudah, "2026-10-22"), { rencana: rencana[0], ke: 3 });
assert.deepEqual(pilihCicilan("KREDIVO", rencana, sudah, "2026-10-22"), { rencana: rencana[2], ke: 2 });
assert.equal(pilihCicilan("Akulaku", rencana, sudah, "2026-10-22"), null);
assert.equal(pilihCicilan("", rencana, sudah, "2026-10-22"), null);

// Paylater → rencana cicilan (SPEC-paylater).
const bensin = { amount: "15680.00", merchant: "BP Gunung Puteri", category: "transport", transaction_date: "2026-10-23" };
const sp = { penyedia: "SPayLater", per_cicilan: null, jatuh_tempo: null };
assert.deepEqual(rencanaPaylater(bensin, { ...sp, tenor: 3 }), {
  nama: "BP Gunung Puteri", penyedia: "SPayLater", category: "transport", nominal: 5227, tenor: 3, jatuh_tempo_awal: "2026-11-23",
});
const tertera = rencanaPaylater(bensin, { ...sp, tenor: 3, per_cicilan: 5800, jatuh_tempo: "2026-11-05" });
assert.equal(tertera.nominal, 5800);
assert.equal(tertera.jatuh_tempo_awal, "2026-11-05");
assert.equal(rencanaPaylater(bensin, { ...sp, tenor: 1, jatuh_tempo: "2026-01-01" }).jatuh_tempo_awal, "2026-11-23"); // tanggal ngawur
assert.equal(rencanaPaylater({ ...bensin, merchant: null }, { ...sp, tenor: 1 }).nama, "Belanja SPayLater");
assert.equal(rencanaPaylater({ ...bensin, merchant: null, description: "Beli sepatu" }, { ...sp, tenor: 3 }).nama, "Beli sepatu");
assert.equal(rencanaPaylater({ ...bensin, transaction_date: "2026-01-31" }, { ...sp, tenor: 1 }).jatuh_tempo_awal, "2026-02-28");

// Bayar beberapa cicilan sekaligus.
assert.deepEqual(bagiRata(10454, 2), [5227, 5227]);
assert.deepEqual(bagiRata(10000, 3), [3333, 3333, 3334]);
assert.deepEqual(bagiRata(5000, 1), [5000]);
const sudahDua = statusCicilan({ tenor: 3, jatuh_tempo_awal: "2026-11-23", nominal: 5227 }, [1, 2, 3], "2026-10-23");
assert.ok(sudahDua.lunas);

console.log("✓ pinjaman: jatuh tempo, jadwal & status cicilan, arah pindah, ringkasan Lend & Borrow, kartu Beranda, paylater → cicilan, bayar beberapa sekaligus");
