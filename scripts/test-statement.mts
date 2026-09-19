/**
 * Diagnostik parsing rekening koran.
 *
 * Menjalankan kode produksi (src/lib/statement.ts) pada PDF sungguhan lalu
 * menampilkan hasilnya per baris, supaya klasifikasi expense/income/transfer
 * bisa diperiksa mata sebelum data masuk database.
 *
 *   npm run test:statement -- archive/Seabank_Statement_20260919.pdf
 *   npm run test:statement -- archive/            (semua PDF di folder)
 */
import fs from "node:fs";
import path from "node:path";
import { parseStatement } from "@/lib/statement";
import type { StatementLine, UserAccount } from "@/types/transaction";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

// Rekening & dompet milik user, persis seperti yang disimpan UI sekarang:
// hanya nama kanonik, tanpa alias. Variasi penulisan ditangani accounts.ts.
const AKUN: UserAccount[] = [
  { id: "1", user_id: "-", name: "SeaBank", kind: "bank", aliases: [] },
  { id: "2", user_id: "-", name: "BRI", kind: "bank", aliases: [] },
  { id: "3", user_id: "-", name: "Jago", kind: "bank", aliases: [] },
  { id: "4", user_id: "-", name: "ShopeePay", kind: "ewallet", aliases: [] },
  { id: "5", user_id: "-", name: "GoPay", kind: "ewallet", aliases: [] },
];

const inputs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (inputs.length === 0) {
  console.error(`\n${c.bold("Diagnostik rekening koran")}\n\n  npm run test:statement -- <file.pdf atau folder>\n`);
  process.exit(1);
}

const files: string[] = [];
for (const input of inputs) {
  if (!fs.existsSync(input)) {
    console.error(c.red(`Tidak ditemukan: ${input}`));
    continue;
  }
  if (fs.statSync(input).isDirectory()) {
    for (const f of fs.readdirSync(input).sort()) {
      if (f.toLowerCase().endsWith(".pdf")) files.push(path.join(input, f));
    }
  } else if (input.toLowerCase().endsWith(".pdf")) {
    files.push(input);
  }
}

if (files.length === 0) {
  console.error(c.red("\nTidak ada PDF untuk diuji.\n"));
  process.exit(1);
}

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function labelTipe(l: StatementLine): string {
  if (l.type === "transfer") return c.cyan("TRANSFER");
  if (l.type === "income") return c.green("MASUK   ");
  return c.yellow("KELUAR  ");
}

for (const file of files) {
  console.log(c.cyan("━".repeat(78)));
  console.log(c.bold(path.basename(file)));

  const buffer = fs.readFileSync(file);
  const t0 = Date.now();

  let hasil;
  try {
    hasil = await parseStatement(buffer, AKUN);
  } catch (err) {
    console.log(c.red(`  GAGAL: ${(err as Error).message}\n`));
    continue;
  }

  console.log(
    c.dim(
      `  ${hasil.totalPages} halaman, ${hasil.pagesProcessed} diproses, ${hasil.lines.length} transaksi, ${Date.now() - t0}ms`,
    ),
  );
  for (const n of hasil.notes) console.log(c.dim(`    - ${n}`));
  console.log();

  for (const l of hasil.lines) {
    const ket = l.description.length > 34 ? l.description.slice(0, 33) + "…" : l.description;
    console.log(
      `  ${l.transaction_date}  ${labelTipe(l)}  ${fmtIDR(l.amount).padStart(14)}  ${ket.padEnd(34)} ${c.dim(l.category)}`,
    );
  }

  // Ringkasan: transfer sengaja dipisah karena tidak boleh masuk pengeluaran.
  const jml = (t: string) =>
    hasil.lines.filter((l) => l.type === t).reduce((s, l) => s + l.amount, 0);
  const n = (t: string) => hasil.lines.filter((l) => l.type === t).length;

  console.log();
  console.log(`  ${c.yellow("Pengeluaran")}  ${n("expense")} baris  ${fmtIDR(jml("expense"))}`);
  console.log(`  ${c.green("Pemasukan")}    ${n("income")} baris  ${fmtIDR(jml("income"))}`);
  console.log(
    `  ${c.cyan("Transfer")}     ${n("transfer")} baris  ${fmtIDR(jml("transfer"))} ${c.dim("(tidak dihitung sebagai pengeluaran)")}`,
  );
  console.log();
}

process.exit(0);
