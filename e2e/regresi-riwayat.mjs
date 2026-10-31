import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-riwayat-sementara@example.com", SANDI = "Uji12345#";
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const geser = (n) => { const d = new Date(`${hariIni}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const buat = async (name, kind, emoji) => (await sb.from("user_accounts").insert({ user_id: uid, name, kind, emoji, saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }).select().single()).data;
  const gopay = await buat("GoPay", "ewallet", "📱");
  const bca = await buat("BCA", "bank", "🏦");
  const tx = (r) => ({ user_id: uid, status: "confirmed", source: "text", category: "food", type: "expense", ...r });
  const baris = [
    tx({ amount: 25000, merchant: "Kopi Kenangan", transaction_date: hariIni, waktu: "08:00", kantong_id: gopay.id, payment_method: "GoPay" }),
    tx({ amount: 15000, category: "transport", merchant: "Parkir", transaction_date: geser(-1), kantong_id: tunai.id, payment_method: "Tunai" }),
    tx({ amount: 5000000, type: "income", category: "salary", merchant: "Gaji", transaction_date: geser(-3), kantong_id: bca.id, payment_method: "BCA" }),
    tx({ amount: 100000, type: "transfer", category: "other", description: "Topup", transaction_date: geser(-2), kantong_id: bca.id, kantong_tujuan_id: gopay.id, payment_method: "BCA" }),
    tx({ amount: 20000, merchant: "Kopi lama", transaction_date: "2026-09-15", kantong_id: gopay.id, payment_method: "GoPay" }),
    ...Array.from({ length: 120 }, (_, i) =>
      tx({ amount: 1000, merchant: `Warung ${i}`, transaction_date: `2026-09-${String((i % 30) + 1).padStart(2, "0")}`, kantong_id: tunai.id, payment_method: "Tunai" }),
    ),
  ];
  const { error: e2 } = await sb.from("transactions").insert(baris);
  if (e2) throw e2;

  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  const keadaan = () =>
    jalankan(`(()=>({
      url: location.pathname + location.search,
      sub: document.querySelector('header p')?.innerText.replace(/\\s+/g, ' '),
      bulan: [...document.querySelectorAll('section h2')].map(h => h.innerText.replace(/\\s+/g, ' ')),
      kartu: document.querySelectorAll('section a').length,
      chips: [...document.querySelectorAll('[aria-label="Saring transaksi"] button')].map(b => b.innerText.trim() + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    }))()`);
  const chip = (i) => `[...document.querySelectorAll('[aria-label="Saring transaksi"] button')][${i}].click(); await sampai(() => dialog());`;

  await buka(`${base}/riwayat`, 9000);
  let k = await keadaan();
  cek("tanpa filter: 125 transaksi + total di subjudul", /^125 transaksi · keluar .*180.* · masuk .*5/.test(k.sub), k.sub);
  cek("header per bulan", k.bulan.some((b) => /^Oktober 2026/.test(b)) && k.bulan.some((b) => /^September 2026/.test(b)), JSON.stringify(k.bulan));
  cek("total September 140 rb walau baru 100 baris termuat", k.kartu === 100 && k.bulan.some((b) => /September 2026.*140/.test(b)), `kartu=${k.kartu} | ${k.bulan.find((b) => b.startsWith("September"))}`);
  const hari = (await jalankan(`[...document.querySelectorAll("section h3")].map(h => h.innerText)`)).map((h) => h.split(/\s+/).join(" "));
  cek("subheader per hari di dalam bulan", hari.includes("Hari ini −Rp 25.000") && hari.some((h) => /^Kemarin −Rp 15.000/.test(h)), JSON.stringify(hari.slice(0, 5)));
  cek("15 Sep: total sehari Rp 24.000", hari.some((h) => /^Selasa, 15 Sep −Rp 24.000/.test(h)), hari.find((h) => h.includes("15 Sep")));
  await foto("1-semua.png");

  await langkah("lembar tanggal → Bulan ini", `${chip(0)} [...dialog().querySelectorAll('[role=radio]')].find(b => b.innerText.includes('Bulan ini')).click(); await t(200); tombol('Terapkan', dialog()).click(); await sampai(() => location.search.includes('periode=bulan-ini')); await t(2500); return location.search`);
  k = await keadaan();
  cek("Bulan ini: 4 transaksi, chip berlabel", /^4 transaksi · keluar .*40.* · masuk/.test(k.sub) && k.chips[0] === "Bulan ini*", `${k.sub} | ${k.chips}`);
  await foto("2-bulan-ini.png");

  await langkah("lembar kantong → GoPay", `${chip(1)} [...dialog().querySelectorAll('[role=checkbox]')].find(b => b.innerText.includes('GoPay')).click(); await t(300); return 'ok'`);
  await foto("3-lembar-kantong.png");
  await langkah("terapkan kantong", `tombol('Terapkan', dialog()).click(); await sampai(() => location.search.includes('kantong=')); await t(2500); return location.search`);
  k = await keadaan();
  cek("Bulan ini + GoPay: kopi & topup (asal/tujuan)", /^2 transaksi/.test(k.sub) && k.chips[1] === "GoPay*", `${k.sub} | ${k.chips}`);

  const sebelum = k.url;
  await langkah("detail lalu kembali", `document.querySelector('section a').click(); await sampai(() => location.pathname.startsWith('/transactions/')); await t(1500); document.querySelector('a[aria-label="Kembali"]').click(); await sampai(() => location.pathname === '/riwayat'); await t(2500); return location.search`);
  k = await keadaan();
  cek("kembali dari detail: filter utuh", k.url === sebelum, k.url);

  await langkah("reset", `[...document.querySelectorAll('[aria-label="Saring transaksi"] button')].find(b => b.innerText.includes('Reset')).click(); await sampai(() => !location.search.includes('kantong')); await t(2500); return location.search`);
  k = await keadaan();
  cek("Reset: kembali 125", /^125 transaksi/.test(k.sub), k.sub);

  await langkah("lembar kategori → Makan", `${chip(2)} [...dialog().querySelectorAll('[role=checkbox]')].find(b => b.innerText.trim() === 'Makan').click(); await t(200); tombol('Terapkan', dialog()).click(); await sampai(() => location.search.includes('kategori=')); await t(2500); return location.search`);
  k = await keadaan();
  cek("Kategori Makan → 122", /^122 transaksi/.test(k.sub) && k.chips[2] === "Makan*", `${k.sub} | ${k.chips} | ${k.url}`);

  const lewatUrl = async (nama, qs, pola) => {
    await buka(`${base}/riwayat${qs}`, 7000);
    const s = await keadaan();
    cek(nama, pola.test(s.sub ?? ""), `${s.sub} | ${s.chips}`);
  };
  await lewatUrl("GoPay + cari 'kopi' (dua OR digabung AND) → 2", `?kantong=${gopay.id}&q=kopi`, /^2 hasil untuk “kopi”/);
  await lewatUrl("Rentang 10–20 Sep → 45", "?dari=2026-09-10&sampai=2026-09-20", /^45 transaksi/);
  await lewatUrl("Parameter sampah diabaikan → 125", "?jenis=x&kantong=abc&kategori=expense:judi&dari=2026-02-30&periode=kapan", /^125 transaksi/);
  await lewatUrl("Tanpa hasil → 0", "?dari=2020-01-01&sampai=2020-01-02", /^0 transaksi/);
  cek("pesan kosong + tombol Hapus filter", await jalankan(`(() => { ${"const teksHalaman=()=>document.body.innerText;"} return document.body.innerText.includes('Tidak ada transaksi untuk filter ini') && [...document.querySelectorAll('button')].some(b => b.innerText.includes('Hapus filter')); })()`));
  await foto("4-kosong.png");

  await buka(`${base}/riwayat?periode=bulan-ini`, 7000);
  await langkah("tab Riwayat dari navigasi", `[...document.querySelectorAll('nav a')].find(a => a.innerText.includes('Riwayat')).click(); await sampai(() => location.search === ''); await t(2500); return location.pathname + location.search`);
  k = await keadaan();
  cek("buka tab Riwayat: tanpa filter", k.url === "/riwayat" && /^125 transaksi/.test(k.sub), k.url);
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
