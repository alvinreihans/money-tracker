import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-kalender-sementara@example.com", SANDI = "Uji12345#";
const L = process.env.LEBAR ?? 360;
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const baris = [
    { amount: 20000, merchant: "Kopi lama", transaction_date: "2026-09-15" },
    ...Array.from({ length: 120 }, (_, i) => ({ amount: 1000, merchant: `Warung ${i}`, transaction_date: `2026-09-${String((i % 30) + 1).padStart(2, "0")}` })),
  ].map((r) => ({ user_id: uid, status: "confirmed", source: "text", category: "food", type: "expense", kantong_id: tunai.id, payment_method: "Tunai", ...r }));
  const { error: e2 } = await sb.from("transactions").insert(baris);
  if (e2) throw e2;

  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  const keadaan = () => jalankan(`(() => ({ url: location.pathname + location.search, sub: document.querySelector("header p")?.innerText }))()`);
  const judul = () => jalankan(`document.querySelector("dialog[open] [aria-live]")?.innerText`);
  const bukaTanggal = `[...document.querySelectorAll('[aria-label="Saring transaksi"] button')][0].click(); await sampai(() => dialog()); await t(600);`;

  await buka(`${base}/riwayat`, 9000);
  await langkah("lembar tanggal → Pilih rentang", `${bukaTanggal} [...dialog().querySelectorAll('[role=radio]')].find(b => b.innerText.includes('Pilih rentang')).click(); await t(600); return dialog().innerText.includes('Pilih tanggal awal')`);
  await foto(`${L}-kal-1-kosong.png`);
  await langkah("ke September, ketuk 10 lalu 20", `dialog().querySelector('[aria-label="Bulan sebelumnya"]').click(); await t(300); dialog().querySelector('[data-tgl="2026-09-10"]').click(); await t(200); dialog().querySelector('[data-tgl="2026-09-20"]').click(); await t(300); return 'ok'`);
  cek("judul rentang", (await judul()) === "10 Sep – 20 Sep 2026", await judul());
  cek("pita: 9 hari di antara, 2 ujung", await jalankan(`dialog().querySelectorAll('[data-antara="true"]').length === 9 && dialog().querySelectorAll('[data-ujung="true"]').length === 2`.replace("dialog()", "[...document.querySelectorAll('dialog[open]')].at(-1)").replace("dialog()", "[...document.querySelectorAll('dialog[open]')].at(-1)")));
  await foto(`${L}-kal-2-rentang.png`);
  await langkah("terapkan", `tombol('Terapkan', dialog()).click(); await sampai(() => location.search.includes('dari=')); await t(2500); return location.search`);
  let k = await keadaan();
  cek("URL & hasil 45", k.url.includes("dari=2026-09-10&sampai=2026-09-20") && /^45 transaksi/.test(k.sub), `${k.url} | ${k.sub}`);

  const lagi = await langkah("buka lagi: kalender menampilkan rentang aktif", `${bukaTanggal} return dialog().querySelector('[aria-live]')?.innerText`);
  cek("rentang aktif terbaca saat dibuka lagi", lagi === "10 Sep – 20 Sep 2026", lagi);
  await langkah("satu tanggal saja (15 Sep)", `dialog().querySelector('[data-tgl="2026-09-15"]').click(); await t(200); tombol('Terapkan', dialog()).click(); await sampai(() => location.search.includes('dari=2026-09-15')); await t(2500); return location.search`);
  k = await keadaan();
  cek("satu hari: dari = sampai = 15 Sep, 5 transaksi", k.url.includes("dari=2026-09-15&sampai=2026-09-15") && /^5 transaksi/.test(k.sub), `${k.url} | ${k.sub}`);

  await langkah("keyboard: fokus 15 Sep", `${bukaTanggal} dialog().querySelector('[data-tgl="2026-09-15"]').focus(); return document.activeElement?.dataset?.tgl`);
  for (const [key, kode] of [["ArrowRight", 39], ["ArrowDown", 40]]) {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: kode });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: kode });
    await tidur(250);
  }
  const fokus = await jalankan(`document.activeElement?.dataset?.tgl`);
  cek("panah kanan + bawah memindah fokus ke 23 Sep", fokus === "2026-09-23", fokus);
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
