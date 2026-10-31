// Strategi pelunasan (SPEC-pelunasan): Snowball / Avalanche di Utang & Piutang.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-pelunasan-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const tekan = (teks, akar = "document") => `[...${akar}.querySelectorAll('button, a')].find(b => b.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(teks)})`;
// Urutan di bagian strategi: aria-label "1. Nama, Rp …. Atur bunga".
const URUTAN = `[...document.querySelectorAll('button[aria-label$="Atur bunga"]')].map(b => b.getAttribute('aria-label').split(',')[0])`;
const ISI_BUNGA = (nilai) => `await sampai(() => dialog()?.querySelector('input[placeholder="Bunga per bulan (%)"]')); await t(300);
    isi(dialog().querySelector('input[placeholder="Bunga per bulan (%)"]'), '${nilai}'); await t(200);
    ${tekan("Simpan", "dialog()")}.click(); await sampai(() => /Bunga disimpan/.test(document.body.innerText), 20); await t(2000);`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const sejak = "2026-01-01T00:00:00+07:00";
  await sb.from("user_accounts").insert({ user_id: uid, name: "Budi", kind: "orang", emoji: "👤", saldo_awal: -1000000, saldo_sejak: sejak }).select("id").single();

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  const halaman = async () => norm(await jalankan(`document.body.innerText`));
  const fotoStrategi = async (nama) => { await jalankan(`[...document.querySelectorAll('h2')].find(x => x.innerText.startsWith('Strategi pelunasan'))?.scrollIntoView({ block: "start" })`); await tidur(600); await foto(nama); };

  // --- 1. Satu utang: bagian strategi tidak tampil.
  await buka(`${base}/pinjaman`, 5000);
  let h = await halaman();
  cek("Satu utang: tidak ada bagian Strategi pelunasan", /Budi/.test(h) && !/Strategi pelunasan/.test(h), h.slice(0, 200));

  // Tambah kartu kredit 5 jt & cicilan HP 500 rb × 6 = 3 jt.
  const { data: kartu } = await sb.from("user_accounts").insert({ user_id: uid, name: "Kartu BCA", kind: "kredit", emoji: "💳", saldo_awal: -5000000, saldo_sejak: sejak }).select("id").single();
  const { data: hp } = await sb.from("cicilan").insert({ user_id: uid, nama: "HP", penyedia: "Kredivo", category: "shopping", nominal: 500000, tenor: 6, jatuh_tempo_awal: hariIni }).select("id").single();

  // --- 2. Pilih Snowball: terkecil dulu, Fokus di Budi.
  await buka(`${base}/pinjaman`, 5000);
  h = await halaman();
  cek("Tiga utang: tawaran memilih strategi", /Mau lunas lebih cepat\?/.test(h) && /Snowball/.test(h) && /Avalanche/.test(h));
  const snow = await langkah("pilih Snowball", `[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Snowball')).click();
    await sampai(() => /Memakai strategi Snowball/.test(document.body.innerText), 20); await t(2000); return ${URUTAN}`);
  let { data: mb } = await sb.from("metode_budget").select("metode, strategi_utang").maybeSingle();
  h = await halaman();
  cek("Snowball tersimpan (metode budget tetap 'kategori'); urutan Budi → HP → Kartu BCA; Fokus di Budi",
    mb?.strategi_utang === "snowball" && mb?.metode === "kategori" && JSON.stringify(snow) === JSON.stringify(["1. Budi", "2. HP", "3. Kartu BCA"]) && /Budi ?Fokus/.test(h), JSON.stringify({ mb, snow }));
  await fotoStrategi("pelunasan-1-snowball.png");

  // --- 3. Atur bunga kartu (lembar aksi) & cicilan (baris strategi).
  await langkah("bunga kartu", `[...document.querySelectorAll('button:not([aria-label])')].find(b => b.textContent.includes('Kartu BCA') && b.textContent.includes('Tagihan kartu kredit')).click();
    await sampai(() => dialog()?.innerText.includes('Atur bunga')); await t(300); ${tekan("Atur bunga", "dialog()")}.click(); ${ISI_BUNGA("1,75")} return 'ok'`);
  await langkah("bunga HP", `document.querySelector('button[aria-label^="2. HP"]').click(); ${ISI_BUNGA("2,95")} return 'ok'`);
  const { data: kk } = await sb.from("user_accounts").select("bunga_persen").eq("id", kartu.id).single();
  const { data: cc } = await sb.from("cicilan").select("bunga_persen").eq("id", hp.id).single();
  cek("Bunga tersimpan: kartu 1,75; cicilan 2,95", Number(kk?.bunga_persen) === 1.75 && Number(cc?.bunga_persen) === 2.95, JSON.stringify({ kk, cc }));

  // --- 4. Ganti ke Avalanche: bunga tertinggi dulu, tanpa bunga di belakang.
  const ava = await langkah("ganti Avalanche", `${tekan("Ganti ke Avalanche")}.click(); await sampai(() => /Memakai strategi Avalanche/.test(document.body.innerText), 20); await t(2000); return ${URUTAN}`);
  h = await halaman();
  cek("Avalanche: HP (2,95%) → Kartu BCA (1,75%) → Budi (bunga belum diisi)",
    JSON.stringify(ava) === JSON.stringify(["1. HP", "2. Kartu BCA", "3. Budi"]) && /bunga 2,95%\/bln/.test(h) && /bunga belum diisi/.test(h), JSON.stringify(ava));

  // --- 5. Uang ekstra per bulan.
  await langkah("uang ekstra", `[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Uang ekstra per bulan')).click();
    await sampai(() => dialog()?.querySelector('input[placeholder="Uang ekstra per bulan (Rp)"]')); await t(300);
    isi(dialog().querySelector('input[placeholder="Uang ekstra per bulan (Rp)"]'), '500000'); await t(200);
    ${tekan("Simpan", "dialog()")}.click(); await sampai(() => /Uang ekstra disimpan/.test(document.body.innerText), 20); await t(2000); return 'ok'`);
  h = await halaman();
  cek("Uang ekstra: 'Rp 500.000 ekstra → ke HP'", /Rp 500\.000 ekstra → ke HP/.test(h), h.slice(-500));
  await fotoStrategi("pelunasan-2-avalanche.png");

  // --- 6. Cicilan baru dengan bunga: 12% ditolak, 1,5 diterima.
  await langkah("cicilan baru", `document.querySelector('[class*=pintasan] button:last-child').click(); await sampai(() => dialog()?.querySelector('input[placeholder="Nama barang"]')); await t(400);
    isi(dialog().querySelector('input[placeholder="Nama barang"]'), 'TV');
    isi(dialog().querySelector('input[placeholder="Cicilan per bulan (Rp)"]'), '100000');
    isi(dialog().querySelector('input[placeholder="Tenor (bulan)"]'), '3');
    isi(dialog().querySelector('input[placeholder="Bunga per bulan (%)"]'), '12'); await t(200);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await t(1500);
    const galat = dialog()?.innerText.includes('Bunga per bulan 0–10%');
    isi(dialog().querySelector('input[placeholder="Bunga per bulan (%)"]'), '1,5'); await t(200);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await sampai(() => !dialog(), 20); await t(2000); return galat`);
  const { data: tv } = await sb.from("cicilan").select("bunga_persen").eq("nama", "TV").maybeSingle();
  cek("Cicilan baru: bunga 12% ditolak, 1,5% tersimpan", Number(tv?.bunga_persen) === 1.5, JSON.stringify(tv));

  // --- 7. Matikan → tawaran lagi → Nanti saja (bertahan setelah dimuat ulang).
  await langkah("matikan", `${tekan("Matikan")}.click(); await sampai(() => /Strategi pelunasan dimatikan/.test(document.body.innerText), 20); await t(2000);
    ${tekan("Nanti saja")}.click(); await t(500); return 'ok'`);
  ({ data: mb } = await sb.from("metode_budget").select("strategi_utang").maybeSingle());
  await buka(`${base}/pinjaman`, 5000);
  h = await halaman();
  cek("Matikan: strategi null; 'Nanti saja' menyembunyikan tawaran setelah dimuat ulang", mb?.strategi_utang === null && !/Strategi pelunasan/.test(h) && !/Mau lunas lebih cepat/.test(h), JSON.stringify(mb));

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
