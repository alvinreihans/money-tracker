/**
 * Uji ekspor CSV (src/lib/ekspor.ts).
 *
 * Pemakaian: npm run uji:ekspor
 */
import assert from "node:assert/strict";
import { keCsv, selCsv, tabelEkspor } from "../src/lib/ekspor.ts";

// Sel: kutip seperlunya, rumus dinetralkan, angka apa adanya.
assert.equal(selCsv(null), "");
assert.equal(selCsv(15000), "15000");
assert.equal(selCsv("Kopi Kenangan"), "Kopi Kenangan");
assert.equal(selCsv('Toko "Maju", Jaya'), '"Toko ""Maju"", Jaya"');
assert.equal(selCsv("baris\nkedua"), '"baris\nkedua"');
assert.equal(selCsv("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
assert.equal(selCsv("+62812"), "'+62812");
assert.equal(selCsv("-diskon"), "'-diskon");
assert.equal(selCsv("@budi"), "'@budi");

// CSV utuh: BOM, CRLF.
assert.equal(keCsv([["a", 1], ["b", null]]), "﻿a,1\r\nb,\r\n");

const tabel = tabelEkspor(
  [
    {
      transaction_date: "2026-10-22", waktu: "23:15:00", created_at: "2026-10-22T16:30:00Z", type: "transfer", category: "transfer",
      amount: "200000.00", merchant: null, description: "pinjam", kantong_id: "k1", kantong_tujuan_id: "k2",
      payment_method: null, status: "confirmed",
    },
    {
      transaction_date: "2026-10-21", waktu: null, created_at: "2026-10-21T01:05:00Z", type: "expense", category: "food",
      amount: 25000, merchant: "Warteg", description: null, kantong_id: "hilang", kantong_tujuan_id: null,
      payment_method: "Tunai", status: "needs_review",
    },
  ],
  [{ id: "k1", name: "BCA" }, { id: "k2", name: "Budi" }],
  [{ type: "expense", slug: "food", name: "Makan" }],
);
assert.deepEqual(tabel[0].slice(0, 4), ["Tanggal", "Jam", "Jenis", "Kategori"]);
assert.deepEqual(tabel[1], ["2026-10-22", "23:15", "Pindah kantong", "transfer", "", 200000, null, "pinjam", "BCA", "Budi", null, "Tercatat", "", "2026-10-22 23:30"]);
assert.deepEqual(tabel[2], ["2026-10-21", "", "Keluar", "Makan", "", 25000, "Warteg", null, "", "", "Tunai", "Belum selesai", "", "2026-10-21 08:05"]);

// Kelompok & pecahan (SPEC-metode-budget): asli dan bagiannya berkode sama.
const pecah = tabelEkspor(
  [
    { id: "aaaaaaaa-1111", transaction_date: "2026-10-21", waktu: null, created_at: "2026-10-21T01:05:00Z", type: "expense", category: "food", amount: 10000, merchant: "Alfamart", description: "sabun", kantong_id: null, kantong_tujuan_id: null, payment_method: null, status: "confirmed", kelompok_efektif: "kebutuhan" },
    { id: "bbbbbbbb-2222", pecahan_dari: "aaaaaaaa-1111", transaction_date: "2026-10-21", waktu: null, created_at: "2026-10-21T01:05:00Z", type: "expense", category: "food", amount: 5000, merchant: "Alfamart", description: "kopi", kantong_id: null, kantong_tujuan_id: null, payment_method: null, status: "confirmed", kelompok_efektif: "keinginan" },
    { id: "cccccccc-3333", transaction_date: "2026-10-21", waktu: null, created_at: "2026-10-21T01:05:00Z", type: "expense", category: "food", amount: 9000, merchant: "Warteg", description: null, kantong_id: null, kantong_tujuan_id: null, payment_method: null, status: "confirmed", kelompok_efektif: "kebutuhan" },
  ],
  [],
  [{ type: "expense", slug: "food", name: "Makan" }],
);
assert.deepEqual(pecah.slice(1).map((r) => [r[4], r[12]]), [["Kebutuhan", "aaaaaaaa"], ["Keinginan", "aaaaaaaa"], ["Kebutuhan", ""]]);

console.log("✓ ekspor: sel CSV (kutip, rumus dinetralkan), BOM & CRLF, nama kantong & kategori, jam transaksi, waktu catat WIB");
