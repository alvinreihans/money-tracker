import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-lebar-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const ukur = async (w, h = 860) => { await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await tidur(700); };
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const { data: gopay } = await sb.from("user_accounts").insert({ user_id: uid, name: "GoPay", kind: "ewallet", emoji: "📱", saldo_awal: 500000, saldo_sejak: "2026-01-01T00:00:00+07:00" }).select().single();
  const tx = (amount, category, merchant, transaction_date, kantong_id = tunai.id) => ({ user_id: uid, status: "confirmed", source: "text", type: "expense", amount, category, merchant, transaction_date, kantong_id });
  await sb.from("transactions").insert([
    tx(25000, "food", "Warteg Selera Bahari", "2026-10-02"),
    tx(25000, "food", "Kopi Kenangan", "2026-10-20", gopay.id),
    tx(22000, "food", "Kopi Janji Jiwa", "2026-10-21", gopay.id),
    tx(150000, "shopping", "Indomaret", "2026-10-22", gopay.id),
    tx(40000, "transport", "Gojek", "2026-10-23", gopay.id),
    tx(60000, "food", "Solaria", "2026-09-15"),
  ]);

  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // --- 1. Lima lebar × lima halaman: tanpa gulir samping, jenis navigasi benar.
  const NAV = `(() => { const n = document.querySelector('nav[aria-label="Navigasi utama"]').getBoundingClientRect(); const lb = document.querySelector('nav a[href="/pinjaman"]'); return { kiri: Math.round(n.left), lebar: Math.round(n.width), bawah: Math.round(innerHeight - n.bottom), tinggi: Math.round(n.height), lb: lb ? getComputedStyle(lb).display : 'x', samping: document.documentElement.scrollWidth - innerWidth } })()`;
  for (const w of [360, 412, 700, 1024, 1440]) {
    await ukur(w);
    for (const hal of ["/", "/riwayat", "/analitik", "/profil/kantong", "/pinjaman"]) {
      await buka(`${base}${hal}`, hal === "/" ? 6000 : 4500);
      const n = await jalankan(NAV);
      const jenis = w < 600 ? n.bawah >= 10 && n.lebar <= 440 && n.tinggi < 100 : w < 1200 ? n.kiri === 0 && n.lebar === 80 && n.tinggi >= 700 : n.kiri === 0 && n.lebar === 240 && n.lb !== "none";
      const lbOk = w >= 1200 ? n.lb !== "none" : n.lb === "none";
      cek(`${w}px ${hal}: navigasi & tanpa gulir samping`, jenis && lbOk && n.samping <= 0, JSON.stringify(n));
      if (["/", "/riwayat", "/analitik"].includes(hal)) await foto(`${w}-${hal === "/" ? "beranda" : hal.slice(1)}.png`);
    }
  }

  // --- 2. Dua kolom kartu di Beranda & Analitik (1024).
  await ukur(1024);
  await buka(`${base}/`, 6000);
  const kolomBeranda = await langkah("kolom Beranda", `const k = document.querySelector('[class*=isiKolom]'); const kaki = [...k.querySelectorAll('a')].find(a => a.innerText.includes('Lihat semua riwayat')); return { kolom: new Set([...k.children].map(c => Math.round(c.getBoundingClientRect().left))).size, kakiSekolom: Math.round(kaki.getBoundingClientRect().left) === Math.round(k.querySelector('[class*=kartuTx]').getBoundingClientRect().left) }`);
  cek("Beranda 1024: kartu di dua kolom, 'Lihat semua' tetap di bawah daftarnya", kolomBeranda.kolom === 2 && kolomBeranda.kakiSekolom, JSON.stringify(kolomBeranda));
  await buka(`${base}/analitik`, 6000);
  const kolomAnalitik = await langkah("kolom Analitik", `const k = document.querySelector('[class*=isiKolom]'); return new Set([...k.children].filter(c => c.tagName !== 'NAV').map(c => Math.round(c.getBoundingClientRect().left))).size`);
  cek("Analitik 1024: kartu di dua kolom", kolomAnalitik === 2, String(kolomAnalitik));

  // --- 3. Tanya AI menempel di kanan (1024), halaman tetap bisa digulir.
  const panel = await langkah("buka Tanya AI", `document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()); await t(600); const d = dialog(); const r = d.getBoundingClientRect(); return { modal: d.matches(':modal'), kanan: Math.round(document.documentElement.clientWidth - r.right), lebar: Math.round(r.width), padKanan: getComputedStyle(document.body).paddingRight, gulir: getComputedStyle(document.body).overflow, tombolAI: !!document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]'), kolom: new Set([...document.querySelector('[class*=isiKolom]').children].filter(c => c.tagName !== 'NAV').map(c => Math.round(c.getBoundingClientRect().left))).size }`);
  cek("Tanya AI 1024: panel non-modal 400px di kanan, isi bergeser, halaman bisa digulir", panel.modal === false && panel.kanan === 0 && panel.lebar === 400 && panel.padKanan === "400px" && panel.gulir !== "hidden" && !panel.tombolAI, JSON.stringify(panel));
  cek("Tanya AI 1024: kartu turun ke satu kolom karena ruangnya sempit", panel.kolom === 1, String(panel.kolom));
  await langkah("ketik di Tanya AI", `isi(dialog().querySelector('textarea'), 'tes lipat layar'); return 'ok'`);
  await foto("1024-tanya-samping.png");
  await ukur(700);
  const lipat = await langkah("Tanya AI setelah 700px", `const d = dialog(); return { modal: d?.matches(':modal'), teks: d?.querySelector('textarea')?.value, lebar: Math.round(d.getBoundingClientRect().width) }`);
  cek("Tanya AI 1024→700: jadi pop-up modal, ketikan tetap", lipat.modal === true && lipat.teks === "tes lipat layar" && lipat.lebar <= 640, JSON.stringify(lipat));
  await foto("700-tanya-popup.png");
  await ukur(1024);
  const esc = await langkah("Esc menutup panel", `const d = dialog(); d.querySelector('textarea').focus(); d.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await t(500); return { buka: !!dialog(), tombolAI: !!document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]'), padKanan: getComputedStyle(document.body).paddingRight }`);
  cek("Tanya AI: Esc menutup panel samping", !esc.buka && esc.tombolAI && esc.padKanan === "0px", JSON.stringify(esc));

  // --- 4. Riwayat daftar + detail (1024).
  await buka(`${base}/riwayat?jenis=keluar`, 6000);
  const awalR = await langkah("Riwayat awal", `const det = document.querySelector('[class*=panelDetail]'); return { kosong: det.childElementCount === 0, teks: getComputedStyle(det, '::before').content, daftar: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display }`);
  cek("Riwayat 1024: panel kanan kosong dengan petunjuk", awalR.kosong && /Pilih transaksi/.test(awalR.teks) && awalR.daftar !== "none", JSON.stringify(awalR));
  const pilihR = await langkah("klik Indomaret", `const a = [...document.querySelectorAll('[class*=panelDaftar] a')].find(a => a.innerText.includes('Indomaret')); a.click(); await sampai(() => document.querySelector('[class*=panelDetail]').innerText.includes('150.000')); await t(300); const det = document.querySelector('[class*=panelDetail]'); return { url: location.pathname + location.search, detail: det.innerText.split(/\\s+/).slice(0, 8).join(' '), terpilih: document.querySelector('[class*=panelDaftar] a[aria-current="true"]')?.innerText.includes('Indomaret'), daftar: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display, filter: document.querySelector('[class*=chip][aria-pressed="true"]')?.innerText }`);
  const tanpaKembali = await langkah("tombol kembali di panel detail", `const k = document.querySelector('[class*=panelDetail] a[aria-label="Kembali"]'); return k ? getComputedStyle(k).display : 'tidak ada'`);
  cek("Riwayat 1024: panel detail tanpa tombol kembali (dua panel terlihat)", tanpaKembali === "none", tanpaKembali);
  cek("Riwayat 1024: klik → detail di kanan, ?id=, baris tertanda, daftar & filter tetap", /^\/riwayat\?jenis=keluar&id=/.test(pilihR.url) && /150\.000/.test(pilihR.detail) && pilihR.terpilih && pilihR.daftar !== "none" && pilihR.filter === "Keluar", JSON.stringify(pilihR));
  await foto("1024-riwayat-detail.png");
  const kembaliR = await langkah("back browser", `history.back(); await sampai(() => !location.search.includes('id=')); await t(800); return { url: location.search, kosong: document.querySelector('[class*=panelDetail]').childElementCount === 0 }`);
  cek("Riwayat 1024: back browser → panel kosong lagi", kembaliR.kosong && !/id=/.test(kembaliR.url), JSON.stringify(kembaliR));

  // Fold dilipat saat detail terbuka: detail tampil penuh, "kembali" → daftar.
  await langkah("klik Gojek", `[...document.querySelectorAll('[class*=panelDaftar] a')].find(a => a.innerText.includes('Gojek')).click(); await sampai(() => document.querySelector('[class*=panelDetail]').innerText.includes('40.000')); return 'ok'`);
  await ukur(360);
  const sempit = await langkah("Riwayat 360 dengan id", `return { daftar: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display, detail: document.querySelector('[class*=panelDetail]').innerText.includes('40.000'), kembali: !!document.querySelector('[class*=panelDetail] a[aria-label="Kembali"]') }`);
  cek("Riwayat 1024→360: detail tampil penuh dengan tombol kembali", sempit.daftar === "none" && sempit.detail && sempit.kembali, JSON.stringify(sempit));
  await foto("360-riwayat-detail.png");
  const keDaftar = await langkah("ketuk kembali", `document.querySelector('[class*=panelDetail] a[aria-label="Kembali"]').click(); await sampai(() => !location.search.includes('id=')); await t(2500); return { url: location.search, daftar: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display }`);
  cek("Riwayat 360: kembali → daftar", keDaftar.daftar !== "none" && !/id=/.test(keDaftar.url), JSON.stringify(keDaftar));
  // Di HP, ketuk transaksi tetap ke halaman detail lama.
  const hp = await langkah("ketuk transaksi di 360", `[...document.querySelectorAll('[class*=panelDaftar] a')].find(a => a.innerText.includes('Gojek')).click(); await sampai(() => location.pathname.startsWith('/transactions/')); return location.pathname`);
  cek("Riwayat 360: ketuk → /transactions/[id] seperti sebelumnya", /^\/transactions\//.test(hp), hp);

  // Hapus dari panel kanan.
  await ukur(1024);
  await buka(`${base}/riwayat`, 6000);
  const hapus = await langkah("hapus dari panel", `[...document.querySelectorAll('[class*=panelDaftar] a')].find(a => a.innerText.includes('Warteg')).click(); await sampai(() => document.querySelector('[class*=panelDetail]').innerText.includes('Warteg')); document.querySelector('[class*=panelDetail] button[aria-label="Hapus transaksi"]').click(); await sampai(() => dialog()); tombol('Hapus', dialog()).click(); await sampai(() => !location.search.includes('id=') && !document.body.innerText.includes('Warteg'), 30); await t(500); return { url: location.search, kosong: document.querySelector('[class*=panelDetail]').childElementCount === 0, ada: document.body.innerText.includes('Warteg') }`);
  cek("Riwayat 1024: hapus dari panel → panel kosong, baris hilang", hapus.kosong && !hapus.ada, JSON.stringify(hapus));

  // --- 5. Profil menu + halaman (1024).
  await buka(`${base}/profil`, 6000);
  const prof = await langkah("Profil 1024", `await sampai(() => location.pathname === '/profil/kantong'); await t(1500); const kanan = document.querySelector('[class*=panelDetail]'); const kembali = kanan.querySelector('a[aria-label="Kembali"]'); return { url: location.pathname, menu: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display, kanan: kanan.innerText.includes('Kantong'), kembali: kembali ? getComputedStyle(kembali).display : 'tidak ada', terpilih: document.querySelector('[class*=panelDaftar] a[aria-current="page"]')?.innerText.split('\\n')[0] }`);
  cek("Profil 1024: /profil → Kantong di kanan, menu kiri, tanpa tombol kembali", prof.url === "/profil/kantong" && prof.menu !== "none" && prof.kanan && prof.kembali === "none" && prof.terpilih === "Kantong", JSON.stringify(prof));
  const budget = await langkah("klik Budget", `[...document.querySelectorAll('[class*=panelDaftar] a')].find(a => a.innerText.startsWith('Budget')).click(); await sampai(() => location.pathname === '/profil/budget'); await t(2500); return { menu: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display, kanan: document.querySelector('[class*=panelDetail]').innerText.slice(0, 30), terpilih: document.querySelector('[class*=panelDaftar] a[aria-current="page"]')?.innerText.split('\\n')[0] }`);
  cek("Profil 1024: pindah ke Budget, menu tetap", budget.menu !== "none" && /Budget/.test(budget.kanan) && budget.terpilih === "Budget", JSON.stringify(budget));
  await foto("1024-profil.png");
  await ukur(360);
  await buka(`${base}/profil`, 5000);
  const profHp = await langkah("Profil 360", `return { url: location.pathname, menu: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display, kanan: getComputedStyle(document.querySelector('[class*=panelDetail]')).display }`);
  cek("Profil 360: hanya menu, tanpa redirect", profHp.url === "/profil" && profHp.menu !== "none" && profHp.kanan === "none", JSON.stringify(profHp));
  await buka(`${base}/profil/kategori`, 5000);
  const profHp2 = await langkah("Profil/kategori 360", `return { menu: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display, kembali: !!document.querySelector('[class*=panelDetail] a[aria-label="Kembali"]') && getComputedStyle(document.querySelector('[class*=panelDetail] a[aria-label="Kembali"]')).display }`);
  cek("Profil/kategori 360: hanya halaman, dengan tombol kembali", profHp2.menu === "none" && profHp2.kembali !== "none" && profHp2.kembali !== false, JSON.stringify(profHp2));

  // --- 6. Catat: lembar penuh di HP, pop-up di layar lebar; ketikan bertahan saat lebar berubah.
  await buka(`${base}/`, 6000);
  await langkah("buka Catat 360", `document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()); await t(500); isi(dialog().querySelector('textarea'), 'kopi 20rb gopay'); return 'ok'`);
  const hp1 = await langkah("ukuran Catat 360", `const r = dialog().getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height)`);
  await ukur(1024);
  const pop = await langkah("Catat 1024", `const d = dialog(); const r = d.getBoundingClientRect(); return { lebar: Math.round(r.width), tengah: Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 2, teks: d.querySelector('textarea')?.value }`);
  cek("Catat 360→1024: pop-up di tengah ≤ 640px, ketikan tetap", pop.lebar <= 640 && pop.tengah && pop.teks === "kopi 20rb gopay", `HP ${hp1} → ${JSON.stringify(pop)}`);
  await foto("1024-catat-popup.png");
  await langkah("Esc", `dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(500); return !!dialog()`);

  // --- 7. Beranda → detail di dua panel Riwayat; halaman detail lama ikut pindah.
  await ukur(1024);
  await buka(`${base}/`, 6000);
  const dariBeranda = await langkah("klik transaksi di Beranda", `[...document.querySelectorAll('a')].find(a => a.innerText.includes('Kopi Kenangan')).click(); await sampai(() => location.pathname === '/riwayat' && document.querySelector('[class*=panelDetail]')?.innerText.includes('25.000')); await t(500); return { url: location.pathname + location.search, daftar: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display, terpilih: document.querySelector('[class*=panelDaftar] a[aria-current="true"]')?.innerText.includes('Kopi Kenangan') }`);
  cek("Beranda 1024: ketuk transaksi → Riwayat dua panel dengan detailnya", /^\/riwayat\?id=/.test(dariBeranda.url) && dariBeranda.daftar !== "none" && dariBeranda.terpilih, JSON.stringify(dariBeranda));
  const idKopi = dariBeranda.url.split("id=")[1];
  await buka(`${base}/transactions/${idKopi}`, 6000);
  const lama = await langkah("halaman detail lama di 1024", `await sampai(() => location.pathname === '/riwayat'); await t(1500); return location.pathname + location.search + ' | ' + (document.querySelector('[class*=panelDetail]')?.innerText.includes('25.000'))`);
  cek("/transactions/[id] di 1024 → dipindah ke /riwayat?id=", lama === `/riwayat?id=${idKopi} | true`, lama);

  // --- 8. Pop-up memakai ×, layar pendek tanpa judul setinggi sepertiga layar.
  await ukur(700);
  await buka(`${base}/analitik`, 6000);
  const x = await langkah("tombol pop-up Tanya AI di 700", `document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()); await t(400); const b = dialog().querySelector('[class*=dialogKepala] button'); return [...b.querySelectorAll('svg')].map(s => getComputedStyle(s).display).join(',')`);
  cek("pop-up 700: tombol tutup berupa × (bukan ‹)", x === "none,block", x);
  await ukur(360);
  const panah = await langkah("tombol layar penuh di 360", `const b = dialog().querySelector('[class*=dialogKepala] button'); return [...b.querySelectorAll('svg')].map(s => getComputedStyle(s).display).join(',')`);
  cek("layar penuh 360: tombol tetap ‹", panah === "block,none", panah);
  await langkah("tutup", `dialog().querySelector('[class*=dialogKepala] button').click(); await t(400); return 'ok'`);
  await ukur(800, 400);
  await buka(`${base}/transactions/${idKopi}`, 6000);
  const pendek = await langkah("detail di HP mendatar 800×400", `return { tinggi: Math.round(document.querySelector('header[class*=viewing]').getBoundingClientRect().height), judul: document.querySelector('h1').innerText, url: location.pathname }`);
  cek("HP mendatar (tinggi 400): judul ringkas, nominal tetap terlihat, tetap halaman detail", pendek.tinggi < 180 && /25\.000/.test(pendek.judul) && pendek.url.startsWith("/transactions/"), JSON.stringify(pendek));
  await foto("800x400-detail.png");
  await ukur(1024);

  // --- 9. Seret foto struk.
  const seret = await langkah("seret gambar", `
    const asli = window.fetch; let kirim = 0;
    window.fetch = (u, o) => String(u).includes('/api/upload-receipt') ? (kirim++, Promise.resolve(new Response(JSON.stringify({ status: 'confirmed' }), { status: 200 }))) : asli(u, o);
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'struk.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    await t(300);
    const lapis = document.querySelector('[class*=lapisSeret]').matches(':popover-open');
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sampai(() => /1 tercatat/.test(document.body.innerText), 20);
    const hasil = { lapis, kirim, kabar: /1 tercatat/.test(document.body.innerText), lapisTutup: !document.querySelector('[class*=lapisSeret]').matches(':popover-open') };
    const dt2 = new DataTransfer(); dt2.items.add(new File(['halo'], 'catatan.txt', { type: 'text/plain' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt2, bubbles: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt2, bubbles: true, cancelable: true }));
    await t(500);
    hasil.bukanGambar = /cuma foto struk/.test(document.body.innerText);
    window.fetch = asli;
    return hasil`);
  cek("Seret foto: lapisan tampil, struk dikirim & dikabari; bukan gambar ditolak", seret.lapis && seret.kirim === 1 && seret.kabar && seret.lapisTutup && seret.bukanGambar, JSON.stringify(seret));

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
