#!/usr/bin/env node
/**
 * Migration runner untuk Supabase/Postgres.
 *
 * Membaca semua file di supabase/migrations/ berurutan berdasarkan nama file,
 * menjalankan yang belum pernah diterapkan, lalu mencatatnya di tabel
 * public._migrations.
 *
 * Pemakaian:
 *   npm run db:migrate          -- terapkan yang belum diterapkan
 *   npm run db:migrate:status   -- tampilkan status tanpa mengubah apa pun
 *   npm run db:migrate -- --baseline   -- tandai semua sudah diterapkan
 *                                         (untuk DB yang migrasinya dijalankan manual)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

const args = new Set(process.argv.slice(2));
const STATUS_ONLY = args.has("--status");
const BASELINE = args.has("--baseline");

// --- warna ringan, aman di terminal Windows modern ---
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function fail(msg, hint) {
  console.error(`\n${c.red("✗")} ${msg}`);
  if (hint) console.error(c.dim(hint));
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  fail(
    "Env SUPABASE_DB_URL belum di-set.",
    [
      "",
      "Ambil dari Supabase Dashboard:",
      "  Project Settings -> Database -> Connection string -> URI",
      "",
      "Pakai koneksi Direct atau Session pooler (port 5432), BUKAN Transaction",
      "pooler (6543) — pooler transaksi tidak mendukung sebagian perintah DDL.",
      "",
      "Lalu tambahkan ke .env.local:",
      "  SUPABASE_DB_URL=postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require",
    ].join("\n"),
  );
}

// Placeholder dari .env.example akan lolos pengecekan "kosong" di atas, tapi
// gagal dengan stack trace pg yang tidak informatif kalau dibiarkan.
if (/<password>|<host>/.test(connectionString)) {
  fail(
    "SUPABASE_DB_URL masih berisi placeholder.",
    "Ganti <password> dan <host> dengan nilai asli dari Supabase Dashboard.",
  );
}

try {
  const parsed = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    fail(`Protokol tidak dikenal: ${parsed.protocol}`, "Harus postgresql://...");
  }
} catch {
  fail(
    "SUPABASE_DB_URL bukan URL yang valid.",
    "Format: postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require",
  );
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
  fail(`Direktori migrasi tidak ditemukan: ${MIGRATIONS_DIR}`);
}

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // nama file berawalan timestamp => urutan leksikografis = urutan waktu

if (files.length === 0) fail("Tidak ada file .sql di supabase/migrations/.");

// Pooler Supabase memakai sertifikat yang ditandatangani CA mereka sendiri,
// sementara pg v8.23+ memperlakukan sslmode=require sebagai verify-full.
// `sslmode=no-verify` dipilih secara eksplisit oleh user di URL: koneksinya
// tetap terenkripsi, hanya identitas server yang tidak diverifikasi.
const noVerify = /sslmode=no-verify/i.test(connectionString);
const client = new pg.Client({
  connectionString: connectionString.replace(/[?&]sslmode=no-verify/i, ""),
  ssl: noVerify ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
} catch (err) {
  const hostnameIPv6Only =
    err.code === "ENOTFOUND" && /^db\..*\.supabase\.co$/.test(err.hostname ?? "");

  fail(
    `Gagal terhubung ke database: ${err.message}`,
    hostnameIPv6Only
      ? [
          "",
          "Host `db.<ref>.supabase.co` hanya beralamat IPv6, dan jaringan Anda",
          "tampaknya tidak punya konektivitas IPv6.",
          "",
          "Pakai Session pooler yang punya IPv4 (Dashboard -> Connect ->",
          "Session pooler). Perhatikan username-nya ikut berubah:",
          "",
          "  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=no-verify",
          "",
          "Port 5432 = session mode (mendukung DDL). JANGAN 6543.",
        ].join("\n")
      : err.message.includes("certificate")
        ? "Tambahkan ?sslmode=no-verify di akhir SUPABASE_DB_URL — pooler Supabase\nmemakai sertifikat CA sendiri. Koneksi tetap terenkripsi."
        : "Periksa host, port, username, dan password di SUPABASE_DB_URL.",
  );
}

try {
  // Mode status sengaja tidak menulis apa pun — aman dipakai sebagai uji
  // koneksi pertama sebelum menyentuh database.
  if (!STATUS_ONLY) {
    await client.query(`
      create table if not exists public._migrations (
        name        text primary key,
        applied_at  timestamptz not null default now()
      );
    `);
  }

  // Di mode status tabelnya mungkin belum ada; itu berarti belum ada migrasi
  // yang tercatat, bukan sebuah error.
  const { rows } = await client
    .query("select name from public._migrations")
    .catch(() => ({ rows: [] }));

  const applied = new Set(rows.map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  // --- Mode status: hanya laporkan ---
  if (STATUS_ONLY) {
    console.log(`\n${c.bold("Status migrasi")} ${c.dim(`(${files.length} file)`)}\n`);
    for (const f of files) {
      console.log(
        applied.has(f) ? `  ${c.green("✓")} ${f}` : `  ${c.yellow("•")} ${f} ${c.dim("(belum)")}`,
      );
    }
    console.log(
      pending.length === 0
        ? `\n${c.green("Semua migrasi sudah diterapkan.")}\n`
        : `\n${c.yellow(`${pending.length} migrasi belum diterapkan.`)} Jalankan: npm run db:migrate\n`,
    );
    process.exit(0);
  }

  // --- Mode baseline: tandai sudah diterapkan tanpa menjalankan SQL ---
  // Untuk database yang migrasinya terlanjur dijalankan manual lewat SQL Editor.
  if (BASELINE) {
    for (const f of pending) {
      await client.query("insert into public._migrations (name) values ($1)", [f]);
      console.log(`  ${c.green("✓")} ${f} ${c.dim("ditandai sudah diterapkan")}`);
    }
    console.log(
      `\n${c.green(`Baseline selesai: ${pending.length} migrasi ditandai.`)}\n`,
    );
    process.exit(0);
  }

  if (pending.length === 0) {
    console.log(`\n${c.green("✓")} Tidak ada migrasi baru. Database sudah terbaru.\n`);
    process.exit(0);
  }

  console.log(`\n${c.bold(`Menjalankan ${pending.length} migrasi...`)}\n`);

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const started = Date.now();

    // Tiap migrasi dibungkus transaksi sendiri: kalau gagal di tengah, tidak ada
    // perubahan separuh jadi yang tertinggal di database.
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`  ${c.green("✓")} ${file} ${c.dim(`${Date.now() - started}ms`)}`);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error(`  ${c.red("✗")} ${file}`);
      console.error(`\n${c.red(err.message)}`);
      if (err.position) {
        const pos = Number(err.position);
        console.error(c.dim(`\n...${sql.slice(Math.max(0, pos - 200), pos + 200)}...`));
      }
      console.error(
        c.dim("\nTidak ada perubahan yang tertinggal dari migrasi ini (rollback).\n"),
      );
      process.exit(1);
    }
  }

  console.log(`\n${c.green(`Selesai. ${pending.length} migrasi diterapkan.`)}\n`);
} finally {
  await client.end().catch(() => {});
}
