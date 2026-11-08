// Uang antar kantong sendiri, tahap 2 (docs/specs/SPEC-kantong-sendiri.md), data BUATAN:
// - RPC jadikan_pindah: ikutan sisi lawan yang digabung tidak hilang, Urungkan mengembalikannya;
// - Profil: kantong DANA dibuat → kartu "Jadikan pindah" (A-3) → pindah → snackbar Urungkan (1024 px);
// - obrolan: ketik kantong yang belum ada → "Buat sekarang?" → dibuat → saldo ditanya (K1) → langsung ada di pilihan (A-1);
// - bukti kirim ke diri sendiri (hasil AI disuntik, tanpa kuota) → pindah tanpa ditanya keluar/masuk,
//   "+ Buat kantong Jago" dengan 4 digit akhirnya (B-2/B-3);
// - screenshot sisi lawan yang cocok dengan rekening koran → "Jadikan pindah BRI → DANA" (B-7);
// - layar awal tanpa pilihan & tanpa kantong → langkah saldo dilewati (maju & mundur); label & Rp; e-wallet berjenis e-wallet (E-0–E-2).
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const sharp = req("sharp");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-kantong-sendiri-sementara@example.com";
const EMAIL2 = "uji-kantong-awal-sementara@example.com";
const SANDI = "Uji12345#";
const NAMA = "Siti Aminah"; // nama rekaan pemilik rekening
const uids = [];
let gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const ukur = async (w, h = 860) => { await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await tidur(700); };
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const kemarin = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

async function masuk(email, meta) {
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: SANDI, email_confirm: true, user_metadata: meta });
  if (error) throw error;
  uids.push(u.user.id);
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email, password: SANDI });
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  await cdp("Network.enable");
  await cdp("Network.clearBrowserCookies");
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  return { uid: u.user.id, sb };
}

