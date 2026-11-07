// Lengkapi transaksi dari screenshot & struk (docs/specs/SPEC-lengkapi.md):
// rekening koran SeaBank BUATAN (pdf-lib, scripts/contoh-rekening.mjs) diimpor →
// gambar diunggah dengan hasil AI disuntik (fetch di halaman menambah field
// `hasil`, tanpa AI) → kartu "Lengkapi transaksi ini?" → isi berubah, nominal/
// tanggal/kantong tetap, tanda Perlu dilengkapi hilang, cashback ke kantong
// ShopeePay yang dibuat (K4); gambar & Order SN yang sama → "sudah dipakai";
// unggah banyak → ringkasan, lengkapi otomatis (urutan jam = urutan rekening),
// Urungkan; "Catat sebagai baru" → duplikat → "Lengkapi yang sudah ada".
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, langkah, masalah } from "./kepala.mjs";
import { seabankBulan } from "../scripts/contoh-rekening.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const { PDFDocument, StandardFonts } = req("pdf-lib");
const sharp = req("sharp");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-lengkapi-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

async function buatPdf(halaman) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const h of halaman) {
    const p = doc.addPage([842, 842]);
    for (const it of h.items) p.drawText(it.s, { x: it.x, y: it.y, size: 6, font });
  }
  return Buffer.from(await doc.save());
}
const bayar = (tgl, n) => ({ tgl, atas: ["ShopeePay"], n: -n, bawah: ["Payment"] });
// SeaBank …1234 September (rekaan): A = satu pasangan; B1/B2 = sebayar setanggal tanpa jam; C = cashback; D = duplikat.
const PDF = await buatPdf(
  seabankBulan({ dari: "01 SEP 2026", sampai: "30 SEP 2026", awal: 1_000_000, baris: [bayar("03 SEP", 32_500), bayar("05 SEP", 18_000), { tgl: "05 SEP", atas: ["Toko Lain"], n: -7_000, bawah: ["Payment"] }, bayar("05 SEP", 18_000), bayar("07 SEP", 12_000)] }),
);
/** Gambar kecil yang isinya berbeda (sidik berbeda). */
const gambar = async (warna) => (await sharp({ create: { width: 24, height: 24, channels: 3, background: { r: warna, g: 80, b: 160 } } }).png().toBuffer()).toString("base64");
/** Hasil baca AI rekaan (bentuk yang dikembalikan server). */
const hasil = (x) => ({
  type: "expense", category: "groceries", merchant: "Toko Contoh", description: null, payment_method: "SeaBank", payment_target: null,
  fee: null, cashback: null, pinjaman: null, cicilan: null, paylater: null, document_type: "payment_proof", bukti_transfer: null,
  kelompok: null, rincian: null, usulan_pecah: null, time_hint: null, sumber_dana: "SeaBank", dompet: "ShopeePay", voucher: null, ...x,
});

