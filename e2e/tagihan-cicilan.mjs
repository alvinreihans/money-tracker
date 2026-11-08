// Nomor cicilan & draft (SPEC-tagihan-cicilan §2): draft bayar cicilan tidak
// dihitung terbayar; nomornya ditetapkan saat draft selesai, dan rencana yang
// sudah lunas dilepas. Draft disuntik langsung, tanpa AI. §1 & §3 (dari AI)
// diuji di scripts/uji-pinjaman.mts.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, langkah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-tagihan-cicilan-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: bca } = await sb.from("user_accounts").insert({ user_id: uid, name: "BCA", kind: "bank", emoji: "🏦", saldo_awal: 1000000, saldo_per: "2026-01-01" }).select("id").single();
  const rencana = (nama, tenor) =>
    sb.from("cicilan").insert({ user_id: uid, nama, penyedia: "Shopee PayLater", category: "shopping", nominal: 100000, tenor, jatuh_tempo_awal: hariIni }).select("id").single();
  const { data: sepatu } = await rencana("Sepatu", 3);
  const { data: topi } = await rencana("Topi", 1);
  const bayar = (cicilan_id, cicilan_ke, status = "confirmed") =>
    sb.from("transactions").insert({
      user_id: uid, amount: 100000, type: "expense", category: "shopping", merchant: "Sepatu", transaction_date: hariIni, source: "text", status, cicilan_id, cicilan_ke,
      ...(status === "confirmed" ? { kantong_id: bca.id, payment_method: "BCA" } : { kantong_id: null, payment_method: null, description: `Cicilan ${cicilan_ke}/3 · Shopee PayLater` }),
    }).select("id").single();

  // Cicilan 1 dibayar; draft "Pakai kantong apa?" sempat mendapat nomor 2.
  await bayar(sepatu.id, 1);
  const { data: draft } = await bayar(sepatu.id, 2, "needs_review");

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // --- 1. Draft tidak dihitung: Utang & Piutang menulis 1/3, bukan 2/3.
  await buka(`${base}/pinjaman`, 6000);
  const halaman = await langkah("pinjaman", `return teksHalaman()`);
  cek("Draft tidak dihitung terbayar (Sepatu 1/3)", /Sepatu[^]*?1\/3/.test(halaman) && !/Sepatu[^]*?2\/3/.test(halaman));

  // --- 2. Selama jadi draft, cicilan 2 dibayar lewat jalur lain. Draft selesai → nomor 3.
  await bayar(sepatu.id, 2);
  // Jawaban terakhir → kartu "Periksa dulu" (belum dihitung), lalu Simpan (SPEC-periksa-dulu §1).
  const jawabSimpan = (id, body) =>
    langkah(`jawab & simpan ${id.slice(0, 8)}`, `const r = await fetch('/api/draft/${id}/jawab', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body)}) });
      const jawab = await r.json();
      const s = await fetch('/api/draft/${id}/simpan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      return JSON.stringify({ jawab: { pertanyaan: jawab.pertanyaan, status: jawab.transaction?.status }, ...(await s.json()) })`);
  const jawab = (id) => jawabSimpan(id, { jenis: "kantong", nilai: "BCA" });
  const r1 = JSON.parse(await jawab(draft.id));
  const j1 = r1.transaction ?? {};
  cek("Jawaban terakhir: tinggal dicek (belum dihitung) sampai Simpan", r1.jawab?.pertanyaan === "konfirmasi" && r1.jawab?.status === "needs_review", JSON.stringify(r1.jawab));
  cek("Draft selesai mendapat nomor terkecil yang belum dibayar (3)", j1.status === "confirmed" && j1.cicilan_ke === 3 && j1.description === "Cicilan 3/3 · Shopee PayLater", JSON.stringify(j1));

  // --- 3. Rencana yang sudah lunas: draft dilepas dari rencananya, uangnya tetap tercatat.
  await bayar(topi.id, 1);
  const { data: draftTopi } = await bayar(topi.id, 1, "needs_review");
  const j2 = JSON.parse(await jawab(draftTopi.id)).transaction ?? {};
  cek("Rencana lunas: draft jadi pengeluaran biasa", j2.status === "confirmed" && j2.cicilan_id === null && j2.description === "Rencana cicilan “Topi” sudah lunas", JSON.stringify(j2));
  // --- 4. Tagihan kartu kredit yang belum terdaftar (§1): pertanyaan `kartu`, bukan "Pindah ke kantong mana?".
  const tagihan = () =>
    sb.from("transactions").insert({
      user_id: uid, amount: 200000, type: "transfer", category: "other", merchant: "Kartu kredit Mandiri", transaction_date: hariIni, source: "text",
      status: "needs_review", kantong_id: bca.id, payment_method: "BCA", kantong_tujuan_id: null,
    }).select("id").single();
  const { data: t1 } = await tagihan();
  await buka(`${base}/?catat=${t1.id}`, 6000);
  const tanya = await langkah("tanya kartu", `await sampai(() => teksHalaman().includes("belum terdaftar"), 30);
    const b = [...document.querySelectorAll("button")].map((x) => x.textContent.trim());
    return JSON.stringify({ teks: teksHalaman().includes("Kartu kredit Mandiri belum terdaftar. Bayar ke kartu yang mana?"), tambah: b.includes("+ Tambah Kartu kredit Mandiri"), hapus: b.includes("Hapus catatan"), bca: b.some((x) => x.endsWith("BCA")) })`);
  const tq = JSON.parse(tanya || "{}");
  cek("Kartu belum terdaftar: ditanya kartunya, pilihan tambah & hapus, tanpa kantong uang", tq.teks && tq.tambah && tq.hapus && !tq.bca, tanya);
  const j3 = JSON.parse(await jawabSimpan(t1.id, { jenis: "kartu", nilai: "tambah" })).transaction ?? {};
  const { data: kartu } = await sb.from("user_accounts").select("id, kind, saldo_awal").eq("name", "Kartu kredit Mandiri").maybeSingle();
  cek("Tambah kartu: kartu kredit dibuat bertagihan = pembayaran, jadi tujuan", j3.status === "confirmed" && kartu?.kind === "kredit" && Number(kartu?.saldo_awal) === -200000 && j3.kantong_tujuan_id === kartu?.id, JSON.stringify({ j3: j3.kantong_tujuan_id, kartu }));
  await buka(`${base}/pinjaman`, 6000);
  cek("Kartu baru tanpa tagihan sesudah dibayar", /Kartu kredit Mandiri[^]*?Tidak ada tagihan/.test(await langkah("pinjaman 2", `return teksHalaman()`)));
  // Jatuh tempo tetap tampil walau tanpa tagihan (SPEC-perbaikan-temuan F1).
  await sb.from("user_accounts").update({ jatuh_tempo_hari: 31 }).eq("id", kartu.id);
  await buka(`${base}/pinjaman`, 6000);
  cek("Kartu tanpa tagihan tetap menampilkan jatuh tempo", /Tidak ada tagihan · jatuh tempo \d{1,2} \w+/.test(await langkah("pinjaman 3", `return teksHalaman()`)));
  const { data: t2 } = await tagihan();
  const j4 = JSON.parse(await jawabSimpan(t2.id, { jenis: "kartu", nilai: kartu?.id })).transaction ?? {};
  cek("Pilih kartu yang sudah ada: jadi tujuan", j4.status === "confirmed" && j4.kantong_tujuan_id === kartu?.id, JSON.stringify(j4.kantong_tujuan_id));
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
