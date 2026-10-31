import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-a11y-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const ukur = async (w, h = 860) => { await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await tidur(700); };
const KECIL = `const hasil = {}; for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=switch], [role=checkbox], [role=radio]')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue; if (el.closest('nextjs-portal')) continue; if (r.height < 48 || r.width < 48) { const k = (el.tagName.toLowerCase() + '.' + ((el.className && typeof el.className === 'string') ? el.className.split(' ').map(c => c.split('__').at(-1)).join('.') : '') + (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : '')).slice(0, 70); hasil[k] = (hasil[k] || '') ? hasil[k] : Math.round(r.width) + 'x' + Math.round(r.height); } } return hasil;`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const tx = (amount, merchant, d) => ({ user_id: uid, status: "confirmed", source: "text", type: "expense", amount, category: "food", merchant, transaction_date: d, kantong_id: tunai.id });
  await sb.from("transactions").insert([tx(25000, "Kopi Kenangan", "2026-10-20"), tx(40000, "Warteg", "2026-10-22")]);
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // Audit ukuran sentuh di HP.
  await ukur(360);
  for (const hal of ["/", "/riwayat", "/analitik", "/profil", "/profil/kantong", "/pinjaman"]) {
    await buka(`${base}${hal}`, 5000);
    console.log(`KECIL ${hal}:`, JSON.stringify(await jalankan(`(() => { ${KECIL} })()`)));
  }
  await buka(`${base}/`, 5000);
  await jalankan(`document.querySelector('button[aria-label="Catat transaksi"]').click()`);
  await tidur(1000);
  console.log(`KECIL Catat:`, JSON.stringify(await jalankan(`(() => { ${KECIL} })()`)));

  // #4 area sentuh 48: ketukan 3px di luar tepi chip/pegangan tetap kena; jarak antar baris chip tetap.
  await buka(`${base}/riwayat`, 5000);
  const chip = await jalankan(`(() => { const baris = [...document.querySelectorAll('[class*=chips]')]; const c1 = baris[0].querySelector('button'), c2 = baris[1].querySelector('button'); const a = c1.getBoundingClientRect(), b = c2.getBoundingClientRect(); const kena = (x, y, el) => el.contains(document.elementFromPoint(x, y)); return { tinggi: Math.round(a.height), jarakBaris: Math.round(b.top - a.bottom), atas: kena(a.left + 20, a.top - 3, c1), bawah: kena(b.left + 20, b.bottom + 3, c2) } })()`);
  cek("chip Riwayat: tampak 40px, jarak baris tetap 12px, area sentuh 48px", chip.tinggi === 40 && chip.jarakBaris === 12 && chip.atas && chip.bawah, JSON.stringify(chip));
  await buka(`${base}/`, 5000);
  const peg = await jalankan(`(async () => { document.querySelector('button[aria-label="Catat transaksi"]').click(); await new Promise(r => setTimeout(r, 900)); const d = [...document.querySelectorAll('dialog[open]')].at(-1); const p = d.querySelector('[data-pegangan]'); const r = p.getBoundingClientRect(); const c = d.querySelector('[class*=saran] button'); const s = c.getBoundingClientRect(); return { pegangan: Math.round(r.width) + 'x' + Math.round(r.height), kenaPegangan: p.contains(document.elementFromPoint(r.left + 18, r.bottom + 20)), saran: Math.round(s.height), kenaSaran: c.contains(document.elementFromPoint(s.left + 20, s.top - 5)) } })()`);
  cek("Catat: pegangan & chip saran tampak sama, area sentuh 48px", peg.pegangan === "36x4" && peg.kenaPegangan && peg.saran === 36 && peg.kenaSaran, JSON.stringify(peg));
  await foto("360-catat-a11y.png");

  // #1 satu h1.
  const h = async () => jalankan(`[...document.querySelectorAll('h1, h2')].filter(e => e.getClientRects().length).map(e => e.tagName + ':' + e.textContent.slice(0, 20)).join(' | ')`).then(x => String(x).replace(/\u00a0/g, ' '));
  await buka(`${base}/riwayat`, 5000);
  await jalankan(`(async () => { [...document.querySelectorAll('[class*=panelDaftar] a')].find(a => a.innerText.includes('Warteg')).click(); })()`);
  await tidur(3000);
  const hp = await jalankan(`[...document.querySelectorAll('h1')].filter(e => e.getClientRects().length).length + ' h1: ' + [...document.querySelectorAll('h1')].filter(e => e.getClientRects().length).map(e => e.innerText).join(',')`).then(x => String(x).replace(/ /g, ' '));
  cek("360 detail: tepat satu h1 (judul detail)", /^1 h1: Rp 40\.000$/.test(hp), hp);
  await ukur(1024);
  await buka(`${base}/riwayat`, 5000);
  await jalankan(`(async () => { [...document.querySelectorAll('[class*=panelDaftar] a')].find(a => a.innerText.includes('Warteg')).click(); })()`);
  await tidur(2500);
  const lebar = await h();
  cek("1024 Riwayat dua panel: h1 Riwayat, judul detail h2", /^H1:Riwayat\b/.test(lebar) && /H2:Rp 40\.000/.test(lebar) && (lebar.match(/H1:/g) || []).length === 1, lebar);
  await buka(`${base}/profil/kantong`, 5000);
  const prof = await h();
  cek("1024 Profil: satu h1 (Profil), Kantong h2", (prof.match(/H1:/g) || []).length === 1 && /H1:Profil/.test(prof) && /H2:Kantong/.test(prof), prof);

  // #2 scroll-padding & #3 margin 24px.
  const pad = await jalankan(`({ html: getComputedStyle(document.documentElement).scrollPaddingTop, panel: getComputedStyle(document.querySelector('[class*=panelDetail]')).scrollPaddingTop, tepi: getComputedStyle(document.querySelector('[class*=isi]')).paddingLeft })`);
  cek("1024: scroll-padding atas di halaman & panel, margin isi 24px", pad.html === "72px" && pad.panel === "72px" && pad.tepi === "24px", JSON.stringify(pad));
  await ukur(360);
  await buka(`${base}/riwayat`, 5000);
  const hpPad = await jalankan(`({ tepi: getComputedStyle(document.querySelector('[class*=isi]')).paddingLeft, bawah: getComputedStyle(document.documentElement).scrollPaddingBottom, samping: document.documentElement.scrollWidth - innerWidth })`);
  cek("360: margin isi tetap 16px, scroll-padding bawah setinggi navigasi, tanpa gulir samping", hpPad.tepi === "16px" && hpPad.bawah === "100px" && hpPad.samping <= 0, JSON.stringify(hpPad));
  cek("tidak ada error console", masalah.length === 0, JSON.stringify(masalah));
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
