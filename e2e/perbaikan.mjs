import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, PORT, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-perbaikan-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const klik = (sel) => `document.querySelector('${sel}').click()`;
const klikTeks = (teks, akar = "document") => `[...${akar}.querySelectorAll('button, a')].find(b => b.textContent.replace(/\\s+/g, ' ').trim().startsWith('${teks}')).click()`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const { data: tx } = await sb.from("transactions").insert({ user_id: uid, status: "confirmed", source: "text", type: "expense", amount: 25000, category: "food", merchant: "Kopi Kenangan", transaction_date: "2026-10-20", kantong_id: tunai.id }).select("id").single();
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // --- #2 Buang perubahan? Tiap form: tanpa ubahan langsung tertutup; setelah diubah, Batal/Esc/kembali bertanya.
  const FORM = [
    ["Catat manual", "/", `${klik('button[aria-label="Catat transaksi"]')}; await t(800); ${klik('button[aria-label="Catat manual (form)"]')}`],
    ["Edit transaksi", `/transactions/${tx.id}`, klikTeks("Edit transaksi")],
    ["Tambah kantong", "/profil/kantong", klik('button[aria-label="Tambah kantong"]')],
    ["Tambah kategori", "/profil/kategori", klikTeks("Tambah kategori pengeluaran")],
    ["Pinjamkan", "/pinjaman", klikTeks("Pinjamkan")],
    ["Kartu kredit", "/pinjaman", klikTeks("Kartu")],
    ["Cicilan baru", "/pinjaman", klikTeks("Cicilan")],
  ];
  for (const [nama, url, bukaForm] of FORM) {
    await buka(`${base}${url}`, 5000);
    const r = await langkah(`form ${nama}`, `
      const bukaLagi = async () => { ${bukaForm}; await sampai(() => dialog()?.querySelector('[class*=pil]')); await t(400); return dialog(); };
      const batal = () => [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Batal').click();
      const terbuka = () => [...document.querySelectorAll('dialog[open]')].length;
      // 1) tanpa ubahan: Batal langsung menutup
      let d = await bukaLagi(); const n0 = terbuka() - 1; batal(); await t(500);
      const polos = terbuka() === n0;
      // 2) diubah: ketik di isian teks pertama
      d = await bukaLagi();
      const kolom = [...d.querySelectorAll('input:not([type]), input[type=text], textarea')].find(x => !x.readOnly && x.offsetParent);
      isi(kolom, kolom.value + '7'); await t(300);
      batal(); await t(500);
      const tanya1 = /Buang perubahan\\?/.test(dialog()?.innerText || '');
      tombol('Batal', dialog()).click(); await t(500);
      const masihIsi = dialog()?.querySelector('[class*=pil]') && kolom.value.endsWith('7');
      // Esc (cancel) juga bertanya
      dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(500);
      const tanya2 = /Buang perubahan\\?/.test(dialog()?.innerText || '');
      tombol('Batal', dialog()).click(); await t(400);
      // tombol kembali di kepala juga bertanya; Buang menutup
      dialog().querySelector('[class*=dialogKepala] button').click(); await t(500);
      const tanya3 = /Buang perubahan\\?/.test(dialog()?.innerText || '');
      tombol('Buang', dialog()).click(); await t(600);
      return { polos, tanya1, masihIsi: !!masihIsi, tanya2, tanya3, tertutup: terbuka() === n0 }`);
    cek(`${nama}: tanpa ubahan langsung tutup; setelah diubah Batal/Esc/kembali bertanya; Buang menutup`, r && r.polos && r.tanya1 && r.masihIsi && r.tanya2 && r.tanya3 && r.tertutup, JSON.stringify(r));
  }

  // --- #4 Area sentuh 48px.
  await buka(`${base}/analitik`, 5000);
  const kirim = await langkah("tombol kirim Tanya AI", `${klik('button[aria-label="Tanya AI soal keuanganmu"]')}; await sampai(() => dialog()); await t(400); isi(dialog().querySelector('textarea'), 'x'); await t(200); const b = dialog().querySelector('button[aria-label="Kirim"]'); const r = b.getBoundingClientRect(); return { ukuran: Math.round(r.width) + 'x' + Math.round(r.height), kena: b.contains(document.elementFromPoint(r.left + r.width / 2, r.top - 3)) && b.contains(document.elementFromPoint(r.right + 3, r.top + r.height / 2)) }`);
  cek("Tanya AI: tombol kirim tetap 40px, area sentuh 48px", kirim.ukuran === "40x40" && kirim.kena, JSON.stringify(kirim));
  await buka(`${base}/profil/kantong`, 5000);
  const emoji = await langkah("pilihan emoji", `${klik('button[aria-label="Tambah kantong"]')}; await sampai(() => dialog()?.querySelector('[class*=gridEmoji] button')); const b = dialog().querySelector('[class*=gridEmoji] button'); const r = b.getBoundingClientRect(); return { ukuran: Math.round(r.width) + 'x' + Math.round(r.height), kena: b.contains(document.elementFromPoint(r.left + 20, r.top - 1.5)) }`);
  cek("Kantong: pilihan emoji tetap 44px, area sentuh 48px", emoji.ukuran === "44x44" && emoji.kena, JSON.stringify(emoji));

  // --- #1 Halaman offline.
  await buka(`${base}/`, 6000);
  const sw = await langkah("service worker siap", `await navigator.serviceWorker.ready; await sampai(() => navigator.serviceWorker.controller, 20); return !!(await caches.match('/offline.html'))`);
  cek("service worker aktif & halaman offline tersimpan", sw === true, String(sw));
  // Offline juga untuk service worker-nya (emulasi di halaman tidak menjangkau fetch SW).
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const wsB = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => wsB.addEventListener("open", r));
  let nB = 0;
  const tungguB = new Map();
  wsB.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && tungguB.has(m.id)) { tungguB.get(m.id)(m.result ?? m.error); tungguB.delete(m.id); } });
  const cdpB = (method, params = {}, sessionId) => new Promise((r) => { const n = ++nB; tungguB.set(n, r); wsB.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetInfos } = await cdpB("Target.getTargets");
  const swT = targetInfos.find((x) => x.type === "service_worker");
  const { sessionId: sesiSW } = await cdpB("Target.attachToTarget", { targetId: swT.targetId, flatten: true });
  await cdpB("Network.enable", {}, sesiSW);
  const putus = (offline) => Promise.all([
    cdp("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
    cdpB("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sesiSW),
  ]);
  await putus(true);
  await buka(`${base}/riwayat`, 3000);
  const off = await jalankan(`location.pathname + ' | ' + (document.querySelector('h1')?.textContent || '') + ' | ' + document.title`);
  cek("tanpa internet: halaman offline kita, bukan dinosaurus", /Kamu sedang offline/.test(off), off);
  await foto("360-offline.png");
  await putus(false);
  await tidur(6000);
  const pulih = await jalankan(`location.pathname + ' | ' + (document.querySelector('h1')?.textContent || '')`);
  cek("sinyal kembali: halaman tadi terbuka sendiri", /^\/riwayat \| Riwayat/.test(pulih), pulih);

  cek("tidak ada error console", masalah.filter((m) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/.test(m)).length === 0, JSON.stringify(masalah));
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
