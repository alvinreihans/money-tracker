/**
 * Uji isi push notifikasi harian (src/lib/notifikasi.ts).
 *
 * Pemakaian: npm run uji:notifikasi
 */
import assert from "node:assert/strict";
import { fmtIDR } from "../src/lib/format.ts";
import { hariWIB, isiNotifikasi, type DataNotifikasi } from "../src/lib/notifikasi.ts";

// Cron jalan 12.00 UTC = 19.00 WIB, 22 Okt 2026.
const SEKARANG = new Date("2026-10-22T12:00:00Z");
const PER = "2000-01-01";

assert.equal(hariWIB("2026-10-21T16:30:00Z"), "2026-10-21"); // 23.30 WIB
assert.equal(hariWIB("2026-10-21T17:30:00Z"), "2026-10-22"); // 00.30 WIB

const tx = (t: Partial<DataNotifikasi["transaksi"][number]>): DataNotifikasi["transaksi"][number] => ({
  amount: 0, type: "transfer", transaction_date: "2026-10-01", created_at: "2026-10-01T00:00:00Z",
  kantong_id: null, kantong_tujuan_id: null, cicilan_id: null, cicilan_ke: null, ...t,
});

const data: DataNotifikasi = {
  cicilan: [
    { id: "A", nama: "Spaylater", nominal: 150000, tenor: 3, jatuh_tempo_awal: "2026-09-23" }, // ke-1 lunas, ke-2 besok
    { id: "B", nama: "HP", nominal: "99000.00", tenor: 1, jatuh_tempo_awal: "2026-10-25" },    // 3 hari lagi
    { id: "C", nama: "Kulkas", nominal: 50000, tenor: 2, jatuh_tempo_awal: "2026-10-21" },    // telat kemarin
    { id: "D", nama: "Lunas", nominal: 1000, tenor: 1, jatuh_tempo_awal: "2026-10-23" },      // sudah dibayar
    { id: "E", nama: "Telat lama", nominal: 1000, tenor: 1, jatuh_tempo_awal: "2026-10-20" }, // sudah diingatkan kemarin
  ],
  kantong: [
    { id: "budi", name: "Budi", kind: "orang", saldo_awal: 0, saldo_per: PER, jatuh_tempo: "2026-10-23" },
    { id: "ani", name: "Ani", kind: "orang", saldo_awal: 0, saldo_per: PER, jatuh_tempo: "2026-10-25" },
    { id: "lunas", name: "Cici", kind: "orang", saldo_awal: 0, saldo_per: PER, jatuh_tempo: "2026-10-23" },
    { id: "tanpa", name: "Dodi", kind: "orang", saldo_awal: 0, saldo_per: PER, jatuh_tempo: null },
    { id: "bca", name: "BCA Card", kind: "kredit", saldo_awal: -500000, saldo_per: PER, jatuh_tempo: "2026-10-23" },
  ],
  transaksi: [
    tx({ cicilan_id: "A", cicilan_ke: 1, type: "expense", amount: 150000 }),
    tx({ cicilan_id: "D", cicilan_ke: 1, type: "expense", amount: 1000 }),
    tx({ amount: 200000, kantong_id: "tunai", kantong_tujuan_id: "budi" }), // Lend
    tx({ amount: 50000, kantong_id: "ani", kantong_tujuan_id: "tunai" }),   // Borrow
    tx({ amount: 100000, kantong_id: "tunai", kantong_tujuan_id: "lunas" }),
    tx({ amount: 100000, kantong_id: "lunas", kantong_tujuan_id: "tunai" }),
    tx({ amount: 30000, kantong_id: "tunai", kantong_tujuan_id: "tanpa" }),
    tx({ created_at: "2026-10-21T16:30:00Z" }), // 23.30 WIB kemarin: bukan hari ini
  ],
};

const n = isiNotifikasi(data, SEKARANG);
const ringkas = n.map((x) => `${x.judul} | ${x.isi} | ${x.url} | ${x.tag}`);
assert.deepEqual(ringkas, [
  `Cicilan jatuh tempo besok | Spaylater ke-2 · ${fmtIDR(150000)} | /pinjaman | cicilan-A-2`,
  `Cicilan jatuh tempo 3 hari lagi | HP ke-1 · ${fmtIDR(99000)} | /pinjaman | cicilan-B-1`,
  `Cicilan lewat jatuh tempo | Kulkas ke-1 · ${fmtIDR(50000)} | /pinjaman | cicilan-C-1`,
  `Budi bayar besok | ${fmtIDR(200000)} | /pinjaman | pinjaman-budi`,
  `Bayar ke Ani 3 hari lagi | ${fmtIDR(50000)} | /pinjaman | pinjaman-ani`,
  `Tagihan BCA Card besok | ${fmtIDR(500000)} | /pinjaman | pinjaman-bca`,
  "Belum nyatat hari ini | Ada pengeluaran hari ini? Catat sebelum lupa. | / | catat",
]);

// Sudah mencatat 00.30 WIB hari ini → tidak diingatkan.
const sudah = isiNotifikasi({ ...data, transaksi: [...data.transaksi, tx({ created_at: "2026-10-21T17:30:00Z" })] }, SEKARANG);
assert.ok(!sudah.some((x) => x.tag === "catat"));

// Kartu kredit tanpa tagihan (lebih bayar) tidak diingatkan.
const lebih = isiNotifikasi({ cicilan: [], transaksi: [tx({ created_at: SEKARANG.toISOString() })], kantong: [{ ...data.kantong[4], saldo_awal: 1000 }] }, SEKARANG);
assert.deepEqual(lebih, []);

// Pergantian bulan: H-1 dari 1 Nov adalah 31 Okt.
const akhirBulan = isiNotifikasi({ ...data, transaksi: [tx({ created_at: "2026-10-31T05:00:00Z" })], cicilan: [{ id: "F", nama: "X", nominal: 1, tenor: 1, jatuh_tempo_awal: "2026-11-01" }], kantong: [] }, new Date("2026-10-31T12:00:00Z"));
assert.deepEqual(akhirBulan.map((x) => x.judul), ["Cicilan jatuh tempo besok"]);

console.log("✓ notifikasi: jatuh tempo cicilan & Lend/Borrow (H-3, H-1, telat), pengingat catat, batas hari WIB");
