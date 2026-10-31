// Jalankan suite E2E satu per satu terhadap dev server (E2E_BASE, bawaan
// http://localhost:3000) dengan akun uji sementara yang dihapus di akhir.
// Tiap suite mencetak "semua cek lulus", "N cek gagal", atau "dilewati: …".
//
// Pemakaian: npm run e2e                 (semua suite)
//            npm run e2e -- pecah metode  (suite tertentu)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = [
  "fase1a", "arah", "fase2", "galat", "perbaikan", "lebar", "tempel", "a11y", "regresi-riwayat", "regresi-kalender",
  "fase3", "pratinjau", "tujuan", "ingat", "kembali", "pecah", "metode", "pelunasan",
];
const dir = path.dirname(fileURLToPath(import.meta.url));
const pilih = process.argv.slice(2);
const asing = pilih.filter((n) => !SUITE.includes(n));
if (asing.length) {
  console.error(`Suite tidak dikenal: ${asing.join(", ")}. Pilihan: ${SUITE.join(", ")}`);
  process.exit(2);
}
const base = process.env.E2E_BASE ?? "http://localhost:3000";
try {
  await fetch(`${base}/login`);
} catch {
  console.error(`Dev server tidak menjawab di ${base}. Jalankan "npm run dev" dulu.`);
  process.exit(2);
}

let gagal = 0;
for (const n of pilih.length ? pilih : SUITE) {
  const r = spawnSync(process.execPath, [path.join(dir, `${n}.mjs`), base], { encoding: "utf8", env: process.env, timeout: 15 * 60 * 1000 });
  const baris = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n");
  // Hasil dari baris ringkasan suite, bukan kode keluar: Node di Windows kadang
  // gagal assertion saat keluar (UV_HANDLE_CLOSING) setelah suite selesai.
  const akhir = baris.findLast((x) => /semua cek lulus|cek gagal|^dilewati|^GAGAL/.test(x)) ?? baris.at(-1) ?? "";
  const lulus = akhir.includes("semua cek lulus") || akhir.startsWith("dilewati");
  if (!lulus) gagal++;
  console.log(`== ${n}: ${akhir || `keluar dengan kode ${r.status}`}`);
  if (!lulus) for (const b of baris.filter((x) => /✗|GAGAL/.test(x)).slice(0, 8)) console.log(`   ${b.slice(0, 300)}`);
}
console.log(gagal ? `\n${gagal} suite gagal` : "\nSemua suite lulus");
process.exit(gagal ? 1 : 0);
