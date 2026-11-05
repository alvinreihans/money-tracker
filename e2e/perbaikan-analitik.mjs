// Perbaikan temuan B1–B7 (SPEC-perbaikan-temuan): tautan telusur Analitik
// (merchant=, tujuan=tanpa), pembanding proyeksi, ambang 80%, saran penghasilan
// per bulan, Zero-Based tanpa penghasilan, status "hampir" & progressbar.
// B8/B9 (Tanya AI) diuji di uji:tanya & eval:tanya.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-perbaikan-analitik-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const B = hariIni.slice(0, 7);
const geser = (n) => { const [t, b] = B.split("-").map(Number); return new Date(Date.UTC(t, b - 1 + n, 1)).toISOString().slice(0, 7); };
const tgl = (h) => `${B}-${String(Math.min(h, Number(hariIni.slice(8)))).padStart(2, "0")}`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const sejak = "2026-01-01T00:00:00+07:00";
  const { data: bca } = await sb.from("user_accounts").insert({ user_id: uid, name: "BCA", kind: "bank", emoji: "🏦", saldo_awal: 50000000, saldo_sejak: sejak }).select("id").single();
  const { data: darurat } = await sb.from("user_accounts").insert({ user_id: uid, name: "Dana darurat", kind: "tujuan", emoji: "🛟", saldo_awal: 3000000, saldo_sejak: sejak, target: 30000000 }).select("id").single();
  const tx = (amount, type, category, merchant, d, extra = {}) => ({ user_id: uid, status: "confirmed", source: "text", amount, type, category, merchant, transaction_date: d, kantong_id: bca.id, ...extra });
  // Gaji 6 jt (3 bulan lalu) & 10 jt (bulan lalu): saran bulan ini = rerata 8 jt; saran 2 bulan lalu = 6 jt.
  const { data: gaji, error: e1 } = await sb
    .from("transactions")
    .insert([tx(6000000, "income", "salary", "Kantor", `${geser(-3)}-25`), tx(10000000, "income", "salary", "Kantor", `${geser(-1)}-25`)])
    .select("id");
  if (e1) throw e1;
  const { error: e2 } = await sb.from("transactions").insert([
    // Keinginan 1,92 jt = tepat 80% jatah 2,4 jt (50/30/20 dari 8 jt) → hampir.
    tx(960000, "expense", "shopping", "Toko Besar", tgl(1), { kelompok: "keinginan" }),
    tx(960000, "expense", "shopping", "toko  besar", tgl(2), { kelompok: "keinginan" }),
    // Kebutuhan 5,3 jt dari jatah 4 jt → 133%, lewat.
    tx(5300000, "expense", "food", "Katering", tgl(1), { kelompok: "kebutuhan" }),
    // Dibayar dari tujuan tabungan: di luar semua angka Analitik.
    tx(500000, "expense", "health", "Apotek", tgl(2), { kantong_id: darurat.id }),
  ]);
  if (e2) throw e2;
  await sb.from("budgets").insert([{ user_id: uid, category: "shopping", amount: 2400000 }, { user_id: uid, category: "food", amount: 1000000 }]);
  await sb.from("metode_budget").upsert({ user_id: uid, metode: "50-30-20" });

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  const halaman = async () => norm(await jalankan(`document.body.innerText`));
  const tautan = async () => JSON.parse(await jalankan(`JSON.stringify([...document.querySelectorAll('a[href^="/riwayat"]')].map(a => ({ teks: a.innerText.replace(/\\s+/g, ' '), href: a.getAttribute('href') })))`));

  // --- B1/B2: tautan telusur Analitik.
  await buka(`${base}/analitik`, 7000);
  let h = await halaman();
  const t = await tautan();
  const merchant = t.find((x) => /^toko besar/i.test(x.teks) && x.href.includes("merchant="));
  cek("B1: merchant teratas → merchant=<nama> (bukan q=) + tujuan=tanpa", merchant && /merchant=toko(\+|%20)besar/i.test(merchant.href) && !/[?&]q=/.test(merchant.href) && merchant.href.includes("tujuan=tanpa"), JSON.stringify(merchant ?? t));
  cek("B1: sorotan 'Paling sering' juga merchant=", t.some((x) => x.teks.includes("Paling sering") && x.href.includes("merchant=")), JSON.stringify(t.filter((x) => x.teks.includes("Paling sering"))));
  const kat = t.filter((x) => x.href.includes("kategori=expense:"));
  cek("B2: tautan kategori & kelompok membawa tujuan=tanpa", kat.length > 0 && kat.every((x) => x.href.includes("tujuan=tanpa")) && t.some((x) => x.href.includes("kelompok=") && x.href.includes("tujuan=tanpa")), JSON.stringify(kat));
  const dari = t.find((x) => x.href.includes(`kantong=${darurat.id}`) && x.href.includes("jenis=keluar"));
  cek("B2: tautan 'dibayar dari tujuan' tanpa tujuan=tanpa; masuk juga tidak", dari && !dari.href.includes("tujuan=tanpa") && t.filter((x) => x.href.includes("jenis=masuk")).every((x) => !x.href.includes("tujuan=tanpa")), JSON.stringify(dari ?? t));
  cek("Analitik tidak menghitung Apotek dari tujuan: keluar Rp 7,2 jt, Makan 73%", /Keluar Rp 7,2 jt/.test(h) && /Makan 73%/.test(h), h.slice(0, 300));

  // --- B3: proyeksi dibanding jatah pengeluaran metode (8 jt − 20% = 6,4 jt), bukan budget per kategori.
  if (Number(hariIni.slice(8)) >= 3) cek("B3: proyeksi dibanding jatah pengeluaran 50/30/20 Rp 6,4 jt", /jatah pengeluaran 50\/30\/20 Rp 6,4 jt/.test(h) && !/total budget/.test(h), (h.match(/Kalau begini terus[^.]*\.[^.]*/) ?? [h.slice(0, 300)])[0]);
  else console.log("(B3 dilewati: proyeksi baru ada mulai hari ke-3)");

  // --- B4/B7: kartu metode — tepat 80% "Hampir habis · sisa", progressbar dibatasi 0–100.
  cek("B4/B7: Keinginan 80% → 'Hampir habis · sisa Rp 480.000'", /Keinginan 30% Rp 1\.920\.000.*Hampir habis · sisa Rp 480\.000/.test(h), (h.match(/Keinginan 30%.{0,120}/) ?? [""])[0]);
  const bar = JSON.parse(await jalankan(`JSON.stringify([...document.querySelectorAll('[role=progressbar]')].map(b => [b.getAttribute('aria-label'), b.getAttribute('aria-valuenow'), b.getAttribute('aria-valuetext')]))`));
  const keb = bar.find((b) => b[0]?.startsWith("Kebutuhan"));
  cek("B7: progressbar Kebutuhan 133% → valuenow 100, valuetext 133%", keb && keb[1] === "100" && keb[2] === "133%" && bar.every((b) => Number(b[1]) >= 0 && Number(b[1]) <= 100), JSON.stringify(bar));
  await jalankan(`[...document.querySelectorAll('section')].find(x => x.innerText.includes('Metode 50/30/20'))?.scrollIntoView({ block: "center" })`);
  await tidur(600);
  await foto("perbaikan-analitik-1-metode.png");

  // --- B5: bulan lampau memakai saran bulan itu (6 jt), bulan ini rerata 8 jt.
  cek("B5: bulan ini dari penghasilan Rp 8 jt", /Dari penghasilan Rp 8 jt per bulan/.test(h), (h.match(/Dari penghasilan[^.]*/) ?? [""])[0]);
  await buka(`${base}/analitik?bulan=${geser(-2)}`, 6000);
  h = await halaman();
  cek("B5: dua bulan lalu dari penghasilan Rp 6 jt (saran bulan itu)", /Dari penghasilan Rp 6 jt per bulan/.test(h), (h.match(/Dari penghasilan[^.]*/) ?? [h.slice(-300)])[0]);
  // Penghasilan yang diatur sendiri tetap satu angka.
  await sb.from("metode_budget").upsert({ user_id: uid, metode: "50-30-20", penghasilan: 7000000 });
  await buka(`${base}/analitik?bulan=${geser(-2)}`, 6000);
  h = await halaman();
  cek("B5: penghasilan diatur 7 jt dipakai juga di bulan lampau", /Dari penghasilan Rp 7 jt per bulan/.test(h), (h.match(/Dari penghasilan[^.]*/) ?? [""])[0]);
  await sb.from("metode_budget").upsert({ user_id: uid, metode: "50-30-20", penghasilan: null });

  // --- B4 & B3 tanpa metode: kartu budget per kategori, tepat 80% sudah kuning; pembanding = total budget.
  await sb.from("metode_budget").upsert({ user_id: uid, metode: "kategori" });
  await buka(`${base}/analitik`, 6000);
  h = await halaman();
  const belanja = JSON.parse(await jalankan(`JSON.stringify((() => { const b = [...document.querySelectorAll('[role=progressbar]')].find(x => x.getAttribute('aria-label')?.startsWith('Belanja:')); const s = b?.parentElement?.querySelector(':scope > span:last-child > span:first-child'); return b && [b.getAttribute('aria-valuenow'), s?.getAttribute('style') ?? '']; })())`));
  cek("B4: budget Belanja tepat 80% → warna peringatan", belanja && belanja[0] === "80" && /peringatan/.test(belanja[1]), JSON.stringify(belanja));
  if (Number(hariIni.slice(8)) >= 3) cek("B3: tanpa metode → dibanding total budget Rp 3,4 jt", /total budget Rp 3,4 jt/.test(h), (h.match(/Kalau begini terus[^.]*\.[^.]*/) ?? [""])[0]);

  // --- B6: Zero-Based tanpa penghasilan → "Atur penghasilan dulu", tanpa "Belum dialokasikan" (Analitik & Profil sama).
  await sb.from("transactions").delete().in("id", gaji.map((g) => g.id));
  await sb.from("metode_budget").upsert({ user_id: uid, metode: "zero-based", target_tabungan: 1000000 });
  await buka(`${base}/analitik`, 6000);
  h = await halaman();
  const atur = await jalankan(`[...document.querySelectorAll('a')].find(a => a.innerText.includes('Atur penghasilan dulu'))?.getAttribute('href') ?? null`);
  cek("B6: Analitik Zero-Based penghasilan 0 → 'Atur penghasilan dulu' ke /profil/budget, tanpa 'Belum dialokasikan'/'melebihi'", atur === "/profil/budget" && !/Belum dialokasikan|Target melebihi penghasilan/.test(h), `${atur} ${h.slice(-500)}`);
  await jalankan(`[...document.querySelectorAll('section')].find(x => x.innerText.includes('Metode Zero-Based'))?.scrollIntoView({ block: "center" })`);
  await tidur(600);
  await foto("perbaikan-analitik-2-zero.png");
  await buka(`${base}/profil/budget`, 6000);
  h = await halaman();
  cek("B6: pratinjau Profil juga tanpa 'Belum dialokasikan'", /Zero-Based/.test(h) && !/Belum dialokasikan|Melebihi penghasilan/.test(h), h.slice(0, 400));

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
