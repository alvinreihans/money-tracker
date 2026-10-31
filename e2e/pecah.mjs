// Tawaran pecah struk campuran (SPEC-tawar-pecah): usulan disuntik langsung, tanpa AI.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-pecah-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const usulan = (a, b, katB = "food") => JSON.stringify([
  { amount: a, category: "groceries", kelompok: null, description: "Beras, sabun" },
  { amount: b, category: katB, kelompok: "keinginan", description: "Cokelat" },
]);
const simpanLembar = `[...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click();`;
const tombolPas = (teks) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(teks)})`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: bca } = await sb.from("user_accounts").insert({ user_id: uid, name: "BCA", kind: "bank", emoji: "🏦", saldo_awal: 1000000, saldo_per: "2026-01-01", saldo_sejak: "2026-01-01T00:00:00+07:00" }).select("id").single();
  const struk = async (merchant, extra = {}) => {
    const { data, error: e } = await sb.from("transactions").insert({ user_id: uid, status: "confirmed", source: "receipt", amount: 87500, type: "expense", category: "groceries", merchant, transaction_date: hariIni, kantong_id: bca.id, usulan_pecah: usulan(70000, 17500), ...extra }).select("id").single();
    if (e) throw e;
    return data.id;
  };
  const terima = await struk("Indomaret");
  const tolak = await struk("Alfamart");
  const ubah = await struk("Superindo");
  const draft = await struk("Hypermart", { status: "needs_review", kantong_id: null, payment_method: "OVO entah" });
  const asing = await struk("Lawson", { usulan_pecah: usulan(70000, 17500, "tidak-ada") });

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  const halaman = async () => norm(await jalankan(`document.body.innerText`));
  const baris = async (id) => (await sb.from("transactions").select("id, amount, category, kelompok, description, pecahan_dari, usulan_pecah, merchant").or(`id.eq.${id},pecahan_dari.eq.${id}`)).data ?? [];

  // --- 1. Tawaran di detail.
  await buka(`${base}/transactions/${terima}`, 5000);
  let h = await halaman();
  cek("Detail menampilkan tawaran dengan ringkasan per kategori", /Isi struk ini campur/.test(h) && /Belanja harian Rp 70\.000 · Makan Rp 17\.500/.test(h), h.slice(0, 300));
  await foto("pecah-1-tawaran.png");

  // --- 2. Pecah → lembar terisi usulan → Simpan.
  const isiLembar = await langkah("pecah dari usulan", `${tombolPas("Pecah")}.click(); await sampai(() => dialog()?.innerText.includes('Bagian 2')); await t(400);
    const d = dialog(); const nilai = [...d.querySelectorAll('input[inputmode]')].map(i => i.value); const ket = [...d.querySelectorAll('input[placeholder^="Keterangan"]')].map(i => i.value);
    ${simpanLembar} await sampai(() => /Dipecah jadi 2 bagian/.test(document.body.innerText), 20); await t(2500);
    return { nilai, ket, tawaran: document.body.innerText.includes('Isi struk ini campur') }`);
  let r = await baris(terima);
  cek("Lembar terisi usulan (70.000 + 17.500, keterangan barang)", norm(isiLembar?.nilai) === "70.000,17.500" && norm(isiLembar?.ket) === "Beras, sabun,Cokelat", JSON.stringify(isiLembar));
  cek("Simpan: asli 70.000 Belanja harian + bagian 17.500 Makan keinginan; usulan kosong; tawaran hilang",
    r.length === 2 && r.some((x) => x.id === terima && Number(x.amount) === 70000 && x.category === "groceries" && x.usulan_pecah === null) && r.some((x) => x.pecahan_dari === terima && Number(x.amount) === 17500 && x.category === "food" && x.kelompok === "keinginan" && x.description === "Cokelat") && isiLembar?.tawaran === false,
    JSON.stringify(r));

  // --- 3. Tutup tawaran.
  await buka(`${base}/transactions/${tolak}`, 5000);
  const ditutup = await langkah("tutup tawaran", `${tombolPas("Tutup")}.click(); await sampai(() => /Tawaran pecah ditutup/.test(document.body.innerText), 20); await t(2000); return document.body.innerText.includes('Isi struk ini campur')`);
  r = await baris(tolak);
  cek("Tutup: usulan kosong, tawaran hilang, tidak dipecah", ditutup === false && r.length === 1 && r[0].usulan_pecah === null && Number(r[0].amount) === 87500, JSON.stringify(r));

  // --- 4. Nominal diubah → usulan dikosongkan trigger.
  await sb.from("transactions").update({ amount: 90000 }).eq("id", ubah);
  r = await baris(ubah);
  await buka(`${base}/transactions/${ubah}`, 5000);
  h = await halaman();
  cek("Ubah nominal: usulan kosong, tawaran tidak tampil", r[0]?.usulan_pecah === null && !/Isi struk ini campur/.test(h), JSON.stringify(r));

  // --- 5. Draft tidak menampilkan tawaran (usulannya tetap tersimpan).
  await buka(`${base}/transactions/${draft}`, 5000);
  h = await halaman();
  r = await baris(draft);
  cek("Draft: tawaran tidak tampil, usulan tetap tersimpan", /Belum selesai/.test(h) && !/Isi struk ini campur/.test(h) && r[0]?.usulan_pecah !== null, h.slice(0, 200));

  // --- 6. Kategori yang sudah tidak ada jatuh ke Lainnya.
  await buka(`${base}/transactions/${asing}`, 5000);
  await langkah("pecah usulan berkategori asing", `${tombolPas("Pecah")}.click(); await sampai(() => dialog()?.innerText.includes('Bagian 2')); await t(400);
    ${simpanLembar} await sampai(() => /Dipecah jadi 2 bagian|gagal|Gagal/.test(document.body.innerText), 20); await t(2000); return dialog()?.innerText.slice(0, 200) ?? 'tertutup'`);
  r = await baris(asing);
  cek("Kategori asing: tersimpan sebagai Lainnya", r.length === 2 && r.some((x) => x.pecahan_dari === asing && x.category === "other"), JSON.stringify(r));

  // --- 7. Urungkan hapus mengembalikan tawaran.
  const balik = await struk("Circle K");
  await buka(`${base}/transactions/${balik}`, 5000);
  const urung = await langkah("hapus lalu urungkan", `document.querySelector('button[aria-label^="Hapus"]').click(); await sampai(() => ${tombolPas("Hapus")}); await t(300);
    [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === 'Hapus').click();
    await sampai(() => ${tombolPas("Urungkan")}, 20); ${tombolPas("Urungkan")}.click(); await t(3000); return location.pathname`);
  r = await baris(balik);
  cek("Urungkan hapus: transaksi kembali beserta usulannya", r.length === 1 && r[0].usulan_pecah !== null, JSON.stringify({ urung, r }));

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
