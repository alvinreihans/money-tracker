import { createRequire } from "node:module";
import { base, buka, cdp, edge, langkah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-kembali-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  await sb.from("user_accounts").insert({ user_id: uid, name: "Liburan", kind: "tujuan", emoji: "🎯", saldo_awal: 100000, saldo_per: "2026-01-01", target: 5000000 });
  await sb.from("metode_budget").insert({ user_id: uid, metode: "50-30-20", penghasilan: 8000000 });
  // Piutang ke Budi: kartu Utang & Piutang tampil di Beranda.
  await sb.from("user_accounts").insert({ user_id: uid, name: "Budi", kind: "orang", emoji: "👤", saldo_awal: 200000, saldo_per: "2026-01-01" });

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // Ketuk tautan berteks `teks`, tunggu alamatnya `ke`; lalu Kembali, kembalikan alamat akhirnya.
  const ketuk = (teks, ke) =>
    langkah(`ketuk ${teks}`, `const a = [...document.querySelectorAll('a')].find(x => x.innerText.includes(${JSON.stringify(teks)}) && x.offsetParent);
      a.click(); await sampai(() => location.pathname === ${JSON.stringify(ke)}, 30); await t(1500); return location.pathname`);
  const kembali = () =>
    langkah("kembali", `const lama = location.pathname; const b = [...document.querySelectorAll('a[aria-label="Kembali"]')].find(x => x.offsetParent);
      b.click(); await sampai(() => location.pathname !== lama, 30); await t(1500); return location.pathname`);

  // --- 1. Profil → Utang & Piutang → Kembali = Profil (dulu: Beranda).
  await buka(`${base}/profil`, 5000);
  await ketuk("Utang & Piutang", "/pinjaman");
  cek("Profil → Utang & Piutang → Kembali ke Profil", (await kembali()) === "/profil");

  // --- 2. Beranda → Utang & Piutang (kartu) → Kembali = Beranda.
  await buka(`${base}/`, 5000);
  const ke = await langkah("buka dari beranda", `await sampai(() => [...document.querySelectorAll('a')].some(x => x.innerText.includes('Lihat Utang & Piutang')), 20); return 'ok'`);
  await ketuk("Lihat Utang & Piutang", "/pinjaman");
  cek("Beranda → Utang & Piutang → Kembali ke Beranda", (await kembali()) === "/", ke);

  // --- 3. Kantong → Tujuan tabungan → Kembali = Kantong; lalu Kembali = Profil.
  await buka(`${base}/profil`, 5000);
  await ketuk("Kantong", "/profil/kantong");
  await ketuk("Disisihkan ke tujuan", "/profil/tujuan");
  const k1 = await kembali();
  const k2 = await kembali();
  cek("Profil → Kantong → Tujuan → Kembali ke Kantong → Kembali ke Profil", k1 === "/profil/kantong" && k2 === "/profil", JSON.stringify([k1, k2]));

  // --- 4. Analitik → Atur metode (Budget) → Kembali = Analitik.
  await buka(`${base}/analitik`, 6000);
  await ketuk("Atur metode", "/profil/budget");
  cek("Analitik → Atur metode → Kembali ke Analitik", (await kembali()) === "/analitik");

  // --- 5. Dibuka langsung (notifikasi/pintasan): tanpa halaman sebelumnya → cadangan.
  await buka("about:blank", 500);
  await buka(`${base}/pinjaman`, 5000);
  const k5 = await kembali();
  await buka("about:blank", 500);
  await buka(`${base}/profil/tujuan`, 5000);
  const k6 = await kembali();
  cek("Dibuka langsung: Utang & Piutang → Beranda, Tujuan → Profil (cadangan)", k5 === "/" && k6 === "/profil", JSON.stringify([k5, k6]));
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
