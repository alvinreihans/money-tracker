// Periksa dulu sebelum tersimpan (docs/specs/SPEC-periksa-dulu.md), data BUATAN, hasil AI ditiru
// (fetch di halaman menambah field `hasil`, tanpa kuota AI):
// - ketikan → kartu "Periksa dulu" (Simpan terfokus) → Enter → tersimpan; saldo berubah sesudahnya, bukan sebelumnya;
// - gambar → Ubah → disimpan dari form;
// - Buang → Urungkan;
// - lembar ditutup → "Tinggal dicek" di Belum selesai → buka → Simpan;
// - unggah 3 gambar (1 dugaan dobel) → Simpan semua (2) → "2 tersimpan · 1 perlu dicek" → Urungkan;
// - impor rekening koran → Lihat rincian → hapus centang 1 baris → saldo pratinjau berubah → Impor → baris itu tidak ada;
// - detail transaksi → "Cara dicatat" berisi tanya-jawab;
// - 360 px & 1024 px.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
import { seabankBulan } from "../scripts/contoh-rekening.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const { PDFDocument, StandardFonts } = req("pdf-lib");
const sharp = req("sharp");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-periksa-dulu-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const ukur = async (w, h = 860) => { await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await tidur(700); };
const kemarin = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const tanpaGeser = () => jalankan("document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('dialog[open]')].every((d) => d.scrollWidth <= d.clientWidth + 1)");

/** Hasil baca AI rekaan (bentuk yang dikembalikan server). */
const hasil = (x) => ({
  amount: 25_000, type: "expense", category: "food", merchant: "Kopi Contoh", description: null, transaction_date: kemarin, time: "08:15", time_hint: null,
  payment_method: "GoPay", payment_target: null, fee: null, cashback: null, pinjaman: null, cicilan: null, paylater: null, document_type: "receipt",
  bukti_transfer: null, kelompok: null, rincian: null, usulan_pecah: null, sumber_dana: null, dompet: null, voucher: null, ref_bukti: null, rekening_tujuan: null, ...x,
});
const gambar = async (r) => (await sharp({ create: { width: 24, height: 24, channels: 3, background: { r, g: 120, b: 70 } } }).png().toBuffer()).toString("base64");
const fileJs = (nama, b64, jenis = "image/png") => `new File([Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0))], '${nama}', { type: '${jenis}' })`;

// Tiruan AI: ketikan (/api/catat-teks, JSON) dan gambar (/api/upload-receipt, FormData) membawa `hasil`.
const TIRU = `window.__hasilTeks ??= null; window.__hasilGambar ??= {};
  if (!window.__fetchAsli) { window.__fetchAsli = window.fetch;
    window.fetch = (u, o) => {
      if (String(u).includes('/api/catat-teks') && window.__hasilTeks && typeof o?.body === 'string') o = { ...o, body: JSON.stringify({ ...JSON.parse(o.body), hasil: window.__hasilTeks }) };
      if (String(u).includes('/api/upload-receipt') && o?.body instanceof FormData && !o.body.has('hasil')) { const h = window.__hasilGambar[o.body.get('file')?.name]; if (h) o.body.append('hasil', JSON.stringify(h)); }
      return window.__fetchAsli(u, o);
    }; }`;
const bukaCatat = `if (!dialog()) { document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea')); await t(300); }`;
const ketik = (teks, h) => `${TIRU} window.__hasilTeks = ${JSON.stringify(h)}; ${bukaCatat}
  isi(dialog().querySelector('textarea'), ${JSON.stringify(teks)}); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();`;
const tungguSimpan = `await sampai(() => tombol('Simpan', dialog()) && !tombol('Simpan', dialog()).disabled, 60);`;
const kartuPeriksa = `[...dialog().querySelectorAll('[aria-label="Periksa dulu sebelum disimpan"]')].at(-1)`;