/** Hapus kantong Tunai bawaan akun uji (kondisi E-0: belum punya kantong sama sekali). */
async function hapusTunai(uid) {
  const pg = req("pg");
  const cs = process.env.SUPABASE_DB_URL;
  if (!cs) throw new Error("SUPABASE_DB_URL tidak ada: kondisi tanpa kantong tidak bisa disiapkan");
  const c = new pg.Client({ connectionString: cs.replace(/[?&]sslmode=no-verify/i, ""), ssl: /sslmode=no-verify/i.test(cs) ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  try {
    await c.query("delete from public.user_accounts where user_id = $1", [uid]);
  } finally {
    await c.end();
  }
}

/** Lebar halaman tidak melebihi layar (tanpa gulir mendatar). */
const tanpaGeser = () => jalankan("document.documentElement.scrollWidth <= window.innerWidth + 1");

try {
  const { uid, sb } = await masuk(EMAIL, { onboarding_selesai: new Date().toISOString(), nama_rekening: [NAMA] });
  const { data: bri, error: eB } = await sb.from("user_accounts").insert({ user_id: uid, name: "BRI", kind: "bank", emoji: "🏦", nomor_akhir: "1111", saldo_awal: 2_000_000, saldo_per: "2026-09-01", saldo_sejak: "2026-09-01T00:00:00+07:00" }).select("id").single();
  if (eB) throw eB;

  // --- 0. RPC: sisi lawan yang digabung punya ikutan → ikutan pindah ke pindah kantong, Urungkan mengembalikannya.
  {
    const { data: ovo } = await sb.from("user_accounts").insert({ user_id: uid, name: "OVO", kind: "ewallet", emoji: "📱", saldo_awal: 0, saldo_per: "2026-09-01", saldo_sejak: "2026-09-01T00:00:00+07:00" }).select("id").single();
    const { data: t, error: eT } = await sb.from("transactions").insert({ user_id: uid, type: "expense", category: "other", amount: 25_000, merchant: "OVO", description: "Top Up OVO 089900001111 SITX AMXXXX via BRImo", transaction_date: "2026-09-02", kantong_id: bri.id, status: "confirmed", source: "statement" }).select("id").single();
    if (eT) throw eT;
    const { data: g } = await sb.from("transactions").insert({ user_id: uid, type: "income", category: "other", amount: 25_000, merchant: "Top up", transaction_date: "2026-09-02", kantong_id: ovo.id, status: "confirmed", source: "payment_proof" }).select("id").single();
    const { data: ik } = await sb.from("transactions").insert({ user_id: uid, type: "income", category: "refund", amount: 500, merchant: "Top up", description: "Cashback", transaction_date: "2026-09-02", kantong_id: ovo.id, status: "confirmed", source: "payment_proof", induk_id: g.id }).select("id").single();
    // Cashback yang menempel ke pengeluaran rekening koran itu sendiri (mis. dari Lengkapi).
    const { data: ik2 } = await sb.from("transactions").insert({ user_id: uid, type: "income", category: "refund", amount: 300, merchant: "OVO", description: "Cashback", transaction_date: "2026-09-02", kantong_id: ovo.id, status: "confirmed", source: "statement", induk_id: t.id }).select("id").single();
    const baca = async (id) => (await sb.from("transactions").select("id, updated_at, type, induk_id, kantong_id, kantong_tujuan_id").eq("id", id).maybeSingle()).data;
    const [bt, bg] = [await baca(t.id), await baca(g.id)];
    const { data: hasil, error: eR } = await sb.rpc("jadikan_pindah", { p: { ubah: [{ id: t.id, updated_at: bt.updated_at, kantong_lawan: ovo.id, merchant: "Pindah ke OVO", gabung: { id: g.id, updated_at: bg.updated_at } }] } });
    const sesudah = { t: await baca(t.id), g: await baca(g.id), ik: await baca(ik.id), ik2: await baca(ik2.id) };
    cek("RPC jadikan_pindah: sisi lawan digabung; ikutannya & cashback transaksi itu dilepas (tetap tercatat di kantongnya), tidak ikut terhapus",
      !eR && sesudah.t.type === "transfer" && sesudah.t.kantong_tujuan_id === ovo.id && sesudah.g === null && sesudah.ik?.induk_id === null && sesudah.ik.kantong_id === ovo.id && sesudah.ik2?.induk_id === null,
      JSON.stringify({ eR, sesudah }));
    const { error: eU } = await sb.rpc("urungkan_jadikan_pindah", { p: { salinan: hasil?.salinan } });
    const urung = { t: await baca(t.id), g: await baca(g.id), ik: await baca(ik.id), ik2: await baca(ik2.id) };
    cek("RPC urungkan: pengeluaran kembali, sisi lawan masuk lagi, ikutan menempel lagi ke induk semulanya",
      !eU && urung.t.type === "expense" && urung.g?.type === "income" && urung.ik?.induk_id === g.id && urung.ik2?.induk_id === t.id, JSON.stringify({ eU, urung }));
    await sb.from("transactions").delete().in("id", [ik.id, ik2.id, g.id, t.id]);
    await sb.from("user_accounts").delete().eq("id", ovo.id);
  }

  // Rekening koran BRI (rekaan): dua top up DANA atas nama tersamar user.
  const topUp = (tgl, n) => ({ user_id: uid, type: "expense", category: "other", amount: n, merchant: "DANA", description: `Top Up DANA 081200003333 SITX AMXXXX via BRImo`, transaction_date: tgl, kantong_id: bri.id, status: "confirmed", source: "statement", perlu_dilengkapi: true });
  const { error: eS } = await sb.from("transactions").insert([topUp("2026-09-03", 50_000), topUp("2026-09-10", 75_000)]);
  if (eS) throw eS;

  // --- 1. Profil (1024 px): buat kantong DANA → kartu "2 transaksi lama sepertinya pindah ke DANA" → Jadikan pindah → Urungkan.
  await ukur(1024);
  await buka(`${base}/profil/kantong`, 6000);
  const kartu = await langkah("buat kantong DANA di Profil", `
    document.querySelector('button[aria-label="Tambah kantong"]').click(); await sampai(() => dialog()?.querySelector('input[placeholder="Nama"]'));
    isi(dialog().querySelector('input[placeholder="Nama"]'), 'DANA'); await t(300);
    const simpan = [...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Simpan');
    simpan.click();
    await sampai(() => /sepertinya pindah ke DANA/.test(dialog()?.innerText ?? ''), 40);
    return dialog()?.innerText.replace(/\\s+/g, ' ')`);
  cek("Profil: kantong DANA dibuat → kartu \"2 transaksi lama sepertinya pindah ke DANA\" dengan daftar & Biarkan/Jadikan pindah",
    /2 transaksi lama sepertinya pindah ke DANA\. Jadikan pindah kantong\?/.test(kartu ?? "") && /Biarkan/.test(kartu) && /Jadikan pindah/.test(kartu) && /Rp\s?50\.000/.test(kartu), String(kartu).slice(0, 300));
  cek("1024: tanpa gulir mendatar", await tanpaGeser());
  await foto("kantong-sendiri-1-kartu-1024.png");
  const jadi = await langkah("Jadikan pindah", `tombol('Jadikan pindah', dialog()).click();
    await sampai(() => !/sepertinya pindah/.test(dialog()?.innerText ?? '') && /jadi pindah kantong/.test(document.body.innerText), 30);
    return [...document.querySelectorAll('[class*=snackbar]')].map((x) => x.innerText.replace(/\\s+/g, ' ')).join('|')`);
  const { data: dana } = await sb.from("user_accounts").select("id, kind").eq("name", "DANA").single();
  let txs = (await sb.from("transactions").select("id, type, kantong_id, kantong_tujuan_id, perlu_dilengkapi").eq("source", "statement")).data ?? [];
  cek("Jadikan pindah: dua pengeluaran jadi pindah BRI → DANA, tanda Perlu dilengkapi hilang; snackbar Urungkan",
    dana.kind === "ewallet" && txs.length === 2 && txs.every((t) => t.type === "transfer" && t.kantong_id === bri.id && t.kantong_tujuan_id === dana.id && !t.perlu_dilengkapi) && /2 transaksi jadi pindah kantong DANA/.test(jadi) && /Urungkan/.test(jadi),
    JSON.stringify({ jadi, txs }));
  await langkah("Urungkan", `[...document.querySelectorAll('[class*=snackbar] button')].find((b) => b.textContent.trim() === 'Urungkan').click();
    await sampai(() => /diurungkan/.test(document.body.innerText), 20); return 'ok'`);
  txs = (await sb.from("transactions").select("id, type, kantong_tujuan_id").eq("source", "statement")).data ?? [];
  cek("Urungkan: kembali jadi pengeluaran", txs.every((t) => t.type === "expense" && !t.kantong_tujuan_id), JSON.stringify(txs));

  // --- 1b. Screenshot DANA "Receive Money from BRI" yang cocok dengan top up di rekening koran → kartu
  //         "Jadikan pindah BRI → DANA" (B-7): pengeluaran itu yang diubah, tidak dicatat baru → Urungkan.
  await ukur(360);
  await buka(`${base}/`, 5000);
  const gb = (await sharp({ create: { width: 24, height: 24, channels: 3, background: { r: 200, g: 40, b: 90 } } }).png().toBuffer()).toString("base64");
  const hTerima = {
    amount: 50_000, transaction_date: "2026-09-03", time: "10:05", time_hint: null, type: "transfer", category: "other", merchant: null, description: null,
    payment_method: "BRI", payment_target: "DANA", fee: null, cashback: null, pinjaman: null, cicilan: null, paylater: null, document_type: "payment_proof",
    bukti_transfer: null, kelompok: null, rincian: null, usulan_pecah: null, sumber_dana: null, dompet: "DANA", voucher: null, ref_bukti: null, rekening_tujuan: null,
  };
  const kartuB7 = await langkah("tempel screenshot terima dari BRI", `
    window.__fetchAsli ??= window.fetch;
    window.fetch = (u, o) => { if (String(u).includes('/api/upload-receipt') && o?.body instanceof FormData && !o.body.has('hasil')) o.body.append('hasil', ${JSON.stringify(JSON.stringify(hTerima))}); return window.__fetchAsli(u, o); };
    document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob('${gb}'), (c) => c.charCodeAt(0))], 'terima.png', { type: 'image/png' }));
    dialog().querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await t(400); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => /Jadikan pindah kantong\?/.test(dialog()?.innerText ?? ''), 60);
    return dialog().innerText.replace(/\\s+/g, ' ').slice(-300)`);
  cek("Screenshot sisi lawan → kartu “Jadikan pindah BRI → DANA” (B-7), belum ada yang disimpan",
    /Jadikan pindah BRI → DANA/.test(kartuB7) && /Catat sebagai baru/.test(kartuB7) && (await sb.from("transactions").select("id")).data.length === 2, kartuB7);
  await foto("kantong-sendiri-1b-b7-360.png");
  await langkah("Jadikan pindah (B-7)", `tombol('Jadikan pindah BRI → DANA', dialog()).click(); await sampai(() => /Sudah jadi pindah kantong/.test(dialog()?.innerText ?? ''), 30); return 'ok'`);
  let b7 = (await sb.from("transactions").select("type, kantong_id, kantong_tujuan_id, transaction_date")).data ?? [];
  cek("B-7: top up 3 Sep jadi pindah BRI → DANA, tidak ada transaksi baru",
    b7.length === 2 && b7.some((t) => t.transaction_date === "2026-09-03" && t.type === "transfer" && t.kantong_id === bri.id && t.kantong_tujuan_id === dana.id) && b7.some((t) => t.type === "expense"), JSON.stringify(b7));
  await langkah("Urungkan (B-7)", `tombol('↩ Urungkan', dialog()).click(); await sampai(() => /diurungkan/.test(dialog()?.innerText ?? ''), 30); dialog().close(); await t(500); return 'ok'`);
  b7 = (await sb.from("transactions").select("type")).data ?? [];
  cek("B-7 Urungkan: kembali pengeluaran", b7.every((t) => t.type === "expense"), JSON.stringify(b7));

  // --- 2. Obrolan (360 px): ketik "gopay" → "Kantong “GoPay” belum ada. Buat sekarang?" → Buat → saldo ditanya → pilihan berikutnya memuat GoPay.
  await ukur(360);
  await sb.from("transactions").insert([
    { user_id: uid, type: "expense", category: "food", amount: 20_000, merchant: "Kopi Contoh", transaction_date: hariIni, status: "needs_review", source: "text" },
    { user_id: uid, type: "expense", category: "food", amount: 15_000, merchant: "Roti Contoh", transaction_date: hariIni, status: "needs_review", source: "text" },
  ]);
  await buka(`${base}/`, 6000);
  const tanya = await langkah("buka draft Kopi", `
    document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
    await sampai(() => tombol('2 belum selesai', dialog()), 20); tombol('2 belum selesai', dialog()).click();
    await sampai(() => [...dialog().querySelectorAll('button')].some((b) => /Kopi Contoh/.test(b.innerText)), 30);
    [...dialog().querySelectorAll('button')].find((b) => /Kopi Contoh/.test(b.innerText)).click();
    await sampai(() => /Pakai kantong apa\\?/.test(dialog()?.innerText ?? ''), 30);
    isi(dialog().querySelector('textarea'), 'gopay'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => /belum ada\\. Buat sekarang\\?/.test(dialog()?.innerText ?? ''), 30);
    return dialog().innerText.replace(/\\s+/g, ' ').slice(-220)`);
  cek("Ketik kantong yang belum ada → \"Kantong “GoPay” belum ada. Buat sekarang?\" dengan Buat / Pilih yang ada (tidak berputar)",
    /Kantong “GoPay” belum ada\. Buat sekarang\?/.test(tanya) && /Buat kantong GoPay/.test(tanya) && /Pilih yang ada/.test(tanya), tanya);
  await foto("kantong-sendiri-2-buat-360.png");
  const saldo = await langkah("Buat kantong GoPay", `tombol('Buat kantong GoPay', dialog()).click();
    await sampai(() => tombol('Simpan', dialog()) && !tombol('Simpan', dialog()).disabled, 60); tombol('Simpan', dialog()).click();
    await sampai(() => /Saldo GoPay sekarang berapa\\?/.test(dialog()?.innerText ?? ''), 30);
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    const ph = dialog().querySelector('textarea').placeholder, mode = dialog().querySelector('textarea').inputMode;
    isi(dialog().querySelector('textarea'), '75000'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => /Rp 75\\.000/.test(dialog()?.innerText ?? '') && [...dialog().querySelectorAll('[role=timer]')].length > 0, 20);
    return { teks: teks.slice(-260), ph, mode }`);
  const { data: gopay } = await sb.from("user_accounts").select("id, kind, emoji, saldo_awal, saldo_per").eq("name", "GoPay").single();
  const { data: kopi } = await sb.from("transactions").select("kantong_id, status, bukti_transfer").eq("merchant", "Kopi Contoh").single();
  cek("Buat: kantong GoPay (e-wallet 📱) dibuat, catatan selesai dari GoPay, lalu \"Saldo GoPay sekarang berapa?\" → 75.000 tersimpan",
    gopay?.kind === "ewallet" && gopay.emoji === "📱" && Number(gopay.saldo_awal) === 75_000 && kopi?.kantong_id === gopay.id && kopi.status === "confirmed" && kopi.bukti_transfer === null && /Kantong GoPay dibuat/.test(saldo.teks) && saldo.mode === "numeric",
    JSON.stringify({ gopay, kopi, saldo }));
  const chip = await langkah("draft berikutnya: GoPay ada di pilihan", `
    await sampai(() => [...dialog().querySelectorAll('button')].some((b) => /Roti Contoh/.test(b.innerText)), 30);
    [...dialog().querySelectorAll('button')].find((b) => /Roti Contoh/.test(b.innerText)).click();
    await sampai(() => /Pakai kantong apa\\?/.test(dialog()?.innerText ?? ''), 30);
    return [...dialog().querySelectorAll('[class*=pilihanJawab] button')].map((b) => b.innerText.trim())`);
  cek("Pilihan kantong di draft berikutnya langsung memuat GoPay (tanpa muat ulang)", Array.isArray(chip) && chip.some((x) => /GoPay/.test(x)), JSON.stringify(chip));
  // Tampak 36 px + area sentuh ::after 5 px atas-bawah (SPEC-perbaikan-uiux #8) = 46 px.
  const tinggi = await jalankan(`Math.min(...[...[...document.querySelectorAll('dialog[open]')].at(-1).querySelectorAll('[class*=pilihanJawab] button')].map((b) => b.getBoundingClientRect().height - 2 * parseFloat(getComputedStyle(b, '::after').top)))`);
  cek("Area sentuh chip jawaban (termasuk “+ Buat kantong”) ≥ 44 px", tinggi >= 44, String(tinggi));
  cek("360: tanpa gulir mendatar", await tanpaGeser());
  await langkah("jawab GoPay", `tombol('📱 GoPay', dialog()).click(); await sampai(() => tombol('Simpan', dialog()) && !tombol('Simpan', dialog()).disabled, 60); tombol('Simpan', dialog()).click(); await sampai(() => [...dialog().querySelectorAll('[role=timer]')].length > 0, 20); dialog().close(); await t(600); return 'ok'`);

  // --- 3. Bukti "kirim ke diri sendiri" dari DANA ke Jago (belum ada kantong Jago) → pindah tanpa ditanya keluar/masuk.
  await buka(`${base}/`, 5000);
  const gambar = (await sharp({ create: { width: 24, height: 24, channels: 3, background: { r: 30, g: 90, b: 150 } } }).png().toBuffer()).toString("base64");
  const hasil = {
    amount: 40_000, transaction_date: kemarin, time: "09:15", time_hint: null, type: "expense", category: "other", merchant: "Siti Aminah", description: null,
    payment_method: "DANA", payment_target: null, fee: null, cashback: null, pinjaman: null, cicilan: null, paylater: null, document_type: "payment_proof",
    bukti_transfer: { pengirim: { nama: null, bank: "DANA" }, penerima: { nama: "SITI AMINAH", bank: "JAGO" } }, rekening_tujuan: "Jago …4321",
    kelompok: null, rincian: null, usulan_pecah: null, sumber_dana: "DANA", dompet: "DANA", voucher: null, ref_bukti: "SNKANTONG0001",
  };
  const bukti = await langkah("tempel bukti kirim ke diri sendiri", `
    window.__fetchAsli ??= window.fetch;
    window.fetch = (u, o) => { if (String(u).includes('/api/upload-receipt') && o?.body instanceof FormData && !o.body.has('hasil')) o.body.append('hasil', ${JSON.stringify(JSON.stringify(hasil))}); return window.__fetchAsli(u, o); };
    document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob('${gambar}'), (c) => c.charCodeAt(0))], 'kirim.png', { type: 'image/png' }));
    dialog().querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await t(400); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => /Pindah ke kantong mana\\?|keluar atau masuk|kirim ke/.test(dialog()?.innerText ?? ''), 60);
    return dialog().innerText.replace(/\\s+/g, ' ').slice(-260)`);
  cek("Bukti kirim ke nama sendiri: tidak ditanya keluar/masuk; ditanya tujuan dengan \"+ Buat kantong Jago\"",
    /Pindah ke kantong mana\?/.test(bukti) && !/keluar atau masuk|Aku kirim/.test(bukti) && /\+ Buat kantong Jago/.test(bukti), bukti);
  await langkah("Buat kantong Jago", `tombol('+ Buat kantong Jago', dialog()).click();
    await sampai(() => tombol('Simpan', dialog()) && !tombol('Simpan', dialog()).disabled, 60); tombol('Simpan', dialog()).click();
    await sampai(() => /Saldo Jago sekarang berapa\\?/.test(dialog()?.innerText ?? ''), 30);
    tombol('Lewati', dialog()).click(); await sampai(() => [...dialog().querySelectorAll('[role=timer]')].length > 0, 20); return 'ok'`);
  const { data: jago } = await sb.from("user_accounts").select("id, kind, nomor_akhir, saldo_awal").eq("name", "Jago").maybeSingle();
  const { data: pindah } = await sb.from("transactions").select("type, kantong_id, kantong_tujuan_id, status, merchant").eq("amount", 40_000).maybeSingle();
  cek("Pindah DANA → Jago tercatat; kantong Jago bank dengan nomor_akhir 4321 (B-2), saldo dilewati = Rp 0",
    jago?.kind === "bank" && jago.nomor_akhir === "4321" && Number(jago.saldo_awal) === 0 && pindah?.type === "transfer" && pindah.kantong_id === dana.id && pindah.kantong_tujuan_id === jago.id && pindah.status === "confirmed",
    JSON.stringify({ jago, pindah }));
  await foto("kantong-sendiri-3-pindah-360.png");

  // --- 3b. Hasil baca tiruan lain (tanpa kuota AI):
  //  - "Receive Money from Bank Mandiri" ke DANA, belum ada kantong Mandiri → "Uang dari Mandiri ini dari rekeningmu sendiri?" (B-4);
  //  - belanja SPayLater tanpa tenor → dari kantong utang, "+ Buat kantong Shopee PayLater", lalu "Utang … sekarang berapa?" (D-4).
  const tempelHasil = (nama, h, warna) => `
    window.__fetchAsli ??= window.fetch;
    window.fetch = (u, o) => { if (String(u).includes('/api/upload-receipt') && o?.body instanceof FormData && !o.body.has('hasil')) o.body.append('hasil', ${JSON.stringify(JSON.stringify(h))}); return window.__fetchAsli(u, o); };
    document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob('${warna}'), (c) => c.charCodeAt(0))], '${nama}', { type: 'image/png' }));
    dialog().querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await t(400); dialog().querySelector('button[aria-label="Kirim"]').click();`;
  const warnaLain = async (r) => (await sharp({ create: { width: 24, height: 24, channels: 3, background: { r, g: 140, b: 60 } } }).png().toBuffer()).toString("base64");
  const dasarHasil = { time: "11:00", time_hint: null, category: "other", description: null, fee: null, cashback: null, pinjaman: null, cicilan: null, paylater: null, document_type: "payment_proof", bukti_transfer: null, kelompok: null, rincian: null, usulan_pecah: null, sumber_dana: null, voucher: null, ref_bukti: null, rekening_tujuan: null };
  await buka(`${base}/`, 5000);
  const sendiri = await langkah("terima dari Mandiri", `${tempelHasil("mandiri.png", { ...dasarHasil, amount: 60_000, transaction_date: hariIni, type: "transfer", merchant: null, payment_method: "Mandiri", payment_target: "DANA", dompet: "DANA" }, await warnaLain(40))}
    await sampai(() => /dari rekeningmu sendiri\\?/.test(dialog()?.innerText ?? ''), 60);
    const teks = dialog().innerText.replace(/\\s+/g, ' ').slice(-200);
    tombol('Ya, pindah dari Mandiri', dialog()).click();
    await sampai(() => tombol('Simpan', dialog()) && !tombol('Simpan', dialog()).disabled, 60); tombol('Simpan', dialog()).click();
    await sampai(() => /Saldo Mandiri sekarang berapa\\?/.test(dialog()?.innerText ?? ''), 30);
    tombol('Lewati', dialog()).click(); await sampai(() => [...dialog().querySelectorAll('[role=timer]')].length > 0, 20); dialog().close(); await t(500);
    return teks`);
  const { data: mandiri } = await sb.from("user_accounts").select("id, kind").eq("name", "Mandiri").maybeSingle();
  const { data: tMandiri } = await sb.from("transactions").select("type, kantong_id, kantong_tujuan_id, status").eq("amount", 60_000).maybeSingle();
  cek("B-4: “Uang dari Mandiri ini dari rekeningmu sendiri?” → Ya → kantong Mandiri dibuat, pindah Mandiri → DANA",
    /Uang dari Mandiri ini dari rekeningmu sendiri\?/.test(sendiri) && /Bukan, pemasukan/.test(sendiri) && mandiri?.kind === "bank" && tMandiri?.type === "transfer" && tMandiri.kantong_id === mandiri.id && tMandiri.kantong_tujuan_id === dana.id && tMandiri.status === "confirmed",
    JSON.stringify({ sendiri, mandiri, tMandiri }));

  await buka(`${base}/`, 5000);
  const paylater = await langkah("belanja SPayLater tanpa tenor", `${tempelHasil("spaylater.png", { ...dasarHasil, amount: 120_000, transaction_date: hariIni, type: "expense", category: "shopping", merchant: "Toko Sepatu Contoh", payment_method: null, payment_target: null, dompet: "ShopeePay", paylater: { penyedia: "SPayLater", tenor: null, per_cicilan: null, jatuh_tempo: null } }, await warnaLain(90))}
    await sampai(() => /Pakai kantong apa\\?|Dicicil berapa kali/.test(dialog()?.innerText ?? ''), 60);
    const teks = dialog().innerText.replace(/\\s+/g, ' ').slice(-200);
    tombol('+ Buat kantong Shopee PayLater', dialog())?.click();
    await sampai(() => tombol('Simpan', dialog()) && !tombol('Simpan', dialog()).disabled, 60); tombol('Simpan', dialog()).click();
    await sampai(() => /Utang Shopee PayLater sekarang berapa\\?/.test(dialog()?.innerText ?? ''), 30);
    isi(dialog().querySelector('textarea'), '300000'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => [...dialog().querySelectorAll('[role=timer]')].length > 0, 20); dialog().close(); await t(500);
    return teks`);
  const { data: spl } = await sb.from("user_accounts").select("id, kind, emoji, saldo_awal").eq("name", "Shopee PayLater").maybeSingle();
  const { data: tSpl } = await sb.from("transactions").select("type, kantong_id, status").eq("amount", 120_000).maybeSingle();
  const { count: nCicilan } = await sb.from("cicilan").select("id", { count: "exact", head: true });
  cek("D-4: belanja paylater tanpa tenor tidak ditanya tenornya; “+ Buat kantong Shopee PayLater” (kredit 💳) → pengeluaran dari kantong utang; utang 300.000 disimpan minus",
    !/Dicicil berapa kali/.test(paylater) && /\+ Buat kantong Shopee PayLater/.test(paylater) && spl?.kind === "kredit" && spl.emoji === "💳" && Number(spl.saldo_awal) === -300_000 && tSpl?.type === "expense" && tSpl.kantong_id === spl.id && tSpl.status === "confirmed" && nCicilan === 0,
    JSON.stringify({ paylater, spl, tSpl, nCicilan }));
  await buka(`${base}/pinjaman`, 5000);
  const utang = await jalankan(`document.body.innerText.replace(/\\s+/g, ' ')`);
  cek("Utang & Piutang: kantong utang Shopee PayLater tampil bersama kartu kredit (“Tagihan paylater”)", /Shopee PayLater/.test(utang) && /Tagihan paylater/.test(utang), utang.slice(0, 300));

  // --- 4. Layar awal: tanpa kantong & tanpa pilihan → langkah saldo dilewati (maju & mundur); lalu pilih DANA → label & Rp; e-wallet.
  const { uid: uid2, sb: sb2 } = await masuk(EMAIL2, {});
  // Kantong Tunai bawaan tidak bisa dihapus lewat API (juga service role): persiapan uji lewat koneksi database.
  await hapusTunai(uid2);
  await buka(`${base}/mulai`, 6000);
  const awal = await langkah("layar awal tanpa pilihan", `
    const titik = () => document.querySelector('[class*=mulaiTitik]').children.length;
    const judul = () => document.querySelector('h1')?.innerText ?? document.body.innerText.slice(0, 40);
    const lanjut = () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lanjut').click();
    const kembali = () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Kembali').click();
    lanjut(); await t(500); const l1 = judul(); const n = titik();
    lanjut(); await t(500); const l2 = judul();
    kembali(); await t(500); const l3 = judul();
    [...document.querySelectorAll('button')].find((b) => /DANA/.test(b.textContent) && b.getAttribute('aria-pressed') !== null).click(); await t(300);
    const n2 = titik();
    lanjut(); await t(500); const l4 = judul();
    const f = document.querySelector('[class*=fieldBaris]');
    const label = f?.querySelector('[class*=fieldLabel]'); const input = f?.querySelector('input');
    return { l1, n, l2, l3, n2, l4, label: label?.innerText, labelTampil: label && getComputedStyle(label).visibility, rp: f?.querySelector('[class*=awalan]')?.innerText, ph: input?.placeholder }`);
  cek("Layar awal tanpa pilihan: Lanjut dari langkah 1 → \"Siap mencatat!\", Kembali → langkah 1, titik 3",
    awal.l1 === "Uangmu disimpan di mana?" && awal.l2 === "Siap mencatat!" && awal.l3 === "Uangmu disimpan di mana?" && awal.n === 3, JSON.stringify(awal));
  cek("Pilih DANA → 4 titik, langkah saldo dengan label \"📱 DANA\" tampil walau kosong, awalan Rp, placeholder 0",
    awal.n2 === 4 && awal.l4 === "Berapa saldonya sekarang?" && awal.label === "📱 DANA" && awal.labelTampil === "visible" && awal.rp === "Rp" && awal.ph === "0", JSON.stringify(awal));
  cek("360: layar awal tanpa gulir mendatar", await tanpaGeser());
  await foto("kantong-sendiri-4-awal-360.png");
  await langkah("isi saldo & mulai", `isi(document.querySelector('[class*=fieldBaris] input'), '50000'); await t(200);
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lanjut').click(); await t(500);
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Mulai mencatat').click();
    await sampai(() => location.pathname === '/', 30); await t(1500); return location.pathname`);
  const { data: danaAwal } = await sb2.from("user_accounts").select("kind, saldo_awal").eq("name", "DANA").maybeSingle();
  cek("E-wallet dari layar awal berjenis ewallet (E-2), saldonya tersimpan", danaAwal?.kind === "ewallet" && Number(danaAwal.saldo_awal) === 50_000, JSON.stringify(danaAwal));

  cek("tidak ada error console", masalah.length === 0, JSON.stringify(masalah));
} catch (e) {
  console.log("GAGAL:", e.message);
  gagal++;
} finally {
  for (const id of uids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    console.log(error ? "GAGAL hapus akun uji" : "✓ akun uji dihapus");
  }
  console.log(gagal ? `${gagal} cek gagal` : "semua cek lulus");
  edge.kill();
  process.exit(0);
}
