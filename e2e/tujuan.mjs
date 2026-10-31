import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-tujuan-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const B = hariIni.slice(0, 7);
const geser = (n) => { const [t, b] = B.split("-").map(Number); return new Date(Date.UTC(t, b - 1 + n, 1)).toISOString().slice(0, 7); };
const tgl = (h) => `${B}-${String(Math.min(h, Number(hariIni.slice(8)))).padStart(2, "0")}`;
const PILIH = `const pilih = async (akar, kolom, teks) => { akar.querySelector('[data-kolom="' + kolom + '"] button').click(); await sampai(() => [...document.querySelectorAll('dialog[open]')].length > 1 || dialog() !== akar); await t(300); [...dialog().querySelectorAll('button')].find(b => b.textContent.includes(teks)).click(); await t(400); };`;
const tekan = (teks, akar = "document") => `[...${akar}.querySelectorAll('button, a')].find(b => b.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(teks)}))`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  await sb.from("user_accounts").update({ saldo_awal: 20000000, saldo_sejak: "2026-01-01T00:00:00+07:00", saldo_per: "2026-01-01" }).eq("id", tunai.id);
  const { data: bca } = await sb.from("user_accounts").insert({ user_id: uid, name: "BCA", kind: "bank", emoji: "🏦", saldo_awal: 20000000, saldo_per: "2026-01-01", saldo_sejak: "2026-01-01T00:00:00+07:00" }).select("id").single();
  const tx = (amount, type, category, merchant, d, kantong_id) => ({ user_id: uid, status: "confirmed", source: "text", amount, type, category, merchant, transaction_date: d, kantong_id });
  await sb.from("transactions").insert([
    // Gajian akhir bulan: dua bulan lalu & bulan lalu. Bulan ini baru uang masuk kecil.
    tx(8000000, "income", "salary", "Kantor", `${geser(-2)}-28`, bca.id),
    tx(8000000, "income", "salary", "Kantor", `${geser(-1)}-28`, bca.id),
    tx(500000, "income", "gift", "Ibu", tgl(1), bca.id),
    tx(358211, "income", "refund", "Shopee", tgl(1), bca.id),
    tx(2000000, "expense", "food", "Katering", tgl(2), tunai.id),
  ]);
  const { data: hp } = await sb.from("transactions").insert(tx(10300000, "expense", "shopping", "Laku6", tgl(3), bca.id)).select("id").single();
  await sb.from("metode_budget").insert({ user_id: uid, metode: "50-30-20" });
  const saldo = async (id) => Number((await sb.rpc("saldo_kantong")).data?.find((k) => k.id === id)?.saldo);
  const bcaAwal = await saldo(bca.id);

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  const halaman = async () => norm(await jalankan(`document.body.innerText`));

  // --- 1. Budget: penghasilan dari rerata gaji, bukan uang masuk bulan ini.
  await buka(`${base}/profil/budget`, 5000);
  let h = await halaman();
  cek("Budget: penghasilan per bulan = rerata gaji (bukan Rp 858.211 uang masuk)", /Penghasilan per bulan Rp 8\.000\.000 Rerata 2 bulan terakhir/.test(h) && /Kebutuhan 50% Rp 4 jt/.test(h), h.slice(0, 260));
  await foto("tujuan-1-budget.png");

  // --- 2. Ubah penghasilan, lalu kembali ke saran.
  await langkah("ubah penghasilan", `${tekan("Ubah")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Penghasilan per bulan (Rp)"]')); await t(300);
    isi(dialog().querySelector('input[placeholder="Penghasilan per bulan (Rp)"]'), '10000000'); await t(300);
    ${tekan("Simpan", "dialog()")}.click(); await sampai(() => /Penghasilan per bulan disimpan/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  let { data: mb } = await sb.from("metode_budget").select("penghasilan").single();
  h = await halaman();
  cek("Ubah penghasilan → tersimpan, jatah ikut berubah", Number(mb.penghasilan) === 10000000 && /Rp 10\.000\.000 Diatur sendiri/.test(h) && /Kebutuhan 50% Rp 5 jt/.test(h), JSON.stringify(mb));
  await langkah("pakai saran", `${tekan("Ubah")}.click(); await sampai(() => dialog()?.innerText.includes('Pakai saran')); await t(300);
    ${tekan("Pakai saran", "dialog()")}.click(); await sampai(() => /Memakai saran penghasilan/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  ({ data: mb } = await sb.from("metode_budget").select("penghasilan").single());
  cek("Pakai saran → penghasilan kembali null", mb.penghasilan === null, JSON.stringify(mb));

  // --- 3. Kategori: sakelar penghasilan.
  await buka(`${base}/profil/kategori`, 5000);
  h = await halaman();
  const kat = await langkah("bonus bukan penghasilan", `${tekan("Bonus/THR")}.click(); await sampai(() => dialog()?.querySelector('input[role=switch]')); await t(300);
    const sw = dialog().querySelector('input[role=switch]'); const awal = sw.checked; sw.click(); await t(300);
    ${tekan("Simpan", "dialog()")}.click(); await sampai(() => !dialog(), 20); await t(1500); return { awal }`);
  const { data: bonus } = await sb.from("categories").select("penghasilan").eq("slug", "bonus").single();
  cek("Kategori: label penghasilan di daftar, sakelar tersimpan", /Gaji Penghasilan/.test(h) && /Pemberian Uang masuk lain/.test(h) && kat?.awal === true && bonus.penghasilan === false, JSON.stringify({ kat, bonus }));

  // --- 4. Tujuan baru dengan tenggat.
  await buka(`${base}/profil/tujuan`, 5000);
  h = await halaman();
  const kosong = /Belum ada tujuan/.test(h);
  await langkah("buat tujuan", `${tekan("Buat tujuan")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Nama"]')); await t(300);
    isi(dialog().querySelector('input[placeholder="Nama"]'), 'Liburan');
    isi(dialog().querySelector('input[placeholder="Target (Rp)"]'), '6000000');
    isi(dialog().querySelector('input[aria-label="Tenggat"]'), '${geser(5)}-28'); await t(300);
    ${tekan("Simpan", "dialog()")}.click(); await sampai(() => !dialog() && document.body.innerText.includes('Liburan'), 20); await t(1000); return 'ok'`);
  const { data: liburan } = await sb.from("user_accounts").select("id, kind, target, tenggat").eq("name", "Liburan").single();
  h = await halaman();
  cek("Tujuan baru tersimpan, butuh Rp 1 jt/bulan (6 bulan)", kosong && liburan?.kind === "tujuan" && Number(liburan.target) === 6000000 && /Sisihkan Rp 1 jt\/bulan sampai/.test(h), JSON.stringify(liburan) + " " + h.slice(0, 200));
  await foto("tujuan-2-daftar.png");

  // --- 5. Sisihkan lewat aksi → isian manual pindah kantong ke Liburan.
  const setor = await langkah("sisihkan", `${PILIH} ${tekan("Liburan")}.click(); await sampai(() => dialog()?.innerText.includes('Sisihkan')); await t(300);
    ${tekan("Sisihkan", "dialog()")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Nominal (Rp)"]')); await t(500);
    const ke = dialog().querySelector('[data-kolom="kantong_tujuan_id"]')?.innerText;
    isi(dialog().querySelector('input[placeholder="Nominal (Rp)"]'), '500000'); await t(200);
    await pilih(dialog(), 'kantong_id', 'BCA');
    ${tekan("Simpan", "dialog()")}.click(); await sampai(() => /Tercatat/.test(document.body.innerText), 20); await t(1500); return { ke }`);
  cek("Sisihkan: isian terisi ke Liburan, saldo tujuan naik, BCA turun", /Liburan/.test(setor?.ke ?? "") && (await saldo(liburan.id)) === 500000 && (await saldo(bca.id)) === bcaAwal - 500000, JSON.stringify(setor));
  const bcaSetelahSetor = bcaAwal - 500000;

  // --- 6. Analitik sebelum HP dipindah: Keinginan lewat.
  await buka(`${base}/analitik`, 6000);
  h = await halaman();
  cek("Analitik: dari penghasilan, setoran ke tujuan tercatat, HP masih di Keinginan", /Dari penghasilan Rp 8 jt per bulan/.test(h) && /Disisihkan ke tujuan Bulan ini Rp 500\.000/.test(h) && /Keinginan 30% Rp 10\.300\.000/.test(h), h.match(/Metode 50\/30\/20.{0,400}/)?.[0]);

  // --- 7. HP lama → "Dibayar dari tujuan tabungan" dengan tujuan baru.
  await buka(`${base}/transactions/${hp.id}`, 5000);
  await langkah("bayar dari tujuan", `${tekan("Dibayar dari tujuan tabungan")}.click(); await sampai(() => dialog()?.innerText.includes('Tujuan baru')); await t(300);
    ${tekan("Tujuan baru", "dialog()")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder^="Nama tujuan"]')); await t(200);
    isi(dialog().querySelector('input[placeholder^="Nama tujuan"]'), 'HP baru'); await t(200);
    ${tekan("Buat & pindahkan", "dialog()")}.click(); await sampai(() => /Dibayar dari tujuan HP baru/.test(document.body.innerText), 30); await t(2000); return 'ok'`);
  const { data: goalHp } = await sb.from("user_accounts").select("id, target").eq("name", "HP baru").single();
  let { data: hpRow } = await sb.from("transactions").select("kantong_id").eq("id", hp.id).single();
  let { data: pel } = await sb.from("transactions").select("amount, kantong_id, kantong_tujuan_id").eq("pelengkap_tujuan", hp.id);
  cek("HP pindah ke tujuan baru + transfer pelengkap; saldo BCA tidak berubah", hpRow.kantong_id === goalHp?.id && pel.length === 1 && Number(pel[0].amount) === 10300000 && pel[0].kantong_id === bca.id && (await saldo(bca.id)) === bcaSetelahSetor && (await saldo(goalHp.id)) === 0, JSON.stringify({ goalHp, hpRow, pel }));
  await foto("tujuan-3-detail.png");

  await buka(`${base}/analitik`, 6000);
  h = await halaman();
  cek("Analitik: Keinginan tanpa HP, baris 'Dibayar dari tujuan: HP baru'", /Keinginan 30% Rp 0/.test(h) && /Dibayar dari tujuan: HP baru Di luar jatah bulan ini Rp 10\.300\.000/.test(h), h.match(/Metode 50\/30\/20.{0,600}/)?.[0]);
  // SPEC-analitik-tujuan: Keluar & sorotan tanpa HP, baris sendiri.
  cek("Analitik: Keluar tanpa HP, baris 'Dari tujuan tabungan', sorotan tanpa HP", /Keluar Rp 2 jt/.test(h) && /Dari tujuan tabungan HP baru Rp 10,3 jt/.test(h) && !/naik Rp 10,3 jt/.test(h) && /Belanja/.test(h) === false, h.match(/Keluar.{0,400}/)?.[0]);
  await foto("tujuan-4-analitik.png");
  const keTujuan = await langkah("buka dari tujuan", `${tekan("Dari tujuan tabungan")}.click(); await sampai(() => location.pathname === '/riwayat' && /Laku6/.test(document.body.innerText), 30); await t(1000); return location.search`);
  h = await halaman();
  cek("Ketuk 'Dari tujuan tabungan' → Riwayat pengeluaran dari tujuan itu", decodeURIComponent(keTujuan ?? "").includes(goalHp.id) && /Laku6/.test(h) && !/Katering/.test(h), keTujuan);
  await buka(`${base}/`, 6000);
  h = await halaman();
  cek("Beranda: tidak ada peringatan budget gara-gara HP", !/Budget hampir habis/.test(h));
  cek("Beranda: pengeluaran bulan ini tanpa HP", /Rp 2\.000\.000/.test(h) && !/Rp 12\.300\.000/.test(h), h.slice(0, 200));
  await buka(`${base}/profil/tujuan`, 5000);
  h = await halaman();
  cek("Tujuan: HP baru di Selesai", /Selesai \S+ HP baru Rp 10\.300\.000 Sudah dipakai/.test(h), h.slice(0, 300));

  // --- 8. Batalkan dari detail.
  await buka(`${base}/transactions/${hp.id}`, 5000);
  await langkah("batalkan", `await sampai(() => ${tekan("Batalkan")}, 20); ${tekan("Batalkan")}.click(); await sampai(() => /Dikembalikan ke kantong semula/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  ({ data: hpRow } = await sb.from("transactions").select("kantong_id").eq("id", hp.id).single());
  ({ data: pel } = await sb.from("transactions").select("id").eq("pelengkap_tujuan", hp.id));
  cek("Batalkan: kembali ke BCA, pelengkap terhapus, saldo BCA tetap", hpRow.kantong_id === bca.id && pel.length === 0 && (await saldo(bca.id)) === bcaSetelahSetor, JSON.stringify({ hpRow, pel }));

  // --- 9. Pindah lagi ke tujuan yang sudah ada, hapus, urungkan.
  await buka(`${base}/transactions/${hp.id}`, 5000);
  await langkah("pindah lagi", `${tekan("Dibayar dari tujuan tabungan")}.click(); await sampai(() => dialog()?.innerText.includes('HP baru')); await t(300);
    ${tekan("HP baru", "dialog()")}.click(); await sampai(() => /Dibayar dari tujuan HP baru/.test(document.body.innerText), 30); await t(2000); return 'ok'`);
  ({ data: pel } = await sb.from("transactions").select("id").eq("pelengkap_tujuan", hp.id));
  const pelSebelum = pel.length;
  await buka(`${base}/transactions/${hp.id}`, 5000);
  await langkah("hapus & urungkan", `document.querySelector('button[aria-label="Hapus transaksi"]').click(); await sampai(() => dialog()); await t(300);
    ${tekan("Hapus", "dialog()")}.click(); await sampai(() => /Transaksi dihapus/.test(document.body.innerText), 20); await t(500);
    ${tekan("Urungkan")}.click(); await sampai(() => /Transaksi dikembalikan/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  ({ data: pel } = await sb.from("transactions").select("id").eq("pelengkap_tujuan", hp.id));
  ({ data: hpRow } = await sb.from("transactions").select("kantong_id").eq("id", hp.id).single());
  cek("Hapus + Urungkan: pengeluaran & pelengkapnya kembali, saldo BCA tetap", pelSebelum === 1 && pel.length === 1 && hpRow?.kantong_id === goalHp.id && (await saldo(bca.id)) === bcaSetelahSetor, JSON.stringify({ pelSebelum, pel, hpRow }));

  // --- 10. Kantong: tujuan tidak di daftar, tetap di total aset.
  await buka(`${base}/profil/kantong`, 5000);
  h = await halaman();
  const totalAset = (await saldo(tunai.id)) + (await saldo(bca.id)) + 500000;
  cek("Kantong: baris 'Disisihkan ke tujuan', total aset termasuk tujuan", /Disisihkan ke tujuan 2 tujuan tabungan Rp 500\.000/.test(h) && h.includes(`Total aset ${"Rp " + totalAset.toLocaleString("id-ID")}`) && !/Liburan/.test(h), h.slice(0, 300));

  // --- 11. Nama baru & menu.
  await buka(`${base}/profil`, 5000);
  h = await halaman();
  cek("Profil: Utang & Piutang, Tujuan tabungan", /Utang & Piutang/.test(h) && /Tujuan tabungan/.test(h) && !/Lend & Borrow/.test(h));

  // --- 12. Catat lewat teks (AI): "sisihkan … ke Liburan".
  await buka(`${base}/`, 5000);
  await langkah("catat sisihkan", `document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea')); await t(300);
    isi(dialog().querySelector('textarea'), 'sisihkan 200rb dari bca ke Liburan'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
    // AI belum tahu nama kantong user, jadi kadang tujuannya ditanyakan dulu: jawab seperti user.
    await sampai(() => /Tercatat|tercatat|Tersimpan|kantong mana/.test(dialog()?.innerText || ''), 90);
    const ditanya = /kantong mana/.test(dialog()?.innerText || '');
    if (ditanya) { [...dialog().querySelectorAll('[class*=pilihanJawab] button')].find(b => b.textContent.includes('Liburan')).click(); await sampai(() => /Tercatat|tercatat|Tersimpan/.test(dialog()?.innerText || ''), 60); }
    await t(1000); return { ditanya, akhir: dialog()?.innerText.slice(-200) }`);
  const { data: lewatAi } = await sb.from("transactions").select("amount, type, kantong_id, kantong_tujuan_id, status").eq("kantong_tujuan_id", liburan.id).eq("amount", 200000);
  cek("Catat AI: transfer BCA → Liburan Rp 200.000", lewatAi?.length === 1 && lewatAi[0].type === "transfer" && lewatAi[0].kantong_id === bca.id && lewatAi[0].status === "confirmed", JSON.stringify(lewatAi));
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