async function buatPdf(halaman) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const h of halaman) {
    const p = doc.addPage([842, 842]);
    for (const it of h.items) p.drawText(it.s, { x: it.x, y: it.y, size: 6, font });
  }
  return Buffer.from(await doc.save());
}

try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: gopay, error: eG } = await sb.from("user_accounts").insert({ user_id: uid, name: "GoPay", kind: "ewallet", emoji: "📱", saldo_awal: 500_000, saldo_per: "2026-01-01", saldo_sejak: "2026-01-01T00:00:00+07:00" }).select("id").single();
  if (eG) throw eG;
  await sb.from("user_accounts").insert({ user_id: uid, name: "SeaBank", kind: "bank", emoji: "🏦", nomor_akhir: "1234", saldo_awal: 1_000_000, saldo_per: "2026-09-01", saldo_sejak: "2026-09-01T00:00:00+07:00" });
  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  await cdp("Network.enable");
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  const saldoGopay = async () => Number(((await sb.rpc("saldo_kantong")).data ?? []).find((k) => k.id === gopay.id)?.saldo);
  const tx = async (amount) => (await sb.from("transactions").select("*").eq("amount", amount).is("induk_id", null)).data ?? [];

  // --- 1. Ketikan → kartu periksa (lembar ringkas, Simpan terfokus) → Enter → tersimpan (360 px).
  await ukur(360);
  await buka(`${base}/`, 6000);
  const awalSaldo = await saldoGopay();
  const kartu1 = await langkah("ketik kopi", `${ketik("kopi 25rb gopay", hasil({}))} ${tungguSimpan} await t(300);
    const k = ${kartuPeriksa};
    const tinggi = [...k.querySelectorAll('button')].map((b) => b.textContent.trim() + ':' + Math.round(b.getBoundingClientRect().height));
    const simpan = tombol('Simpan', k).getBoundingClientRect().width / k.getBoundingClientRect().width;
    return { teks: k.innerText.replace(/\\s+/g, ' '), fokus: document.activeElement?.textContent.trim(), besar: /dialogBesar/.test(dialog().className), tinggi, simpan }`);
  const [draft1] = await tx(25_000);
  cek("Ketikan lengkap → kartu \"Periksa dulu\" berisi jenis, nominal, kategori, kantong, tanggal & jam (lembar tetap ringkas)",
    /Periksa dulu · belum tersimpan/.test(kartu1.teks) && /Kopi Contoh/.test(kartu1.teks) && /Rp\s?25\.000/.test(kartu1.teks) && /Keluar/.test(kartu1.teks) && /Makan/.test(kartu1.teks) && /GoPay/.test(kartu1.teks) && /08\.15/.test(kartu1.teks) && !kartu1.besar,
    JSON.stringify(kartu1));
  cek("Sebelum Simpan: draft (needs_review), saldo GoPay belum berubah", draft1?.status === "needs_review" && (await saldoGopay()) === awalSaldo, JSON.stringify({ status: draft1?.status, awalSaldo }));
  cek("Simpan terfokus (Enter = Simpan, K2); Simpan selebar kartu; tombol ≥ 44 px", kartu1.fokus === "Simpan" && kartu1.simpan > 0.85 && kartu1.tinggi.every((x) => Number(x.split(":")[1]) >= 44), JSON.stringify(kartu1));
  cek("360: kartu periksa tanpa gulir mendatar", await tanpaGeser());
  await foto("periksa-1-kartu-360.png");
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  const tersimpan1 = await langkah("sesudah Enter", `await sampai(() => /Tersimpan/.test(dialog()?.innerText ?? ''), 30); return dialog()?.innerText.replace(/\\s+/g, ' ')`);
  const [simpan1] = await tx(25_000);
  cek("Enter → \"✓ Tersimpan\"; transaksi confirmed, teks asli tidak lagi di kolom transaksi; saldo GoPay berkurang Rp 25.000",
    /Tersimpan/.test(tersimpan1) && simpan1?.status === "confirmed" && simpan1.raw_ocr_text === null && (await saldoGopay()) === awalSaldo - 25_000, JSON.stringify({ tersimpan1, status: simpan1?.status }));
  await langkah("tutup", `dialog()?.dispatchEvent(new Event('cancel', { cancelable: true })); await t(500); return 'ok'`);

  // --- 2. Ada yang ditanyakan → dijawab → kartu periksa → Simpan; "Cara dicatat" di detail berisi tanya-jawab.
  await buka(`${base}/`, 5000);
  await langkah("ketik roti tanpa kantong", `${ketik("roti 15rb", hasil({ amount: 15_000, merchant: "Roti Contoh", payment_method: null, time: "07:30" }))}
    await sampai(() => /Pakai kantong apa\\?/.test(dialog()?.innerText ?? ''), 60);
    [...dialog().querySelectorAll('[class*=pilihanJawab] button')].find((b) => /GoPay/.test(b.textContent)).click();
    ${tungguSimpan} tombol('Simpan', dialog()).click();
    await sampai(() => /Makasih udah dilengkapi/.test(dialog()?.innerText ?? ''), 30); return 'ok'`);
  const [roti] = await tx(15_000);
  cek("Sesudah dijawab: kartu periksa → Simpan → tersimpan dari GoPay", roti?.status === "confirmed" && roti.kantong_id === gopay.id, JSON.stringify(roti));
  await buka(`${base}/transactions/${roti.id}`, 6000);
  const cara = await langkah("Cara dicatat", `await sampai(() => [...document.querySelectorAll('summary')].some((s) => s.textContent.includes('Cara dicatat')), 20);
    const d = [...document.querySelectorAll('details')].find((x) => x.querySelector('summary')?.textContent.includes('Cara dicatat'));
    const tertutup = !d.open; d.querySelector('summary').click(); await t(400);
    const masukLewat = [...document.querySelectorAll('dt')].find((x) => x.textContent === 'Masuk lewat');
    const urut = masukLewat ? !!(masukLewat.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    return { tertutup, urut, teks: d.innerText.replace(/\\s+/g, ' ') }`);
  cek("Detail: \"Cara dicatat\" terlipat di bawah \"Masuk lewat\", berisi ketikan, hasil baca, tanya-jawab berurutan, waktu Simpan",
    cara.tertutup && cara.urut && /Diketik di Catat/.test(cara.teks) && /roti 15rb/.test(cara.teks) && /Kebaca: Roti Contoh/.test(cara.teks) && /Pakai kantong apa\?.*GoPay.*Disimpan dari kartu periksa/.test(cara.teks),
    JSON.stringify(cara));
  cek("360: detail tanpa gulir mendatar", await tanpaGeser());
  await foto("periksa-2-cara-dicatat-360.png");

  // --- 3. Gambar → kartu dengan thumbnail → Ubah → disimpan dari form.
  await buka(`${base}/`, 5000);
  const g1 = await gambar(10);
  const ubah = await langkah("gambar → Ubah", `${TIRU} window.__hasilGambar['buku.png'] = ${JSON.stringify(hasil({ amount: 60_000, merchant: "Toko Buku Contoh", category: "shopping", document_type: "payment_proof", time: "13:00" }))};
    ${bukaCatat}
    const dt = new DataTransfer(); dt.items.add(${fileJs("buku.png", g1)});
    dialog().querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await t(400); dialog().querySelector('button[aria-label="Kirim"]').click();
    ${tungguSimpan}
    const thumb = !!${kartuPeriksa}.querySelector('img[alt="Gambar yang dibaca"]');
    tombol('Ubah', ${kartuPeriksa}).click();
    await sampai(() => dialog()?.querySelector('input[placeholder="Merchant / toko"]'), 20); await t(300);
    const awal = dialog().querySelector('input[placeholder="Merchant / toko"]').value;
    isi(dialog().querySelector('input[placeholder="Merchant / toko"]'), 'Toko Buku Contoh Baru'); await t(200);
    [...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Simpan').click();
    await sampai(() => [...document.querySelectorAll('dialog[open]')].some((d) => /Tersimpan/.test(d.innerText)), 30); await t(500);
    return { thumb, awal }`);
  const [buku] = await tx(60_000);
  const { data: jejakBuku } = await sb.rpc("jejak_catat", { p_id: buku?.id });
  cek("Gambar: kartu periksa dengan thumbnail; Ubah membuka form berisi hasil baca; menyimpan form = Simpan (tersimpan, merchant diubah)",
    ubah.thumb && ubah.awal === "Toko Buku Contoh" && buku?.status === "confirmed" && buku.merchant === "Toko Buku Contoh Baru", JSON.stringify({ ubah, buku: buku && [buku.status, buku.merchant] }));
  cek("Jejak gambar: thumbnail draft pindah ke \"Cara dicatat\" (K1), cara = form", jejakBuku?.length === 1 && jejakBuku[0].ada_foto === true && jejakBuku[0].isi.cara === "form" && jejakBuku[0].isi.asal === "bukti", JSON.stringify(jejakBuku));
  await langkah("tutup", `while (dialog()) { dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(500); } return 'ok'`);

  // --- 4. Buang → Urungkan; lalu lembar ditutup → "Tinggal dicek" di Belum selesai → buka → Simpan.
  await buka(`${base}/`, 5000);
  const buang = await langkah("ketik parkir → Buang", `${ketik("parkir 5rb gopay", hasil({ amount: 5_000, merchant: "Parkir Contoh", category: "transport", time: "09:00" }))} ${tungguSimpan}
    tombol('Buang', ${kartuPeriksa}).click();
    await sampai(() => /Catatannya dibuang/.test(dialog()?.innerText ?? ''), 20); return dialog().innerText.replace(/\\s+/g, ' ')`);
  cek("Buang: draft dihapus, \"Catatannya dibuang.\" dengan Urungkan", /Catatannya dibuang/.test(buang) && /Urungkan/.test(buang) && (await tx(5_000)).length === 0, buang);
  await langkah("Urungkan", `tombol('↩ Urungkan', dialog()).click(); ${tungguSimpan} return 'ok'`);
  const parkir = await tx(5_000);
  cek("Urungkan: draft kembali (Tinggal dicek), kartu periksa muncul lagi", parkir.length === 1 && parkir[0].status === "needs_review", JSON.stringify(parkir));
  const daftar = await langkah("tutup lembar → Belum selesai", `dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(600);
    ${bukaCatat}
    await sampai(() => tombol('1 belum selesai', dialog()), 20); tombol('1 belum selesai', dialog()).click();
    await sampai(() => /Parkir Contoh/.test(dialog()?.innerText ?? ''), 30); await t(300);
    return dialog().innerText.replace(/\\s+/g, ' ')`);
  cek("Lembar ditutup → di Belum selesai berlabel \"Tinggal dicek\"", /Parkir Contoh.*Tinggal dicek/.test(daftar), daftar.slice(0, 300));
  await langkah("buka & Simpan", `[...dialog().querySelectorAll('button')].find((b) => /Parkir Contoh/.test(b.innerText)).click(); ${tungguSimpan}
    tombol('Simpan', dialog()).click(); await sampai(() => /Tersimpan/.test(dialog()?.innerText ?? ''), 30); return 'ok'`);
  cek("Dibuka dari Belum selesai → Simpan → tersimpan", (await tx(5_000))[0]?.status === "confirmed");
  await langkah("tutup", `while (dialog()) { dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(500); } return 'ok'`);

  // --- 5. Unggah 3 gambar (1 dugaan dobel) → Simpan semua (2) → "2 tersimpan · 1 perlu dicek" → Urungkan.
  await sb.from("transactions").insert([
    { user_id: uid, type: "expense", category: "food", amount: 33_000, merchant: "Makan A", transaction_date: kemarin, kantong_id: gopay.id, payment_method: "GoPay", status: "confirmed", source: "text" },
    { user_id: uid, type: "expense", category: "food", amount: 33_000, merchant: "Makan B", transaction_date: kemarin, kantong_id: gopay.id, payment_method: "GoPay", status: "confirmed", source: "text" },
  ]);
  await buka(`${base}/`, 5000);
  const [b1, b2, b3] = [await gambar(30), await gambar(60), await gambar(90)];
  const ringkasan = await langkah("seret 3 gambar", `${TIRU}
    Object.assign(window.__hasilGambar, {
      'satu.png': ${JSON.stringify(hasil({ amount: 41_000, merchant: "Toko Satu", category: "shopping", document_type: "payment_proof", time: "10:00", ref_bukti: "SNPERIKSA0001" }))},
      'dua.png': ${JSON.stringify(hasil({ amount: 42_000, merchant: "Toko Dua", category: "shopping", document_type: "payment_proof", time: "11:00", ref_bukti: "SNPERIKSA0002" }))},
      'dobel.png': ${JSON.stringify(hasil({ amount: 33_000, merchant: "Makan Siang", category: "food", document_type: "payment_proof", time: "12:00", ref_bukti: "SNPERIKSA0003" }))},
    });
    const dt = new DataTransfer(); dt.items.add(${fileJs("satu.png", b1)}); dt.items.add(${fileJs("dua.png", b2)}); dt.items.add(${fileJs("dobel.png", b3)});
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sampai(() => /3 struk:/.test(document.body.innerText), 120);
    return [...document.querySelectorAll('[class*=snackbar]')].map((x) => x.innerText.replace(/\\s+/g, ' ')).join('|')`);
  cek("Snackbar ringkasan: \"3 struk: 3 perlu dicek\" dengan Lihat", /3 struk: 3 perlu dicek/.test(ringkasan) && /Lihat/.test(ringkasan), ringkasan);
  const semua = await langkah("Lihat → Simpan semua", `[...document.querySelectorAll('[class*=snackbar] button')].find((b) => b.textContent.trim() === 'Lihat').click();
    await sampai(() => tombol('Simpan semua', dialog()), 30); await t(500);
    const sebelum = dialog().innerText.replace(/\\s+/g, ' ');
    const kartu = dialog().querySelectorAll('[aria-label="Periksa dulu sebelum disimpan"]').length;
    tombol('Simpan semua', dialog()).click();
    await sampai(() => /tersimpan ·/.test(dialog()?.innerText ?? ''), 30); await t(500);
    return { sebelum, kartu, sesudah: dialog().innerText.replace(/\\s+/g, ' ') }`);
  const [s1, s2, s3] = [(await tx(41_000))[0], (await tx(42_000))[0], (await tx(33_000)).find((t) => t.status === "needs_review")];
  cek("Hasil unggah: Simpan semua (2) — 2 kartu periksa; dugaan dobel tetap terpisah (\"Mungkin sudah tercatat\")",
    /Simpan semua \(2\)/.test(semua.sebelum) && semua.kartu === 2 && /Mungkin sudah tercatat/.test(semua.sebelum), semua.sebelum.slice(0, 400));
  cek("Sesudah Simpan semua: \"2 tersimpan · 1 perlu dicek\"; dua tersimpan, dugaan dobel tetap draft",
    /2 tersimpan · 1 perlu dicek/.test(semua.sesudah) && s1?.status === "confirmed" && s2?.status === "confirmed" && s3?.duplikat_dari, JSON.stringify({ s1: s1?.status, s2: s2?.status, s3: s3 && [s3.status, s3.duplikat_dari] }));
  const { data: jejak1 } = await sb.rpc("jejak_catat", { p_id: s1?.id });
  cek("Jejak unggah banyak: asal banyak, cara Simpan semua, thumbnail ikut", jejak1?.[0]?.isi?.asal === "banyak" && jejak1[0].isi.cara === "semua" && jejak1[0].ada_foto === true, JSON.stringify(jejak1));
  cek("360: hasil unggah tanpa gulir mendatar", await tanpaGeser());
  await foto("periksa-3-simpan-semua-360.png");
  await langkah("Urungkan Simpan semua", `[...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Urungkan').click();
    await sampai(() => /diurungkan/.test(dialog()?.innerText ?? ''), 30); return 'ok'`);
  const [u1, u2] = [(await tx(41_000))[0], (await tx(42_000))[0]];
  const { data: jejakU } = await sb.rpc("jejak_catat", { p_id: u1?.id });
  const { data: fotoU } = await sb.rpc("foto_draft", { p_id: u1?.id });
  cek("Urungkan: kembali jadi \"Tinggal dicek\" (draft), jejak & thumbnail kembali ke draft", u1?.status === "needs_review" && u2?.status === "needs_review" && !(jejakU ?? []).length && Boolean(fotoU), JSON.stringify({ u1: u1?.status, u2: u2?.status, jejakU }));
  await langkah("tutup", `while (dialog()) { dialog().dispatchEvent(new Event('cancel', { cancelable: true })); await t(500); } return 'ok'`);

  // --- 6. Rekening koran: Lihat rincian → hapus centang 1 baris → saldo pratinjau berubah → Impor → baris itu tidak ada.
  const bayar = (tgl, n, nama) => ({ tgl, atas: [nama], n: -n, bawah: ["Payment"] });
  const PDF = await buatPdf(seabankBulan({ dari: "01 SEP 2026", sampai: "30 SEP 2026", awal: 1_000_000, baris: [bayar("03 SEP", 32_500, "ShopeePay"), bayar("05 SEP", 18_000, "Toko Lain"), bayar("07 SEP", 12_000, "ShopeePay")] }));
  const lembar = `[...document.querySelectorAll('dialog[open]')].find((d) => /Impor rekening koran/.test(d.innerText))`;
  const rincian = `[...document.querySelectorAll('dialog[open]')].find((d) => /Rincian SeaBank/.test(d.innerText))`;
  await buka(`${base}/`, 5000);
  const praImpor = await langkah("seret PDF → pratinjau", `const dt = new DataTransfer(); dt.items.add(${fileJs("seabank-sep.pdf", PDF.toString("base64"), "application/pdf")});
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sampai(() => /Lihat rincian/.test(${lembar}?.innerText ?? ''), 60);
    return ${lembar}.innerText.replace(/\\s+/g, ' ')`);
  cek("Pratinjau: \"Lihat rincian (3 baris)\", saldo sama dengan aplikasi", /Lihat rincian \(3 baris\)/.test(praImpor) && /sama dengan aplikasi/.test(praImpor), praImpor.slice(0, 500));
  const centang = await langkah("rincian → hapus centang Toko Lain", `tombol('Lihat rincian', ${lembar}).click();
    await sampai(() => ${rincian}, 20); await t(300);
    const d = ${rincian};
    const awal = d.innerText.replace(/\\s+/g, ' ');
    const lipat = [...d.querySelectorAll('details')].find((x) => /5 Sep/.test(x.innerText)); lipat.open = true; await t(200);
    const baris = [...lipat.querySelectorAll('[role=checkbox]')].find((b) => /Toko Lain/.test(b.innerText));
    const tadi = baris.getAttribute('aria-checked');
    baris.click();
    await sampai(() => /Saldo akhir tidak sama/.test(${rincian}?.innerText ?? '') && !${rincian}.querySelector('[aria-busy=true]'), 60); await t(300);
    const sesudah = ${rincian}.innerText.replace(/\\s+/g, ' ');
    const kini = [...${rincian}.querySelectorAll('[role=checkbox]')].find((b) => /Toko Lain/.test(b.innerText))?.getAttribute('aria-checked');
    return { awal, tadi, kini, sesudah }`);
  cek("Rincian: baris tercentang bawaan, dilipat per tanggal; hapus centang → saldo menurut aplikasi dihitung ulang (Rp 955.500), peringatan saldo",
    /Saldo akhir menurut aplikasi Rp\s?937\.500 · sama dengan bank/.test(centang.awal) && centang.tadi === "true" && centang.kini === "false" && /menurut aplikasi sesudah impor Rp\s?955\.500/.test(centang.sesudah) && /1 tidak diimpor/.test(centang.sesudah),
    JSON.stringify(centang).slice(0, 700));
  cek("360: rincian tanpa gulir mendatar", await tanpaGeser());
  await foto("periksa-4-rincian-360.png");
  const impor = await langkah("Selesai → Impor", `[...${rincian}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Selesai').click(); await t(500);
    const pra = ${lembar}.innerText.replace(/\\s+/g, ' ');
    tombol('Impor', ${lembar}).click();
    await sampai(() => /Rekening koran diimpor/.test(document.body.innerText), 60); await t(500);
    return { pra, kabar: (document.body.innerText.match(/Rekening koran diimpor[^\\n]*/) || [''])[0] }`);
  const dariRek = (await sb.from("transactions").select("amount, merchant, ref_bank").eq("source", "statement")).data ?? [];
  cek("Impor: baris yang tidak dicentang tidak diimpor (2 transaksi baru, tanpa Toko Lain)",
    /1 tidak dicentang/.test(impor.pra) && /2 transaksi baru/.test(impor.kabar) && dariRek.length === 2 && !dariRek.some((t) => Number(t.amount) === 18_000), JSON.stringify({ impor, dariRek }));
  // Detail transaksi rekening koran: "Cara dicatat" dari bank & uraian barisnya (tanpa PDF).
  const { data: rek1 } = await sb.from("transactions").select("id").eq("source", "statement").eq("amount", 32_500).single();
  await buka(`${base}/transactions/${rek1.id}`, 6000);
  const caraRek = await langkah("Cara dicatat rekening koran", `await sampai(() => [...document.querySelectorAll('summary')].some((s) => s.textContent.includes('Cara dicatat')), 20);
    const d = [...document.querySelectorAll('details')].find((x) => x.querySelector('summary')?.textContent.includes('Cara dicatat')); d.open = true; await t(300);
    return d.innerText.replace(/\\s+/g, ' ')`);
  cek("Cara dicatat (rekening koran): bank & baris bank asalnya", /Diimpor dari rekening koran SeaBank/.test(caraRek) && /Baris bank:/.test(caraRek), caraRek);

  // --- 7. 1024 px: kartu periksa & Simpan.
  await ukur(1024);
  await buka(`${base}/`, 5000);
  const lebar = await langkah("1024: ketik", `${ketik("teh 8rb gopay", hasil({ amount: 8_000, merchant: "Teh Contoh", time: "15:00" }))} ${tungguSimpan} await t(300);
    const k = ${kartuPeriksa}; const r = k.getBoundingClientRect();
    return { fokus: document.activeElement?.textContent.trim(), lebar: Math.round(r.width), tinggi: [...k.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().height)) }`);
  cek("1024: kartu periksa, Simpan terfokus, tombol ≥ 44 px", lebar.fokus === "Simpan" && lebar.tinggi.every((h) => h >= 44), JSON.stringify(lebar));
  cek("1024: tanpa gulir mendatar", await tanpaGeser());
  await foto("periksa-5-kartu-1024.png");
  await langkah("1024: Simpan", `tombol('Simpan', ${kartuPeriksa}).click(); await sampai(() => /Tersimpan/.test(dialog()?.innerText ?? ''), 30); return 'ok'`);
  cek("1024: tersimpan", (await tx(8_000))[0]?.status === "confirmed");

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
