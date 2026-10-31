import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-fase1a-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // --- 1. Bagikan di latar → titik di + muncul tanpa muat ulang.
  await buka(`${base}/`, 6000);
  await langkah("service worker siap", `await navigator.serviceWorker.ready; await sampai(() => navigator.serviceWorker.controller, 20); window.__belumMuatUlang = true; return 'ok'`);
  const bagikan = await langkah("bagikan gambar (diproses di latar)", `
    const titik = () => !!document.querySelector('button[aria-label="Catat transaksi"] [role=img]');
    const awal = titik();
    const gambar = await (await fetch('/logo.png')).blob();
    const fd = new FormData(); fd.append('struk', new File([gambar], 'struk.png', { type: 'image/png' }));
    await fetch('/bagikan', { method: 'POST', body: fd, redirect: 'manual' });
    const muncul = await sampai(titik, 120);
    return { awal, muncul, tanpaMuatUlang: window.__belumMuatUlang === true }`);
  cek("Bagikan: titik 'belum selesai' di + muncul sendiri, tanpa muat ulang", bagikan && !bagikan.awal && bagikan.muncul && bagikan.tanpaMuatUlang, JSON.stringify(bagikan));
  await foto("fase1-bagikan-titik.png");

  // --- 2. Kembali ke aplikasi → data segar (transaksi dari tempat lain muncul).
  await buka(`${base}/riwayat`, 5000);
  await jalankan(`window.__belumMuatUlang = true`);
  await sb.from("transactions").insert({ user_id: uid, status: "confirmed", source: "text", type: "expense", amount: 42000, category: "food", merchant: "Dari HP lain", transaction_date: "2026-10-24", kantong_id: tunai.id });
  await tidur(11000); // lewat batas 10 detik
  const segar = await langkah("kembali ke aplikasi", `
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    const ada = await sampai(() => document.body.innerText.includes('Dari HP lain'), 20);
    return { ada, tanpaMuatUlang: window.__belumMuatUlang === true }`);
  cek("Kembali ke aplikasi: transaksi baru tampil tanpa muat ulang", segar && segar.ada && segar.tanpaMuatUlang, JSON.stringify(segar));

  // --- 3. Ketikan Catat bertahan.
  await buka(`${base}/`, 5000);
  const draf = await langkah("ketik lalu tutup & buka lagi", `
    const bukaCatat = async () => { document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea')); await t(300); return dialog().querySelector('textarea'); };
    let ta = await bukaCatat(); isi(ta, 'bensin 30rb'); await t(300);
    dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(600);
    ta = await bukaCatat();
    return ta.value`);
  cek("Catat: ketikan kembali setelah ditutup & dibuka", draf === "bensin 30rb", String(draf));
  await buka(`${base}/`, 5000);
  const drafMuat = await langkah("setelah muat ulang", `document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea')); await t(300); return dialog().querySelector('textarea').value`);
  cek("Catat: ketikan bertahan setelah aplikasi dimuat ulang", drafMuat === "bensin 30rb", String(drafMuat));
  const kirim = await langkah("kirim", `const ta = dialog().querySelector('textarea'); isi(ta, 'kopi 18rb tunai'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click(); await sampai(() => /Tercatat|tercatat/.test(dialog()?.innerText || ''), 60); await t(500); dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(600); document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea')); await t(300); return { kolom: dialog().querySelector('textarea').value, simpanan: localStorage.getItem('catat-draf') }`);
  cek("Catat: setelah dikirim, drafnya hilang", kirim && kirim.kolom === "" && kirim.simpanan === null, JSON.stringify(kirim));
  // Jawaban pertanyaan tidak jadi draf transaksi baru.
  await langkah("tutup", `dialog()?.dispatchEvent(new Event('cancel', { cancelable: true })); await t(400); return 'ok'`);

  // --- 4. Urungkan hapus (dengan cashback).
  const { data: indukBaru } = await sb.from("transactions").insert({ user_id: uid, status: "confirmed", source: "text", type: "expense", amount: 100000, category: "shopping", merchant: "Toko Urungkan", transaction_date: "2026-10-24", kantong_id: tunai.id }).select("id").single();
  const { data: anakBaru } = await sb.from("transactions").insert({ user_id: uid, status: "confirmed", source: "text", type: "income", amount: 5000, category: "refund", merchant: "Cashback", transaction_date: "2026-10-24", kantong_id: tunai.id, induk_id: indukBaru.id }).select("id").single();
  // Dibaca ulang: balasan insert lewat view belum memuat penyesuaian trigger (created_at ikutan).
  const { data: tersimpan } = await sb.from("transactions").select("*").in("id", [indukBaru.id, anakBaru.id]);
  const induk = tersimpan.find((x) => x.id === indukBaru.id);
  const anak = tersimpan.find((x) => x.id === anakBaru.id);
  const saldo = async () => (await sb.rpc("saldo_kantong")).data?.find((k) => k.id === tunai.id)?.saldo;
  const saldoAwal = await saldo();
  await buka(`${base}/transactions/${induk.id}`, 5000);
  const urung = await langkah("hapus lalu urungkan", `
    document.querySelector('button[aria-label="Hapus transaksi"]').click(); await sampai(() => dialog());
    const teks = dialog().innerText;
    tombol('Hapus', dialog()).click();
    await sampai(() => /Transaksi dihapus/.test(document.body.innerText), 20);
    const di = location.pathname;
    tombol('Urungkan').click();
    await sampai(() => /dikembalikan/.test(document.body.innerText), 20);
    return { teks: teks.replace(/\\s+/g, ' ').slice(0, 80), di }`);
  await tidur(1500);
  const { data: kembali } = await sb.from("transactions").select("*").in("id", [induk.id, anak.id]);
  const sebelumSesudah = [induk, anak].map((x) => { const y = kembali?.find((r) => r.id === x.id); return Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y?.[k])).map((k) => `${k}: ${JSON.stringify(x[k])} → ${JSON.stringify(y?.[k])}`); });
  console.log("   beda kolom:", JSON.stringify(sebelumSesudah), "saldo:", saldoAwal, "→", await saldo());
  const sama = (a, b) => a && b && a.id === b.id && a.created_at === b.created_at && Number(a.amount) === Number(b.amount) && a.induk_id === b.induk_id && a.merchant === b.merchant;
  cek("Urungkan: konfirmasi menyebut bisa diurungkan; transaksi & cashback kembali (id & created_at sama); saldo sama",
    urung && /diurungkan/.test(urung.teks) && kembali?.length === 2 && sama(kembali.find((x) => x.id === induk.id), induk) && sama(kembali.find((x) => x.id === anak.id), anak) && (await saldo()) === saldoAwal,
    JSON.stringify({ urung, jumlah: kembali?.length, saldoAwal }));

  // onboarding tidak tersentuh
  const { data: akun } = await admin.auth.admin.getUserById(uid);
  cek("tanda onboarding tetap ada", Boolean(akun.user.user_metadata?.onboarding_selesai));
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
