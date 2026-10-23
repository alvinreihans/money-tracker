/**
 * Uji saldo per jam & jam transaksi (src/lib/waktu.ts).
 *
 * Pemakaian: npm run uji:waktu
 */
import assert from "node:assert/strict";
import { bacaJam, ikutSaldo, jamTransaksi, jamWIB, perluTanyaJam, saldoSejak, saldoSejakDari } from "../src/lib/waktu.ts";

// 23 Okt 2026, 16.00 WIB.
const SEKARANG = new Date("2026-10-23T09:00:00Z");
assert.equal(jamWIB(SEKARANG), "16:00");

// Jawaban "Tadi itu jam berapa?".
const jawaban: [string, { jam: string; perkiraan: boolean } | null][] = [
  ["jam 10", { jam: "10:00", perkiraan: false }],
  ["10.30", { jam: "10:30", perkiraan: false }],
  ["10:30", { jam: "10:30", perkiraan: false }],
  ["pukul 9", { jam: "09:00", perkiraan: false }],
  ["10", { jam: "10:00", perkiraan: false }],
  ["jam 2 siang", { jam: "14:00", perkiraan: false }],
  ["jam 7 malam", { jam: "19:00", perkiraan: false }],
  ["jam 4 sore", { jam: "16:00", perkiraan: false }],
  ["jam 9 pagi", { jam: "09:00", perkiraan: false }],
  ["barusan", { jam: "16:00", perkiraan: false }],
  ["tadi pagi", { jam: "08:00", perkiraan: true }],
  ["siang", { jam: "12:00", perkiraan: true }],
  ["lupa", null],
  ["jam 25", null],
];
for (const [teks, harap] of jawaban) assert.deepEqual(bacaJam(teks, SEKARANG), harap, teks);

// Jam yang disimpan dari hasil AI.
assert.deepEqual(jamTransaksi({ time: "13:57", hint: null }, "2026-10-23", SEKARANG), { waktu: "13:57", perkiraan: false });
assert.deepEqual(jamTransaksi({ time: null, hint: "pagi" }, "2026-10-23", SEKARANG), { waktu: "08:00", perkiraan: true });
assert.deepEqual(jamTransaksi({ time: null, hint: "lampau" }, "2026-10-23", SEKARANG), { waktu: null, perkiraan: false });
assert.deepEqual(jamTransaksi({ time: null, hint: null }, "2026-10-23", SEKARANG), { waktu: "16:00", perkiraan: false }); // dicatat sekarang
assert.deepEqual(jamTransaksi({ time: null, hint: null }, "2026-10-20", SEKARANG), { waktu: null, perkiraan: false });

// Kapan bertanya: saldo BCA 23 Okt 14.00.
const saldo = saldoSejak({ saldo_per: "2026-10-23", saldo_sejak: "2026-10-23T07:00:00Z" });
assert.deepEqual(saldo, { tanggal: "2026-10-23", jam: "14:00" });
const tanya = (waktu: string | null, perkiraan = false, tanggal = "2026-10-23") => perluTanyaJam({ transaction_date: tanggal, waktu, perkiraan }, saldo);
assert.equal(tanya(null), true);                 // "tadi beli roti"
assert.equal(tanya("10:00"), false);             // "jam 10"
assert.equal(tanya("16:00"), false);             // tanpa petunjuk, dicatat 16.00
assert.equal(tanya("08:00", true), false);       // "tadi pagi" (05–11): jelas sebelum 14.00
assert.equal(tanya("12:00", true), true);        // "tadi siang" (11–15): bisa sebelum/sesudah 14.00
assert.equal(tanya("16:00", true), false);       // "tadi sore" (15–18): jelas sesudah 14.00
assert.equal(tanya("20:00", true), false);       // "tadi malam"
assert.equal(tanya(null, false, "2026-10-22"), false); // hari lain: tidak pernah ditanya
assert.equal(perluTanyaJam({ transaction_date: "2026-10-23", waktu: null }, undefined), false);

// Ikut menggeser saldo?
assert.equal(ikutSaldo({ transaction_date: "2026-10-23", waktu: "10:00:00" }, saldo), false);
assert.equal(ikutSaldo({ transaction_date: "2026-10-23", waktu: "14:00" }, saldo), true);
assert.equal(ikutSaldo({ transaction_date: "2026-10-23", waktu: "15:00" }, saldo), true);
assert.equal(ikutSaldo({ transaction_date: "2026-10-23", waktu: null }, saldo), true);
assert.equal(ikutSaldo({ transaction_date: "2026-10-22", waktu: "23:00" }, saldo), false);
assert.equal(ikutSaldo({ transaction_date: "2026-10-24", waktu: "01:00" }, saldo), true);

// Saldo berlaku sejak.
assert.equal(saldoSejakDari("2026-10-23", SEKARANG), SEKARANG.toISOString());
assert.equal(saldoSejakDari("2026-10-01", SEKARANG), "2026-10-01T00:00:00+07:00");

// Saldo diisi sore (16.30): "tadi sore" baru ditanya.
const saldoSore = { tanggal: "2026-10-23", jam: "16:30" };
assert.equal(perluTanyaJam({ transaction_date: "2026-10-23", waktu: "16:00", perkiraan: true }, saldoSore), true);
assert.equal(perluTanyaJam({ transaction_date: "2026-10-23", waktu: "12:00", perkiraan: true }, saldoSore), false);

console.log("✓ waktu: baca jam ketikan, jam dari AI, kapan bertanya (hari saldo, rentang bagian hari), ikut saldo, saldo sejak");
