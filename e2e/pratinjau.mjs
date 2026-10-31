import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, langkah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-pratinjau-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s).replace(/ /g, " ").replace(/\s+/g, " ");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const B = hariIni.slice(0, 7);
const KARTU = `const kartu = () => [...document.querySelectorAll('ul')].map(u => u.parentElement.innerText).find(x => /Penghasilan per bulan/.test(x));
const segmen = () => [...document.querySelectorAll('[aria-hidden] > span')].filter(x => x.parentElement.parentElement.innerText.includes('Penghasilan per bulan')).map(x => Math.round(x.getBoundingClientRect().width));
const radio = (teks) => [...document.querySelectorAll('[role=radio]')].find(b => b.textContent.includes(teks));`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // 0. Belum ada pemasukan.
  await buka(`${base}/profil/budget`, 5000);
  const kosong = await langkah("tanpa pemasukan", `${KARTU} return kartu()`);
  cek("Tanpa pemasukan: kartu menjelaskan rupiah menyusul", /Belum ada Belum ada penghasilan tercatat/.test(norm(kosong)) && /Ditargetkan/.test(norm(kosong)), norm(kosong));
  await foto("pratinjau-0-kosong.png");

  await sb.from("transactions").insert({ user_id: uid, status: "confirmed", source: "text", amount: 8000000, type: "income", category: "salary", merchant: "Kantor", transaction_date: `${B}-01`, kantong_id: tunai.id });
  await sb.from("budgets").insert({ user_id: uid, category: "food", amount: 3000000 });

  // 1. Per kategori.
  await buka(`${base}/profil/budget`, 5000);
  const kat = await langkah("per kategori", `${KARTU} return { k: kartu(), s: segmen() }`);
  cek("Per kategori: target dibanding pemasukan", /Penghasilan per bulan Rp 8\.000\.000 Penghasilan bulan ini/.test(norm(kat?.k)) && /Ditargetkan Rp 3 jt 38% penghasilan/.test(norm(kat?.k)) && /Belum dibagi Rp 5 jt 62% penghasilan/.test(norm(kat?.k)), JSON.stringify(kat));
  await foto("pratinjau-1-kategori.png");

  // 2. 50/30/20.
  const m1 = await langkah("50/30/20", `${KARTU} radio('50/30/20').click(); await sampai(() => /Memakai metode 50/.test(document.body.innerText), 20); await t(1500); return { k: kartu(), s: segmen(), p: teksHalaman() }`);
  cek("50/30/20: tiga kolom dengan persen & rupiah, penjelasan", /Kebutuhan 50% Rp 4 jt Keinginan 30% Rp 2,4 jt Tabungan & investasi 20% Rp 1,6 jt/.test(norm(m1?.k)) && /Seimbang/.test(m1?.p ?? ""), norm(m1?.k) + " " + JSON.stringify(m1?.s));
  await foto("pratinjau-2-503020.png");

  // 3. 70/20/10.
  const m2 = await langkah("70/20/10", `${KARTU} radio('70/20/10').click(); await sampai(() => /Memakai metode 70/.test(document.body.innerText), 20); await t(1500); return { k: kartu(), s: segmen() }`);
  cek("70/20/10: Berbagi 10%", /Berbagi 10% Rp 800.000/.test(norm(m2?.k)), norm(m2?.k) + " " + JSON.stringify(m2?.s));
  await foto("pratinjau-3-702010.png");

  // 4. Kustom, belum 100%: sisa terlihat sebelum disimpan.
  const m3 = await langkah("kustom 90%", `${KARTU} radio('Kustom').click(); await t(800);
    const f = (ph) => document.querySelector('input[placeholder="' + ph + ' (%)"]');
    isi(f('Kebutuhan'), '60'); isi(f('Keinginan'), '20'); isi(f('Tabungan & investasi'), '10'); isi(f('Berbagi'), '0'); await t(800);
    return { k: kartu(), s: segmen() }`);
  cek("Kustom 60/20/10: kolom Belum dibagi 10%, bilah ikut berubah", /Belum dibagi 10%/.test(norm(m3?.k)), norm(m3?.k) + " " + JSON.stringify(m3?.s));
  await foto("pratinjau-4-kustom.png");

  // 5. Layar lebar.
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  await buka(`${base}/profil/budget`, 5000);
  await foto("pratinjau-5-lebar.png");
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
