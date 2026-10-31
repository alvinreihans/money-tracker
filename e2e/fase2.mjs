import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-fase2-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const ukur = async (w, h = 860) => { await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await tidur(700); };
// Jawaban Tanya AI tiruan (tanpa kuota): satu jawaban dengan tautan ke Riwayat.
const TIRU = `window.__tiru = window.__tiru || (() => { const asli = window.fetch; window.fetch = (u, o) => String(u).includes('/api/tanya') ? new Promise(r => setTimeout(() => r(new Response(JSON.stringify({ jawaban: 'Total kopi bulan ini Rp 47.000.', tautan: [{ label: 'Lihat di Riwayat', href: '/riwayat?q=kopi' }], ragu: false }), { status: 200, headers: { 'content-type': 'application/json' } })), 300)) : asli(u, o); return true; })()`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // --- 1. "+ Tambah cerita" setelah mencatat.
  await ukur(360);
  await buka(`${base}/`, 6000);
  const cerita = await langkah("catat lalu tambah cerita", `
    document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
    isi(dialog().querySelector('textarea'), 'kopi 18rb tunai'); await t(200);
    dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => tombol('+ Tambah cerita', dialog()), 60);
    tombol('+ Tambah cerita', dialog()).click(); await t(300);
    const placeholder = dialog().querySelector('textarea').placeholder;
    await t(6000); // lewat batas hilang-sendiri kartu ringkas: harus tetap ada selama menulis cerita
    const masihAda = !!tombol('Batal cerita', dialog());
    isi(dialog().querySelector('textarea'), 'traktir teman kantor'); await t(200);
    dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => /traktir teman kantor/.test(dialog()?.innerText || ''), 20);
    return { placeholder, masihAda, kartu: /“traktir teman kantor”/.test(dialog().innerText), chipHilang: !tombol('+ Tambah cerita', dialog()), draf: localStorage.getItem('catat-draf'), tanpaGalat: !dialog().querySelector('[class*=galat]') }`);
  const { data: tx } = await sb.from("transactions").select("description, merchant").order("created_at", { ascending: false }).limit(1).single();
  cek("Catat: '+ Tambah cerita' → tersimpan sebagai keterangan, kartu menampilkannya, chip hilang, tidak jadi draf",
    cerita && cerita.tanpaGalat && /Ceritain singkat/.test(cerita.placeholder) && cerita.masihAda && cerita.kartu && cerita.chipHilang && cerita.draf === null && tx?.description === "traktir teman kantor",
    JSON.stringify({ cerita, tx }));
  await foto("fase2-cerita.png");
  await langkah("tutup", `dialog()?.dispatchEvent(new Event('cancel', { cancelable: true })); await t(500); return 'ok'`);

  // --- 2. Tombol AI: Beranda & Analitik ya, Riwayat tidak.
  const tombolDi = async (hal) => { await buka(`${base}${hal}`, 5000); return jalankan(`!!document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]')`); };
  const ada = { beranda: await tombolDi("/"), analitik: await tombolDi("/analitik"), riwayat: await tombolDi("/riwayat") };
  cek("Tombol AI di Beranda & Analitik, tidak di Riwayat", ada.beranda && ada.analitik && !ada.riwayat, JSON.stringify(ada));

  // --- 3. Bulan acuan: Analitik bulan lalu → saran menyebut bulan itu; Beranda → bulan berjalan.
  const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const [th, bl] = hariIni.slice(0, 7).split("-").map(Number);
  const lalu = new Date(Date.UTC(th, bl - 2, 1)).toISOString().slice(0, 7);
  const NAMA = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  await buka(`${base}/analitik?bulan=${lalu}`, 5000);
  const saranLalu = await langkah("saran di Analitik bulan lalu", `document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()); await t(400); return [...dialog().querySelectorAll('[class*=gptSaran] button')][0]?.innerText.split('\\n')[0]`);
  await langkah("tutup", `dialog().querySelector('[class*=dialogKepala] button').click(); await t(400); return 'ok'`);
  await buka(`${base}/`, 5000);
  const saranIni = await langkah("saran di Beranda", `document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()); await t(400); return [...dialog().querySelectorAll('[class*=gptSaran] button')][0]?.innerText.split('\\n')[0]`);
  cek("Bulan acuan: Analitik bulan lalu → saran bulan lalu; Beranda → bulan berjalan",
    saranLalu === `Kenapa ${NAMA[Number(lalu.slice(5)) - 1]} boros?` && saranIni === `Kenapa ${NAMA[bl - 1]} boros?`, JSON.stringify({ saranLalu, saranIni }));
  await langkah("tutup", `dialog().querySelector('[class*=dialogKepala] button').click(); await t(400); return 'ok'`);

  // --- 4. Layar lebar: panel tetap terbuka setelah tautan diikuti, obrolannya utuh.
  await ukur(1024);
  await buka(`${base}/analitik`, 5000);
  await jalankan(TIRU);
  const lebar = await langkah("ikuti tautan di 1024", `
    document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog());
    isi(dialog().querySelector('textarea'), 'total kopi?'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => [...dialog().querySelectorAll('a')].some(a => a.innerText.includes('Lihat di Riwayat')), 20);
    [...dialog().querySelectorAll('a')].find(a => a.innerText.includes('Lihat di Riwayat')).click();
    await sampai(() => location.pathname === '/riwayat', 20); await t(1500);
    const d = dialog();
    return { url: location.pathname + location.search, terbuka: !!d, modal: d?.matches(':modal'), obrolan: /Rp.47\\.000/.test(d?.innerText || '') }`);
  cek("1024: tautan → Riwayat di sebelah, panel tetap terbuka dengan obrolannya", lebar && lebar.url === "/riwayat?q=kopi" && lebar.terbuka && lebar.modal === false && lebar.obrolan, JSON.stringify(lebar));
  await foto("fase2-panel-riwayat.png");

  // --- 5. HP: tautan menutup lembar; dibuka lagi (dari Beranda) obrolannya masih ada.
  await ukur(360);
  await buka(`${base}/analitik`, 5000);
  await jalankan(TIRU);
  const hp = await langkah("ikuti tautan di 360", `
    document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog());
    isi(dialog().querySelector('textarea'), 'total kopi?'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => [...dialog().querySelectorAll('a')].some(a => a.innerText.includes('Lihat di Riwayat')), 20);
    [...dialog().querySelectorAll('a')].find(a => a.innerText.includes('Lihat di Riwayat')).click();
    await sampai(() => location.pathname === '/riwayat', 20); await t(1000);
    const tertutup = !dialog();
    document.querySelector('nav a[href="/"]').click(); await sampai(() => location.pathname === '/', 20); await t(1500);
    document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()); await t(400);
    return { tertutup, obrolanKembali: /Rp.47\\.000/.test(dialog().innerText) && dialog().innerText.includes('total kopi?') }`);
  cek("360: tautan menutup lembar; dibuka lagi dari Beranda, obrolannya masih ada", hp && hp.tertutup && hp.obrolanKembali, JSON.stringify(hp));

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
