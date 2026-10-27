/**
 * Evaluasi Tanya AI (SPEC-analitik-ai): pertanyaan sulit dengan jawaban yang
 * diketahui, lewat /api/tanya sungguhan (Gemini sungguhan) dengan akun uji
 * sementara yang dihapus di akhir. Dipakai untuk mengukur "pintar"-nya AI
 * setiap kali prompt, fungsi, atau model diubah.
 *
 * Pemakaian: npm run eval:tanya            (dev server di http://localhost:3000)
 *            EVAL_HANYA=3,12 npm run eval:tanya   (kasus tertentu saja)
 *            EVAL_BASE=http://localhost:3005 EVAL_JEDA=20000 npm run eval:tanya
 *
 * Butuh .env.local dengan SUPABASE_SERVICE_ROLE_KEY. Memakai kuota Gemini
 * (± 30 panggilan), jadi tidak dijalankan otomatis.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const BASE = process.env.EVAL_BASE ?? "http://localhost:3000";
const JEDA = Number(process.env.EVAL_JEDA ?? 12000);
const EMAIL = "eval-tanya-sementara@example.com", SANDI = "Eval12345#";
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const rp = (n) => n.toLocaleString("id-ID");

// Data uji di bulan berjalan (B) dan bulan lalu (L). Angka harapan di bawah dihitung dari sini.
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const B = hariIni.slice(0, 7);
const L = (() => { const [t, b] = B.split("-").map(Number); const d = new Date(Date.UTC(t, b - 2, 1)); return d.toISOString().slice(0, 7); })();
const tgl = (bulan, hari) => `${bulan}-${String(Math.min(hari, Number(hariIni.slice(8)) || hari)).padStart(2, "0")}`;

const KASUS = [
  { tanya: "berapa total pengeluaran bulan ini?", harus: [10667000] },
  { tanya: "kalau transaksi Laku6 tidak dihitung, pengeluaran bulan ini berapa?", harus: [367000] },
  { tanya: "jika transaksi Laku6 tidak dihitung, bagaimana kondisi keuangan saya bulan ini?", harus: [367000, 8000000] },
  { tanya: "berapa total jajan kopi bulan ini?", harus: [47000] },
  { tanya: "transaksi di atas 1 juta bulan ini apa aja?", harus: [10300000], pola: /laku6/i },
  { tanya: "pengeluaran yang di bawah 50 ribu bulan ini totalnya berapa?", harus: [122000] },
  // Saldo sejak 1 Jan: BCA 20.000.000 + 8.000.000 - 300.000 (bulan lalu) + 8.000.000 - 10.300.000 - 500.000;
  // Tunai 500.000 - 40.000 - 60.000 - 15.000 - 200.000; GoPay 150.000 + 500.000 - 47.000 - 245.000.
  { tanya: "saldo BCA berapa?", harus: [24900000] },
  { tanya: "total asetku berapa?", harus: [25443000] },
  { tanya: "siapa yang punya utang ke aku?", harus: [200000], pola: /budi/i },
  { tanya: "bandingin pengeluaran makan bulan ini sama bulan lalu", harus: [107000, 40000] },
  { tanya: "selisih total pengeluaran bulan ini dan bulan lalu berapa?", harus: [10327000] },
  {
    tanya: "kalau dibanding pemasukan gimana?",
    riwayat: [
      { peran: "saya", teks: "kalau transaksi Laku6 tidak dihitung, pengeluaran bulan ini berapa?" },
      { peran: "ai", teks: "Tanpa Laku6 (Rp 10.300.000), pengeluaran bulan ini Rp 367.000." },
    ],
    harus: [367000, 8000000],
  },
  { tanya: "rekomendasi saham yang bagus dong", harus: [], pola: /(hanya|cuma|tidak bisa)/i, tanpaTautan: true },
  // Metode budgeting (SPEC-metode-budget): 50/30/20 dari penghasilan 8 jt →
  // jatah keinginan 2,4 jt; realisasinya Shopee 245 rb — HP Laku6 10,3 jt
  // dibayar dari tujuan tabungan, di luar jatah (SPEC-tujuan-tabungan).
  { tanya: "bagaimana budget 50/30/20-ku bulan ini?", harus: [2400000, 245000, 10300000], pola: /tabungan/i },
  // Menjelaskan "kenapa" dengan cerita transaksinya, bukan sekadar kategori:
  // HP-nya dibeli dari tabungan, bukan pemborosan bulan ini.
  { tanya: "kenapa bulan ini boros?", harus: [10300000], pola: /\bHP\b[\s\S]*tabungan|tabungan[\s\S]*\bHP\b/i },
  // Minta membetulkan kategori (SPEC-ingat-kategori): hanya usulan + kartu,
  // tidak mengaku sudah mengubah; pertanyaan biasa tidak memunculkan usulan.
  { tanya: "Kopi Janji Jiwa itu harusnya kategori Jajan, tolong betulkan", harus: [], usulan: true, bukan: /\bsudah (saya |aku )?(di)?(ubah|ganti|betulkan|perbaiki|pindah)/i },
  { tanya: "berapa pengeluaran Shopee bulan ini?", harus: [245000], tanpaUsulan: true },
];

let uid;
let lulus = 0;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  await sb.from("user_accounts").update({ saldo_awal: 500000, saldo_sejak: "2026-01-01T00:00:00+07:00" }).eq("id", tunai.id);
  const buat = async (name, kind, saldo_awal) => (await sb.from("user_accounts").insert({ user_id: uid, name, kind, emoji: "🏦", saldo_awal, saldo_sejak: "2026-01-01T00:00:00+07:00" }).select().single()).data;
  const bca = await buat("BCA", "bank", 20000000), gopay = await buat("GoPay", "ewallet", 150000), budi = await buat("Budi", "orang", 0);
  // Tujuan tabungan HP: HP Laku6 dibayar darinya, kekurangannya dilengkapi
  // transfer dari BCA (seperti aksi "Dibayar dari tujuan tabungan").
  const tabunganHp = (await sb.from("user_accounts").insert({ user_id: uid, name: "Tabungan HP", kind: "tujuan", emoji: "📱", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00", target: 10300000 }).select().single()).data;
  const tx = (amount, type, category, merchant, transaction_date, kantong_id, extra = {}) => ({ user_id: uid, status: "confirmed", source: "text", amount, type, category, merchant, transaction_date, kantong_id, ...extra });
  const { error: e2 } = await sb.from("transactions").insert([
    tx(8000000, "income", "salary", "Kantor", tgl(B, 1), bca.id),
    // Cerita di balik transaksi (SPEC-cerita-tanya): dipakai menjawab "kenapa".
    tx(25000, "expense", "food", "Warteg Selera Bahari", tgl(B, 2), tunai.id),
    tx(18000, "expense", "food", "Warteg Selera Bahari", tgl(B, 4), tunai.id),
    tx(17000, "expense", "food", "Warteg Selera Bahari", tgl(B, 5), tunai.id),
    tx(25000, "expense", "food", "Kopi Kenangan", tgl(B, 6), gopay.id),
    tx(22000, "expense", "food", "Kopi Janji Jiwa", tgl(B, 7), gopay.id),
    tx(245000, "expense", "shopping", "Shopee", tgl(B, 8), gopay.id),
    tx(15000, "expense", "transport", "Parkir", tgl(B, 9), tunai.id),
    tx(500000, "transfer", "other", null, tgl(B, 2), bca.id, { kantong_tujuan_id: gopay.id }),
    tx(200000, "transfer", "other", "Budi", tgl(B, 2), tunai.id, { kantong_tujuan_id: budi.id }),
    tx(8000000, "income", "salary", "Kantor", `${L}-01`, bca.id),
    tx(40000, "expense", "food", "Warteg", `${L}-10`, tunai.id),
    tx(300000, "expense", "shopping", "Toko", `${L}-11`, bca.id),
  ]);
  if (e2) throw e2;
  const { data: laku6, error: e3 } = await sb.from("transactions").insert(tx(10300000, "expense", "shopping", "Laku6", tgl(B, 3), tabunganHp.id, { description: "Beli HP baru, HP lama rusak" })).select("id").single();
  if (e3) throw e3;
  await sb.from("transactions").insert(tx(10300000, "transfer", "other", "Tabungan HP", tgl(B, 3), bca.id, { kantong_tujuan_id: tabunganHp.id, pelengkap_tujuan: laku6.id }));
  await sb.from("metode_budget").insert({ user_id: uid, metode: "50-30-20" });

  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = []; for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  const cookie = p.length === 1 ? `sb-${ref}-auth-token=${isi}` : p.map((x, i) => `sb-${ref}-auth-token.${i}=${x}`).join("; ");

  // EVAL_HANYA="3,12": jalankan kasus tertentu saja (nomor mulai 1).
  const hanya = (process.env.EVAL_HANYA ?? "").split(",").filter(Boolean).map(Number);
  for (const [i, k] of KASUS.entries()) {
    if (hanya.length && !hanya.includes(i + 1)) continue;
    if (i && (!hanya.length || hanya.indexOf(i + 1) > 0)) await tidur(JEDA);
    const t = Date.now();
    const r = await fetch(`${BASE}/api/tanya`, { method: "POST", headers: { cookie, origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ pertanyaan: k.tanya, riwayat: k.riwayat ?? [], bulan: B }) });
    const d = await r.json().catch(() => ({}));
    const teks = String(d.jawaban ?? d.error ?? "").replace(/ /g, " ");
    const kurang = k.harus.filter((n) => !teks.includes(rp(n)));
    const ok =
      r.ok &&
      !d.ragu &&
      !kurang.length &&
      (!k.pola || k.pola.test(teks)) &&
      (!k.bukan || !k.bukan.test(teks)) &&
      (!k.tanpaTautan || !(d.tautan ?? []).length) &&
      (!k.usulan || Boolean(d.usulan)) &&
      (!k.tanpaUsulan || !d.usulan);
    if (ok) lulus++;
    console.log(`${ok ? "✓" : "✗"} ${k.tanya}  (${((Date.now() - t) / 1000).toFixed(1)} dtk)\n    ${teks}${kurang.length ? `\n    kurang: ${kurang.map(rp).join(", ")}` : ""}${d.ragu ? "\n    ragu: ada nominal tak terverifikasi" : ""}`);
  }
} catch (e) {
  console.log("GAGAL:", e.message);
} finally {
  if (uid) await admin.auth.admin.deleteUser(uid);
  console.log(`\nSkor: ${lulus}/${KASUS.length}${uid ? " · akun uji dihapus" : ""}`);
}
