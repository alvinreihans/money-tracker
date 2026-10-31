import { createRequire } from "node:module";
import { base, buka, cdp, edge, langkah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-ingat-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const B = hariIni.slice(0, 7);
const tgl = (h) => `${B}-${String(Math.min(h, Number(hariIni.slice(8)))).padStart(2, "0")}`;
const PILIH = `const pilih = async (akar, kolom, teks) => { akar.querySelector('[data-kolom="' + kolom + '"] button').click(); await sampai(() => [...document.querySelectorAll('dialog[open]')].length > 1 || dialog() !== akar); await t(300); [...dialog().querySelectorAll('button')].find(b => b.textContent.includes(teks)).click(); await t(400); };`;
const tekan = (teks, akar = "document") => `[...${akar}.querySelectorAll('button, a')].find(b => b.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(teks)} || b.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(teks)}))`;
const KATA = (teks) => `[...document.querySelectorAll('dialog[open]')].some(d => d.innerText.includes(${JSON.stringify(teks)}))`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: sea } = await sb.from("user_accounts").insert({ user_id: uid, name: "SeaBank", kind: "bank", emoji: "🏦", saldo_awal: 5000000, saldo_per: "2026-01-01", saldo_sejak: "2026-01-01T00:00:00+07:00" }).select("id").single();
  await sb.from("categories").insert({ user_id: uid, type: "expense", slug: "c-laundry", name: "Laundry", icon: "shirt", color: "#4fc9e0", sort: 20, kelompok: "kebutuhan" });
  const tx = (amount, category, merchant, d) => ({ user_id: uid, status: "confirmed", source: "text", amount, type: "expense", category, merchant, transaction_date: d, kantong_id: sea.id, payment_method: "SeaBank" });
  const tambah = async (r) => (await sb.from("transactions").insert(r).select("id").single()).data.id;
  const w1 = await tambah(tx(16000, "food", "WAITENJOY.CO", tgl(1)));
  const d1 = await tambah(tx(11000, "other", "Dnid Ridx Dana", tgl(1)));
  const d2 = await tambah(tx(11000, "other", "Dnid Ridx Dana", tgl(2)));
  const t1 = await tambah(tx(20000, "food", "Toko Qwrtz", tgl(1)));
  const k1 = await tambah(tx(25000, "food", "Kopi Kenangan", tgl(1)));
  const kat = async (id) => (await sb.from("transactions").select("category").eq("id", id).single()).data?.category;

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  const edit = async (id, kategori) => {
    await buka(`${base}/transactions/${id}`, 5000);
    return langkah(`edit ${id.slice(0, 6)} → ${kategori}`, `${PILIH} ${tekan("Edit transaksi")}.click(); await sampai(() => dialog()?.querySelector('[data-kolom="category"]')); await t(400);
      await pilih(dialog(), 'category', ${JSON.stringify(kategori)});
      ${tekan("Simpan", "dialog()")}.click(); await sampai(() => !dialog() || ${KATA("Ubah juga")}, 20); await t(2500);
      return { tawaran: [...document.querySelectorAll('dialog[open]')].map(d => d.innerText.replace(/\\s+/g, ' ')).find(x => x.includes('Ubah juga')) ?? null }`);
  };
  const catat = (teks) =>
    langkah(`catat "${teks}"`, `if (!dialog()) { document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea')); await t(300); }
      const n = (dialog().innerText.match(/Tersimpan/g) || []).length;
      isi(dialog().querySelector('textarea'), ${JSON.stringify(teks)}); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
      await sampai(() => (dialog()?.innerText.match(/Tersimpan/g) || []).length > n, 90); await t(1500); return 'ok'`);
  const baru = async (merchantKecil, amount) => (await sb.from("transactions").select("id, category, merchant").eq("amount", amount).order("created_at", { ascending: false })).data.find((r) => (r.merchant ?? "").toLowerCase().replace(/[^a-z]/g, "").startsWith(merchantKecil));
  const tanya = (teks) =>
    langkah(`tanya "${teks}"`, `await sampai(() => document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]'), 20);
      if (!dialog()) { document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()?.querySelector('textarea')); await t(300); }
      const n = dialog().querySelectorAll('[class*=gptAI]').length;
      isi(dialog().querySelector('textarea'), ${JSON.stringify(teks)}); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
      await sampai(() => dialog().querySelectorAll('[class*=gptAI]').length > n, 120); await t(500);
      const ai = [...dialog().querySelectorAll('[class*=gptAI]')].at(-1);
      return { jawaban: ai.innerText.replace(/\\s+/g, ' '), kartu: ai.querySelector('[class*=gptUsulan]')?.innerText.replace(/\\s+/g, ' ') ?? null }`);
  const tekanKartu = (teks, tunggu) =>
    langkah(`kartu ${teks}`, `const kartu = [...dialog().querySelectorAll('[class*=gptUsulan]')].at(-1); ${tekan(teks, "kartu")}.click();
      await sampai(() => [...dialog().querySelectorAll('[class*=gptUsulan]')].at(-1).innerText.includes(${JSON.stringify(tunggu)}), 30); await t(1500);
      return [...dialog().querySelectorAll('[class*=gptUsulan]')].at(-1).innerText.replace(/\\s+/g, ' ')`);

  // --- 1. Betulkan WAITENJOY jadi Laundry (tidak ada transaksi lain → tanpa tawaran).
  const e1 = await edit(w1, "Laundry");
  cek("Edit WAITENJOY → Laundry; tidak ada tawaran (tidak ada yang lain)", (await kat(w1)) === "c-laundry" && e1?.tawaran === null, JSON.stringify(e1));

  // --- 2. Catat lagi lewat AI: kategori diingat.
  await buka(`${base}/`, 5000);
  await catat("waitenjoy.co 18rb pakai seabank");
  const w2 = await baru("waitenjoy", 18000);
  cek("Catat 'waitenjoy.co 18rb' → langsung Laundry (diingat)", w2?.category === "c-laundry", JSON.stringify(w2));

  // --- 3. Edit Dnid Ridx Dana terbaru → Makan: tawaran untuk 1 lainnya → Ubah → Urungkan.
  const e3 = await edit(d2, "Makan");
  cek("Edit Dnid Ridx Dana → Makan: tawaran 'Ubah juga 1 transaksi'", /Ubah juga 1 transaksi Dnid Ridx Dana lain jadi Makan\?/.test(norm(e3?.tawaran)), JSON.stringify(e3));
  await langkah("ubah", `${tekan("Ubah", "dialog()")}.click(); await sampai(() => /jadi Makan/.test(document.body.innerText) && !dialog(), 20); await t(1500); return 'ok'`);
  const setelahUbah = await kat(d1);
  await langkah("urungkan", `await sampai(() => ${tekan("Urungkan")}, 10); ${tekan("Urungkan")}.click(); await sampai(() => /Kategori lama dikembalikan/.test(document.body.innerText), 20); await t(1000); return 'ok'`);
  cek("Tawaran: Ubah → transaksi lama jadi Makan; Urungkan → kembali Lainnya", setelahUbah === "food" && (await kat(d1)) === "other" && (await kat(d2)) === "food", JSON.stringify({ setelahUbah, d1: await kat(d1) }));

  // --- 4. Catat Dnid Ridx Dana lagi: ikut yang terbaru (Makan), Lainnya dilewati.
  await buka(`${base}/`, 5000);
  await catat("transfer ke dnid ridx dana 12rb pakai seabank");
  const d3 = await baru("dnidridx", 12000);
  cek("Catat Dnid Ridx Dana lagi → Makan", d3?.category === "food", JSON.stringify(d3));

  // --- 5. Tanya AI: usulan untuk kategori yang ada.
  await buka(`${base}/`, 5000);
  const q1 = await tanya("transfer ke Dnid Ridx Dana itu bayar makan di warteg, tolong betulkan kategorinya");
  const ngaku = /\bsudah (saya |aku )?(di)?(ubah|ganti|betulkan|perbaiki)/i.test(q1?.jawaban ?? "");
  cek("Tanya AI: kartu usulan, belum mengaku sudah mengubah", /Ubah 1 transaksi Dnid Ridx Dana jadi Makan\?/i.test(norm(q1?.kartu)) && !ngaku && (await kat(d1)) === "other", JSON.stringify(q1));
  const k5 = await tekanKartu("Ubah", "sekarang");
  const d1Ubah = await kat(d1);
  const k5b = await tekanKartu("Urungkan", "Dikembalikan");
  cek("Kartu: Ubah → berubah; Urungkan → kembali", d1Ubah === "food" && (await kat(d1)) === "other" && /Dikembalikan/.test(k5b ?? ""), JSON.stringify({ k5, d1Ubah, k5b }));

  // --- 6. Tanya AI: kategori baru.
  const q2 = await tanya("Kopi Kenangan harusnya masuk kategori Jajan, tolong betulkan");
  cek("Tanya AI: usulan membuat kategori baru Jajan", /Buat kategori Jajan dan ubah 1 transaksi Kopi Kenangan jadi Jajan\?/.test(norm(q2?.kartu)), JSON.stringify(q2));
  await tekanKartu("Ubah", "sekarang");
  const { data: jajan } = await sb.from("categories").select("slug, kelompok, type").eq("name", "Jajan").maybeSingle();
  cek("Kategori Jajan dibuat dan Kopi Kenangan pindah ke sana", jajan?.type === "expense" && (await kat(k1)) === jajan?.slug, JSON.stringify({ jajan, k1: await kat(k1) }));
  await langkah("tutup tanya", `dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(600); return 'ok'`);

  // --- 7. Pertanyaan biasa tidak mengusulkan apa pun.
  const q3 = await tanya("berapa total pengeluaran laundry bulan ini?");
  cek("Pertanyaan biasa: tanpa kartu usulan", q3?.kartu === null, JSON.stringify(q3));
  await langkah("tutup tanya", `dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(600); return 'ok'`);

  // --- 8. Koreksi di obrolan Catat → tawaran yang sama.
  await buka(`${base}/`, 5000);
  await catat("toko qwrtz 30rb pakai seabank");
  const q8 = await langkah("koreksi", `isi(dialog().querySelector('textarea'), 'bukan, itu laundry'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => ${KATA("Ubah juga")}, 60); await t(800);
    return [...document.querySelectorAll('dialog[open]')].map(d => d.innerText.replace(/\\s+/g, ' ')).find(x => x.includes('Ubah juga'))`);
  cek("Koreksi 'bukan, itu laundry' → tawaran untuk Toko Qwrtz lama", /Ubah juga 1 transaksi .*Qwrtz.* lain jadi Laundry\?/i.test(norm(q8)), JSON.stringify(q8));
  await langkah("ubah", `${tekan("Ubah", "[...document.querySelectorAll('dialog[open]')].at(-1)")}.click(); await sampai(() => /jadi Laundry/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  cek("Toko Qwrtz lama ikut jadi Laundry", (await kat(t1)) === "c-laundry");
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