try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: sea, error: eK } = await sb.from("user_accounts").insert({ user_id: uid, name: "SeaBank", kind: "bank", emoji: "🏦", nomor_akhir: "1234", saldo_awal: 1_000_000, saldo_per: "2026-09-01", saldo_sejak: "2026-09-01T00:00:00+07:00" }).select("id").single();
  if (eK) throw eK;
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  const cookie = kue.map(([n, v]) => `${n}=${v}`).join("; ");
  await cdp("Network.enable");
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // --- 0. Impor rekening koran buatan.
  const fd = new FormData();
  fd.append("berkas", new File([PDF], "seabank-sep.pdf", { type: "application/pdf" }));
  const imp = await (await fetch(`${base}/api/rekening/impor`, { method: "POST", body: fd, headers: { cookie } })).json();
  const semua = async () => (await sb.from("transactions").select("*").order("created_at")).data ?? [];
  let tx = await semua();
  const baris = (n, tgl) => tx.filter((t) => Number(t.amount) === n && t.transaction_date === tgl && !t.induk_id);
  cek("Impor: 5 baris, Perlu dilengkapi, urutan rekening tersimpan (created_at berbeda)", imp?.hasil?.transaksi === 5 && tx.filter((t) => t.perlu_dilengkapi).length === 5 && new Set(tx.map((t) => t.created_at)).size === 5, JSON.stringify(imp));
  const A = baris(32_500, "2026-09-03")[0];
  const [B1, B2] = baris(18_000, "2026-09-05");
  const C = baris(12_000, "2026-09-07")[0];

  await buka(`${base}/`, 6000);
  // Suntik hasil AI: tiap unggahan ke /api/upload-receipt membawa `hasil` menurut nama berkasnya.
  const suntik = (peta) => `window.__hasil = ${JSON.stringify(peta)};
    if (!window.__fetchAsli) { window.__fetchAsli = window.fetch;
      window.fetch = (u, o) => { if (String(u).includes('/api/upload-receipt') && o?.body instanceof FormData && !o.body.has('hasil')) { const f = o.body.get('file'); const h = window.__hasil[f?.name]; if (h) o.body.append('hasil', JSON.stringify(h)); } return window.__fetchAsli(u, o); }; }`;
  const fileJs = (nama, b64) => `new File([Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0))], '${nama}', { type: 'image/png' })`;
  const tempel = (nama, b64) => `document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
    const dt = new DataTransfer(); dt.items.add(${fileJs(nama, b64)});
    dialog().querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await t(400); dialog().querySelector('button[aria-label="Kirim"]').click();`;

  // --- 1. Satu gambar → kartu Lengkapi (cashback, belum ada kantong ShopeePay) → Lengkapi.
  const gA = await gambar(10);
  const hA = hasil({ amount: 32_500, transaction_date: "2026-09-03", time: "08:45", ref_bukti: "SNCONTOH0001", cashback: 15 });
  const kartu = await langkah("unggah screenshot A", `${suntik({ "a.png": hA })} ${tempel("a.png", gA)}
    await sampai(() => /Lengkapi transaksi ini\\?/.test(dialog()?.innerText ?? ''), 60);
    return dialog().innerText.replace(/\\s+/g, ' ')`);
  cek("Kartu Lengkapi: transaksi rekening koran, perubahan, tawaran kantong ShopeePay", /Lengkapi transaksi ini\?/.test(kartu) && /ShopeePay · −Rp\s?32\.500 · 3 Sep/.test(kartu) && /Merchant: ShopeePay → Toko Contoh/.test(kartu) && /Jam 08\.45/.test(kartu) && /Buat kantong ShopeePay untuk cashback/.test(kartu), kartu.slice(0, 400));
  await foto("lengkapi-1-kartu.png");
  cek("Belum ada yang disimpan sebelum dipilih", (await semua()).length === 5);
  const sesudah = await langkah("Lengkapi", `[...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lengkapi').click();
    await sampai(() => /Sudah dilengkapi/.test(dialog()?.innerText ?? ''), 30); return dialog().innerText.replace(/\\s+/g, ' ').slice(-300)`);
  tx = await semua();
  const a = tx.find((t) => t.id === A.id);
  const { data: spay } = await sb.from("user_accounts").select("id, name").eq("name", "ShopeePay").maybeSingle();
  const cb = tx.find((t) => t.induk_id === A.id);
  cek("A dilengkapi: merchant, jam, kategori, Order SN; nominal/tanggal/kantong tetap; Perlu dilengkapi hilang",
    a.merchant === "Toko Contoh" && a.waktu?.startsWith("08:45") && a.category === "groceries" && /ss:SNCONTOH0001/.test(a.ref_bukti) && Number(a.amount) === 32_500 && a.transaction_date === "2026-09-03" && a.kantong_id === sea.id && a.perlu_dilengkapi === false && tx.length === 6,
    JSON.stringify({ a, sesudah }));
  cek("Cashback Rp 15 = ikutan di kantong ShopeePay yang baru dibuat (K2, K4)", spay && cb && cb.type === "income" && Number(cb.amount) === 15 && cb.kantong_id === spay.id, JSON.stringify({ spay, cb }));
  await foto("lengkapi-2-dilengkapi.png");

  // --- 2. Gambar yang sama lagi → "sudah dipakai" tanpa AI; Order SN sama di gambar lain → juga.
  const dipakai = await langkah("gambar sama lagi", `dialog()?.close(); await t(800); ${tempel("a-lagi.png", gA)}
    await sampai(() => /sudah dipakai/.test(dialog()?.innerText ?? ''), 40); return dialog().innerText.replace(/\\s+/g, ' ').slice(-200)`);
  cek("Gambar yang sama → \"Struk ini sudah dipakai …\"", /sudah dipakai untuk melengkapi/.test(dipakai) && (await semua()).length === 6, dipakai);
  const fdSn = new FormData();
  fdSn.append("file", new File([Buffer.from(await gambar(11), "base64")], "a2.png", { type: "image/png" }));
  fdSn.append("hasil", JSON.stringify(hA));
  const rSn = await (await fetch(`${base}/api/upload-receipt`, { method: "POST", body: fdSn, headers: { cookie } })).json();
  cek("Order SN sama di gambar lain → sudah dipakai (tidak dicatat)", rSn?.dipakai?.id === A.id && (await semua()).length === 6, JSON.stringify(rSn).slice(0, 200));

  // --- 3. Unggah banyak (seret-lepas 3 gambar) → lengkapi otomatis + ringkasan.
  const hB1 = hasil({ amount: 18_000, transaction_date: "2026-09-05", time: "15:10", ref_bukti: "SNCONTOH0003", merchant: "Kedai Sore" });
  const hB2 = hasil({ amount: 18_000, transaction_date: "2026-09-05", time: "09:05", ref_bukti: "SNCONTOH0002", merchant: "Kedai Pagi" });
  const hC = hasil({ amount: 12_000, transaction_date: "2026-09-07", time: "12:00", ref_bukti: "SNCONTOH0004", merchant: "Warung Contoh", cashback: 5, category: "food" });
  const [g1, g2, g3] = [await gambar(20), await gambar(30), await gambar(40)];
  const ringkas = await langkah("seret 3 gambar", `dialog()?.close(); await t(500); ${suntik({ "sore.png": hB1, "pagi.png": hB2, "warung.png": hC })}
    const dt = new DataTransfer(); dt.items.add(${fileJs("sore.png", g1)}); dt.items.add(${fileJs("pagi.png", g2)}); dt.items.add(${fileJs("warung.png", g3)});
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sampai(() => /3 struk:/.test(document.body.innerText), 90); return (document.body.innerText.match(/3 struk:[^\\n]*/) || [''])[0]`);
  cek("Ringkasan: \"3 struk: 3 melengkapi transaksi\"", ringkas === "3 struk: 3 melengkapi transaksi", ringkas);
  tx = await semua();
  const b1 = tx.find((t) => t.id === B1.id), b2 = tx.find((t) => t.id === B2.id), c = tx.find((t) => t.id === C.id);
  cek("Sebayar setanggal tanpa jam: gambar paling pagi = baris rekening pertama", b1.merchant === "Kedai Pagi" && b1.waktu?.startsWith("09:05") && b2.merchant === "Kedai Sore" && b2.waktu?.startsWith("15:10"), JSON.stringify([b1.merchant, b1.waktu, b2.merchant, b2.waktu]));
  cek("C dilengkapi otomatis + cashback di ShopeePay", c.merchant === "Warung Contoh" && c.category === "food" && !c.perlu_dilengkapi && tx.some((t) => t.induk_id === C.id && t.kantong_id === spay.id), JSON.stringify(c));
  const urung = await langkah("ringkasan → Urungkan C", `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lihat').click();
    await sampai(() => /Hasil unggah/.test(dialog()?.innerText ?? ''), 20);
    const baris = [...dialog().querySelectorAll('[class*=baris]')].find((b) => /Warung Contoh/.test(b.innerText));
    [...baris.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Urungkan').click();
    await sampai(() => /Diurungkan/.test(dialog().innerText), 20); return dialog().innerText.replace(/\\s+/g, ' ').slice(0, 300)`);
  await foto("lengkapi-3-ringkasan.png");
  tx = await semua();
  const c2 = tx.find((t) => t.id === C.id);
  cek("Urungkan: C kembali (merchant bank, Lainnya, Perlu dilengkapi), cashback-nya hilang", c2.merchant === "ShopeePay" && c2.category === "other" && c2.perlu_dilengkapi === true && !c2.waktu && !c2.ref_bukti && !tx.some((t) => t.induk_id === C.id), JSON.stringify({ c2, urung }));

  // --- 4. Duplikat sama persis → "Lengkapi yang sudah ada".
  const { data: lama } = await sb.from("transactions").insert({ user_id: uid, amount: 27_000, type: "expense", category: "food", merchant: "Makan siang", transaction_date: "2026-09-10", waktu: "10:00:00", kantong_id: sea.id, status: "confirmed", source: "text" }).select("id").single();
  const gD = await gambar(50);
  const hD = hasil({ amount: 27_000, transaction_date: "2026-09-10", time: "10:00", ref_bukti: "SNCONTOH0005", merchant: "Resto Contoh", category: "food" });
  const dup = await langkah("unggah D → Catat sebagai baru → duplikat", `dialog()?.close(); await t(500); ${suntik({ "d.png": hD })} ${tempel("d.png", gD)}
    await sampai(() => /Lengkapi transaksi ini\\?/.test(dialog()?.innerText ?? ''), 60);
    [...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Catat sebagai baru').click();
    await sampai(() => /Catat lagi\\?/.test(dialog()?.innerText ?? '') && [...dialog().querySelectorAll('button')].some((b) => b.textContent.trim() === 'Lengkapi yang sudah ada'), 40);
    return [...dialog().querySelectorAll('[class*=pilihanJawab] button')].map((b) => b.textContent.trim())`);
  cek("Duplikat sama persis: pilihan ketiga \"Lengkapi yang sudah ada\"", Array.isArray(dup) && dup.includes("Lengkapi yang sudah ada") && dup.includes("Ya, catat lagi") && dup.includes("Bukan, buang"), JSON.stringify(dup));
  await foto("lengkapi-4-duplikat.png");
  await langkah("Lengkapi yang sudah ada", `[...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lengkapi yang sudah ada').click();
    await sampai(() => /tidak dicatat dua kali/.test(dialog()?.innerText ?? ''), 30); return 'ok'`);
  tx = await semua();
  const d = tx.find((t) => t.id === lama.id);
  cek("Transaksi lama dilengkapi (merchant dari gambar), draft dihapus, tidak ada transaksi baru", d.merchant === "Resto Contoh" && /ss:SNCONTOH0005/.test(d.ref_bukti ?? "") && !tx.some((t) => t.status === "needs_review") && tx.filter((t) => Number(t.amount) === 27_000).length === 1, JSON.stringify(d));

  // --- 5. Riwayat: filter Perlu dilengkapi tinggal yang belum (C).
  await buka(`${base}/riwayat?lengkapi=1`, 6000);
  const riwayat = await langkah("riwayat perlu dilengkapi", `return document.body.innerText.replace(/\\s+/g, ' ')`);
  cek("Riwayat Perlu dilengkapi · 2 (Toko Lain & C yang diurungkan)", /Perlu dilengkapi · 2/.test(riwayat), riwayat.slice(0, 300));

  // --- 6. Regresi T1 (UAT data asli): struk ≥ 22.00 bertanggal bisnis kasir (besoknya) →
  // melengkapi baris rekening koran sehari SEBELUM tanggal struk, tidak dicatat baru.
  const { data: E } = await sb.from("transactions").insert({ user_id: uid, amount: 21_500, type: "expense", category: "other", merchant: "ShopeePay", description: "ShopeePay Payment", transaction_date: "2026-09-12", kantong_id: sea.id, status: "confirmed", source: "statement", ref_bank: "seabank:1234:2026-09-12:-21500:regresi", perlu_dilengkapi: true }).select("id").single();
  const jumlahSebelum = (await semua()).length;
  const hE = hasil({ document_type: "receipt", amount: 21_500, transaction_date: "2026-09-13", time: "22:05", ref_bukti: "BONCONTOH0001", merchant: "Minimarket Malam", category: "groceries", payment_method: "QRIS ShopeePay", sumber_dana: null, dompet: "ShopeePay" });
  await buka(`${base}/`, 6000);
  const kartuE = await langkah("unggah struk 22.05", `${suntik({ "malam.png": hE })} ${tempel("malam.png", await gambar(60))}
    await sampai(() => /Lengkapi transaksi ini\\?|Tersimpan/.test(dialog()?.innerText ?? ''), 60);
    return dialog().innerText.replace(/\\s+/g, ' ')`);
  cek("Struk 13 Sep 22.05 → kartu Lengkapi untuk baris rekening 12 Sep", /Lengkapi transaksi ini\?/.test(kartuE) && /ShopeePay · −Rp\s?21\.500 · 12 Sep/.test(kartuE), kartuE.slice(-400));
  await langkah("Lengkapi struk malam", `[...dialog().querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Lengkapi').at(-1).click();
    await sampai(() => /Sudah dilengkapi/.test(dialog()?.innerText ?? ''), 30); return 'ok'`);
  tx = await semua();
  const e = tx.find((t) => t.id === E.id);
  cek("Baris 12 Sep dilengkapi (merchant toko, struk), tanggal/nominal/kantong tetap, tidak ada transaksi baru",
    e.merchant === "Minimarket Malam" && /struk:BONCONTOH0001/.test(e.ref_bukti ?? "") && e.transaction_date === "2026-09-12" && Number(e.amount) === 21_500 && e.kantong_id === sea.id && e.perlu_dilengkapi === false && tx.length === jumlahSebelum,
    JSON.stringify({ e, sebelum: jumlahSebelum, sesudah: tx.length }));

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
