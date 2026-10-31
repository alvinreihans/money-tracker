// Metode lanjutan (SPEC-metode-lanjutan): Pay Yourself First, Zero-Based, 6 Jars, Kakeibo.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-metode-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const B = hariIni.slice(0, 7);
const geser = (n) => { const [t, b] = B.split("-").map(Number); return new Date(Date.UTC(t, b - 1 + n, 1)).toISOString().slice(0, 7); };
const tgl = (h) => `${B}-${String(Math.min(h, Number(hariIni.slice(8)))).padStart(2, "0")}`;
const PILIH = `const pilih = async (akar, kolom, teks) => { akar.querySelector('[data-kolom="' + kolom + '"] button').click(); await sampai(() => [...document.querySelectorAll('dialog[open]')].length > 1 || dialog() !== akar); await t(300); [...dialog().querySelectorAll('button')].find(b => b.textContent.includes(teks)).click(); await t(400); };`;
const tekan = (teks, akar = "document") => `[...${akar}.querySelectorAll('button, a')].find(b => b.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(teks)}))`;
const radio = (nama) => `[...document.querySelectorAll('[role=radio]')].find(b => b.textContent.includes(${JSON.stringify(nama)}))`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: bca } = await sb.from("user_accounts").insert({ user_id: uid, name: "BCA", kind: "bank", emoji: "🏦", saldo_awal: 20000000, saldo_per: "2026-01-01", saldo_sejak: "2026-01-01T00:00:00+07:00" }).select("id").single();
  await sb.from("user_accounts").insert({ user_id: uid, name: "Dana darurat", kind: "tujuan", emoji: "🛟", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00", target: 30000000 }).select("id").single();
  const tx = (amount, type, category, merchant, d, extra = {}) => ({ user_id: uid, status: "confirmed", source: "text", amount, type, category, merchant, transaction_date: d, kantong_id: bca.id, ...extra });
  await sb.from("transactions").insert([
    // Gaji 8 jt tiap bulan, termasuk bulan ini (sudah gajian).
    tx(8000000, "income", "salary", "Kantor", `${geser(-1)}-25`),
    tx(8000000, "income", "salary", "Kantor", tgl(1)),
    tx(2000000, "expense", "food", "Katering", tgl(1)),
    tx(400000, "expense", "education", "Kursus Bahasa", tgl(1)),
    tx(1000000, "expense", "food", "Warteg", `${geser(-1)}-10`),
  ]);
  const mb = async () => (await sb.from("metode_budget").select("metode, persen, target_tabungan").maybeSingle()).data;

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  const halaman = async () => norm(await jalankan(`document.body.innerText`));
  const fotoKartu = async (nama, teks) => { await jalankan(`[...document.querySelectorAll('section')].find(x => x.innerText.includes(${JSON.stringify(teks)}))?.scrollIntoView({ block: "center" })`); await tidur(600); await foto(nama); };

  // --- 1. Pay Yourself First: belum tersimpan sebelum persennya diisi.
  await buka(`${base}/profil/budget`, 5000);
  await langkah("pilih PYF", `${radio("Pay Yourself First")}.click(); await sampai(() => document.querySelector('input[placeholder="Tabungan (%)"]')); await t(500); return 'ok'`);
  let h = await halaman();
  cek("PYF: isian persen tampil, pratinjau Tabungan 20% Rp 1,6 jt, belum tersimpan", /Tabungan 20% Rp 1,6 jt/.test(h) && /Bebas dipakai 80%/.test(h) && (await mb()) === null, h.slice(0, 260));
  await langkah("simpan PYF", `${tekan("Pakai Pay Yourself First")}.click(); await sampai(() => /Memakai metode Pay Yourself First/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  let m = await mb();
  cek("PYF tersimpan dengan persen tabungan 20", m?.metode === "pyf" && m?.persen?.tabungan === 20, JSON.stringify(m));
  await foto("metode-1-pyf.png");

  // --- 2. Beranda: belum disisihkan → Sisihkan (tujuan & nominal terisi) → kartu hilang.
  await buka(`${base}/`, 5000);
  h = await halaman();
  cek("Beranda: 'Belum disisihkan bulan ini' Rp 1.600.000", /Belum disisihkan Rp 1\.600\.000 tabungan bulan ini/.test(h), h.slice(0, 400));
  await fotoKartu("metode-2-beranda.png", "Belum disisihkan");
  const setor = await langkah("sisihkan dari Beranda", `${PILIH} ${tekan("Sisihkan")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Nominal (Rp)"]')); await t(500);
    const nominal = dialog().querySelector('input[placeholder="Nominal (Rp)"]').value; const ke = dialog().querySelector('[data-kolom="kantong_tujuan_id"]')?.innerText;
    await pilih(dialog(), 'kantong_id', 'BCA');
    ${tekan("Simpan", "dialog()")}.click(); await sampai(() => /Tercatat/.test(document.body.innerText), 20); await t(3000); return { nominal, ke }`);
  await buka(`${base}/`, 5000);
  h = await halaman();
  cek("Sisihkan: nominal 1.600.000 & tujuan Dana darurat terisi; kartu hilang setelah disetor", norm(setor?.nominal) === "1.600.000" && /Dana darurat/.test(setor?.ke ?? "") && !/Belum disisihkan/.test(h), JSON.stringify(setor));

  // --- 3. Zero-Based: form kategori + tabungan; belum dialokasikan.
  await buka(`${base}/profil/budget`, 5000);
  await langkah("isi Zero-Based", `${radio("Zero-Based")}.click(); await sampai(() => document.querySelector('input[placeholder="Tabungan per bulan (Rp)"]')); await t(400);
    isi(document.querySelector('input[placeholder="Tabungan per bulan (Rp)"]'), '1500000');
    isi(document.querySelector('input[placeholder="Makan"]'), '3000000'); await t(500); return 'ok'`);
  h = await halaman();
  cek("Zero-Based: pratinjau Ditargetkan 3 jt, Tabungan 1,5 jt, Belum dialokasikan 3,5 jt", /Ditargetkan Rp 3 jt/.test(h) && /Tabungan Rp 1,5 jt/.test(h) && /Belum dialokasikan Rp 3,5 jt/.test(h), h.slice(0, 400));
  await foto("metode-3-zero.png");
  await langkah("simpan Zero-Based", `[...document.querySelectorAll('form button[type=submit]')].at(-1).click(); await sampai(() => /Zero-Based tersimpan/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  m = await mb();
  const { data: bud } = await sb.from("budgets").select("category, amount");
  cek("Zero-Based tersimpan: metode, target tabungan 1,5 jt, budget Makan 3 jt", m?.metode === "zero-based" && Number(m?.target_tabungan) === 1500000 && bud?.some((b) => b.category === "food" && Number(b.amount) === 3000000), JSON.stringify({ m, bud }));
  await buka(`${base}/analitik`, 6000);
  h = await halaman();
  cek("Analitik Zero-Based: budget per kategori + Tabungan + Belum dialokasikan Rp 3.500.000", /Makan/.test(h) && /Metode Zero-Based/.test(h) && /Belum dialokasikan.*Rp 3\.500\.000/.test(h) && /Tabungan.*Tercapai/.test(h), h.slice(-700));
  await fotoKartu("metode-4-analitik-zero.png", "Metode Zero-Based");

  // --- 4. 6 Jars: langsung tersimpan; toples Pendidikan & Tabungan jangka panjang.
  await buka(`${base}/profil/budget`, 5000);
  await langkah("pilih 6 Jars", `${radio("6 Jars")}.click(); await sampai(() => /Memakai metode 6 Jars/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  m = await mb();
  await buka(`${base}/analitik`, 6000);
  h = await halaman();
  cek("6 Jars: tersimpan; Analitik Pendidikan Rp 400.000 & Tabungan jangka panjang Rp 1.600.000", m?.metode === "6-jars" && /Pendidikan 10% Rp 400\.000/.test(h) && /Tabungan jangka panjang 10% Rp 1\.600\.000/.test(h), h.slice(-900));
  await fotoKartu("metode-5-jars.png", "Metode 6 Jars");

  // --- 5. Kakeibo: isi target → tersimpan; refleksi di bulan lalu.
  await buka(`${base}/profil/budget`, 5000);
  await langkah("isi Kakeibo", `${radio("Kakeibo")}.click(); await sampai(() => document.querySelector('input[placeholder="Target tabungan per bulan (Rp)"]')); await t(400);
    isi(document.querySelector('input[placeholder="Target tabungan per bulan (Rp)"]'), '1000000'); await t(300);
    ${tekan("Pakai Kakeibo")}.click(); await sampai(() => /Memakai metode Kakeibo/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  m = await mb();
  await buka(`${base}/analitik`, 6000);
  h = await halaman();
  cek("Kakeibo: tersimpan; pos tanpa jatah, Bisa dibelanjakan Rp 7.000.000", m?.metode === "kakeibo" && Number(m?.target_tabungan) === 1000000 && /Budaya Rp 400\.000/.test(h) && /% dari belanja/.test(h) && /Bisa dibelanjakan.*Rp 7\.000\.000/.test(h), h.slice(-900));
  await fotoKartu("metode-6-kakeibo.png", "Metode Kakeibo");
  const lalu = geser(-1);
  await buka(`${base}/analitik?bulan=${lalu}`, 6000);
  const refleksi = await langkah("refleksi bulan lalu", `const b = ${tekan("Refleksi")}; if (!b) return 'tidak ada tombol'; const teks = b.textContent; b.click();
    await sampai(() => [...document.querySelectorAll('dialog[open], aside')].some(d => /Refleksi Kakeibo/.test(d.innerText)), 20); await t(500); return teks`);
  h = await halaman();
  cek("Bulan lalu: tombol Refleksi <bulan> membuka Tanya AI dengan 'Refleksi Kakeibo <bulan>'", /^Refleksi \S+ \d{4}$/.test(norm(refleksi)) && new RegExp(`Refleksi Kakeibo ${norm(refleksi).replace("Refleksi ", "")}`).test(h), JSON.stringify(refleksi));

  console.log(masalah.length ? `masalah konsol: ${masalah.slice(0, 3).join(" | ")}` : "konsol bersih");
} catch (e) {
  console.log("GAGAL:", e.message);
  gagal++;
} finally {
  if (uid) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    console.log(error ? "GAGAL hapus akun uji" : "✓ akun uji dihapus");
  }
  console.log(gagal ? `${gagal} cek gagal` : "semua cek lulus");
  edge.kill();
  process.exit(0);
}
