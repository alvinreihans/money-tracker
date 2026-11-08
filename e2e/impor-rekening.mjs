// Impor rekening koran (docs/specs/SPEC-impor-rekening.md): PDF BUATAN per bank
// (bukan data user, digambar dengan pdf-lib dari scripts/contoh-rekening.mjs)
// → seret-lepas → "kantong yang mana?" → pratinjau → Impor → saldo kantong;
// impor ulang lewat lampiran Catat tidak menggandakan; bank lain & saldo yang
// tidak cocok ditolak; Riwayat "Perlu dilengkapi".
import { createRequire } from "node:module";
import path from "node:path";
import { base, buka, cdp, edge, foto, fs, langkah, masalah, out, tidur } from "./kepala.mjs";
import { bri, briNov, briOkt, Halaman, jagoBulanan, jagoDepositoOkt, jagoGopay, jagoKeSea, seabank, seabankBulan, seaDariJago } from "../scripts/contoh-rekening.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const { PDFDocument, StandardFonts } = req("pdf-lib");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-rekening-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");

/** Halaman contoh → PDF teks (satu potongan teks per posisi, seperti PDF bank). */
async function buatPdf(halaman) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const h of halaman) {
    const p = doc.addPage([842, 842]); // lebar: kolom saldo BRI ada di x ≈ 600
    for (const it of h.items) p.drawText(it.s, { x: it.x, y: it.y, size: 6, font });
  }
  return Buffer.from(await doc.save());
}
const PDF = {
  sea: await buatPdf(seabank()),
  jago: await buatPdf(jagoBulanan()),
  bri: await buatPdf(bri()),
  seaSalah: await buatPdf(seabank("911.041")),
  jagoOkt: await buatPdf(jagoDepositoOkt()),
  // Temuan UAT (SPEC-impor-rekening R1, R2).
  seaOkt: await buatPdf(seabankBulan({ dari: "01 OCT 2026", sampai: "31 OCT 2026", awal: 911_040, baris: [{ tgl: "15 OCT", atas: ["Savings Interest"], n: 120, bawah: ["Interest"] }] })),
  jagoAgu: await buatPdf(jagoKeSea()),
  sea5555: await buatPdf(seaDariJago()),
  // SPEC-kantong-sendiri: top up DANA tanpa kantong, bulan kedua, Jago Pay ke GoPay.
  briOkt: await buatPdf(briOkt()),
  briNov: await buatPdf(briNov()),
  jagoGopay: await buatPdf(jagoGopay()),
  lain: await buatPdf([new Halaman().baris(700, [40, "REKENING KORAN"]).baris(680, [40, "Bank Contoh Lain"]).baris(660, [40, "01/09/2026 Setoran 100.000"])]),
};
for (const [k, v] of Object.entries(PDF)) fs.writeFileSync(path.join(out, `${k}.pdf`), v);

/** Seret-lepas PDF ke aplikasi (pola e2e/lebar.mjs). */
const seret = (nama) => `{
  const dt = new DataTransfer();
  for (const [n, b64] of ${JSON.stringify(nama.map((n) => [`${n}.pdf`, PDF[n].toString("base64")]))}) {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bin], n, { type: 'application/pdf' }));
  }
  window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}`;
const lembar = `[...document.querySelectorAll('dialog[open]')].find((d) => /Impor rekening koran/.test(d.innerText))`;

try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  // Kantong yang sudah ada: BRI (4 digit akhir sudah diingat, saldo awal asal-asalan),
  // Jago (belum diingat: satu-satunya kantong Jago tanpa nomor → dipetakan otomatis, E-3),
  // BCA & ShopeePay (lawan pindah kantong).
  const sekarang = new Date().toISOString();
  const kantong = [
    { name: "BRI", kind: "bank", emoji: "🏦", nomor_akhir: "4321", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" },
    { name: "Jago", kind: "bank", emoji: "🏦", saldo_awal: 176008, saldo_sejak: sekarang },
    { name: "BCA", kind: "bank", emoji: "🏦", nomor_akhir: "9876", saldo_awal: 0, saldo_sejak: sekarang },
    { name: "ShopeePay", kind: "ewallet", emoji: "📱", saldo_awal: 0, saldo_sejak: sekarang },
  ];
  const { error: eK } = await sb.from("user_accounts").insert(kantong.map((k) => ({ ...k, user_id: uid })));
  if (eK) throw eK;

  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  await buka(`${base}/`, 6000);

  // 1. Tiga PDF sekaligus → rekening yang belum dikenal ditanya sekali.
  const tanya = await langkah("seret 3 PDF", `${seret(["sea", "jago", "bri"])}
    await sampai(() => /kantong yang mana/.test(${lembar}?.innerText ?? ''), 60);
    const d = ${lembar};
    return { teks: d.innerText.replace(/\\s+/g, ' ').slice(0, 300), grup: [...d.querySelectorAll('[role=radiogroup]')].map((g) => g.getAttribute('aria-label')) }`);
  cek("Rekening SeaBank ditanya kantongnya; BRI langsung (4 digit akhir), Jago otomatis ke kantong Jago tanpa nomor (E-3)", JSON.stringify(tanya.grup) === JSON.stringify(["Kantong untuk SeaBank …1234"]), JSON.stringify(tanya));
  cek("Pilihan Buat kantong SeaBank", /Buat kantong SeaBank/.test(tanya.teks), tanya.teks);

  const pratinjau = await langkah("jawab & pratinjau", `const d = ${lembar};
    const pilih = (grup, teks) => [...d.querySelector('[aria-label="' + grup + '"]').querySelectorAll('[role=radio]')].find((b) => b.innerText.includes(teks)).click();
    pilih('Kantong untuk SeaBank …1234', 'Buat kantong SeaBank'); await t(100);
    tombol('Lanjut', d).click();
    await sampai(() => /transaksi baru/.test(${lembar}.innerText), 60);
    return ${lembar}.innerText.replace(/\\s+/g, ' ')`);
  for (const [nama, pola] of [
    ["kartu per rekening dengan periode & jumlah baris", /SeaBank …1234 1–30 Sep 2026 · 11 baris/],
    ["SeaBank ke kantong baru", /Ke kantong baru SeaBank/],
    ["kantong Jago lain jadi simpanan baru (K1)", /Jago · Dana Darurat .*Ke simpanan baru Dana Darurat/],
    ["kantong Jago kosong tidak tampil", /^(?!.*Kantong Kosong)/],
    ["bunga digabung", /Bunga: 1 transaksi per bulan \(4 baris digabung\)/],
    ["perlu dilengkapi dihitung", /perlu dilengkapi/],
    ["pindah kantong dihitung", /pindah kantong/],
    ["tawaran deposito SeaBank", /Buat deposito Contoh 6 bulan, 6%, Rp 2 jt\?/],
    ["tawaran samakan saldo BRI (K4)", /Samakan saldo awal BRI supaya akhir September( 2026)? = Rp 730\.500/],
    ["saldo Jago sama dengan aplikasi", /Saldo akhir menurut bank Rp 176\.008 · sama dengan aplikasi/],
  ])
    cek(`Pratinjau: ${nama}`, pola.test(pratinjau), pola.test(pratinjau) ? "" : pratinjau.slice(0, 600));
  await foto("pratinjau.png");
  // SPEC-perbaikan-uiux #4, #16, #17: saldo tidak sama = peringatan (ikon + warna) dengan tawaran samakan tepat di bawahnya; minus "−Rp"; judul bagian h3.
  const peringatan = await langkah("saldo tidak sama", `const d = ${lembar};
    const kartu = [...d.querySelectorAll('section')].find((x) => /BRI …4321/.test(x.innerText));
    const p = [...kartu.querySelectorAll('[role=status]')].find((x) => /Saldo akhir tidak sama/.test(x.innerText));
    const cb = [...kartu.querySelectorAll('[role=checkbox]')].find((b) => b.innerText.includes('Samakan saldo awal BRI'));
    return { teks: p?.innerText.replace(/\\s+/g, ' '), ikon: ((s) => s?.getAttribute('stroke') || s?.getAttribute('color'))(p?.querySelector('svg')), sesudahnya: Boolean(p && cb && p.compareDocumentPosition(cb) & Node.DOCUMENT_POSITION_FOLLOWING),
      sama: [...d.querySelectorAll('[role=status]')].filter((x) => /Saldo akhir tidak sama/.test(x.innerText)).length,
      h3: [...d.querySelectorAll('h3')].map((h) => h.textContent.trim()).slice(0, 4) }`);
  cek(
    "Pratinjau: saldo BRI tidak sama → peringatan \"−Rp 269.500\" + Samakan tepat di bawahnya; yang sama tetap teks biasa; judul rekening h3",
    /Menurut bank Rp 730\.500, menurut aplikasi sesudah impor −Rp 269\.500/.test(peringatan.teks ?? "") && peringatan.ikon === "var(--peringatan)" && peringatan.sesudahnya && peringatan.sama === 1 && peringatan.h3.includes("BRI …4321"),
    JSON.stringify(peringatan),
  );

  const impor = await langkah("terima tawaran & impor", `const d = ${lembar};
    const centang = (teks) => [...d.querySelectorAll('[role=checkbox]')].find((b) => b.innerText.includes(teks));
    centang('Samakan saldo awal BRI').click();
    await sampai(() => centang('Samakan saldo awal BRI').getAttribute('aria-checked') === 'true' && ${lembar}.querySelector('[aria-busy=false]'), 40);
    await t(300);
    centang('Buat deposito Contoh').click();
    await sampai(() => centang('Buat deposito Contoh').getAttribute('aria-checked') === 'true' && ${lembar}.querySelector('[aria-busy=false]'), 40);
    await t(300);
    const briSama = /Saldo akhir menurut bank Rp 730\\.500 · sama dengan aplikasi/.test(${lembar}.innerText.replace(/\\s+/g, ' '));
    tombol('Impor', ${lembar}).click();
    await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60);
    return { briSama, kabar: (teksHalaman().match(/Rekening koran diimpor[^.]*\\./) ?? [''])[0], tertutup: !${lembar} }`);
  cek("Samakan saldo BRI → pratinjau langsung sama", impor.briSama, JSON.stringify(impor));
  cek("Impor: dikabari jumlah transaksi baru, lembar tertutup", /Rekening koran diimpor: \d+ transaksi baru/.test(impor.kabar) && impor.tertutup, JSON.stringify(impor));

  // 2. Isi database (lewat API sebagai user sendiri).
  const db = await langkah("cek data", `
    const akun = await rest('user_accounts?select=id,name,kind,nomor_akhir,induk_id,macam_simpanan,saldo_awal,saldo_per');
    const tx = await rest('transactions?select=id,type,source,ref_bank,ref_bank_tujuan,perlu_dilengkapi,category,kantong_id,kantong_tujuan_id,induk_id&source=eq.statement');
    const saldo = await rest('rpc/saldo_kantong', { method: 'POST', body: '{}' });
    const nama = (id) => akun.find((k) => k.id === id)?.name;
    return {
      akun: akun.map((k) => [k.name, k.kind, k.nomor_akhir, nama(k.induk_id) ?? null, k.macam_simpanan, Number(k.saldo_awal), k.saldo_per]),
      jumlah: tx.length, tanpaRef: tx.filter((t) => !t.ref_bank && !t.ref_bank_tujuan).length, perlu: tx.filter((t) => t.perlu_dilengkapi).length,
      pindah: tx.filter((t) => t.type === 'transfer').map((t) => nama(t.kantong_id) + '>' + nama(t.kantong_tujuan_id) + ':' + Boolean(t.ref_bank) + Boolean(t.ref_bank_tujuan)).sort(),
      ikutan: tx.filter((t) => t.induk_id).length,
      saldo: Object.fromEntries(saldo.map((s) => [nama(s.id), Number(s.saldo)])),
    }`);
  const akun = Object.fromEntries((db.akun ?? []).map((a) => [a[0], a]));
  cek("Kantong SeaBank dibuat dengan 4 digit akhir, saldo awal periode", JSON.stringify(akun.SeaBank) === JSON.stringify(["SeaBank", "bank", "1234", null, null, 3000000, "2026-09-01"]), JSON.stringify(akun.SeaBank));
  cek("4 digit akhir Jago diingat", akun.Jago?.[2] === "5678", JSON.stringify(akun.Jago));
  cek("Simpanan Dana Darurat di dalam Jago (K1)", JSON.stringify(akun["Dana Darurat"]?.slice(1, 5)) === JSON.stringify(["simpanan", "3928", "Jago", "tabungan"]), JSON.stringify(akun["Dana Darurat"]));
  // Penempatannya ada di rekening koran: saldo 0 sejak tanggal penempatan, diisi pindah kantongnya (tidak dobel).
  cek("Deposito Contoh di dalam SeaBank, didanai baris penempatan", JSON.stringify(akun["Deposito Contoh"]?.slice(1)) === JSON.stringify(["simpanan", null, "SeaBank", "deposito", 0, "2026-09-06"]), JSON.stringify(akun["Deposito Contoh"]));
  cek("Saldo awal BRI disamakan (sebelum periode)", akun.BRI?.[5] === 1000000 && akun.BRI?.[6] === "2026-09-01", JSON.stringify(akun.BRI));
  cek("Semua baris bertanda pengenal bank", db.jumlah > 10 && db.tanpaRef === 0, JSON.stringify(db));
  cek("Ada yang perlu dilengkapi (K3) & biaya BI-Fast menempel", db.perlu > 0 && db.ikutan === 1, JSON.stringify(db));
  cek(
    "Pindah kantong: SeaBank→Jago dua sisi, ShopeePay→Jago, Jago→Dana Darurat dua sisi, BRI→BCA, BRI→ShopeePay, SeaBank→Deposito",
    JSON.stringify(db.pindah) === JSON.stringify(["BRI>BCA:truefalse", "BRI>ShopeePay:truefalse", "Jago>Dana Darurat:truetrue", "SeaBank>Deposito Contoh:truefalse", "SeaBank>Jago:truetrue", "ShopeePay>Jago:falsetrue"]),
    JSON.stringify(db.pindah),
  );
  cek(
    "Saldo kantong = saldo akhir rekening koran (§7)",
    db.saldo?.SeaBank === 911040 && db.saldo?.BRI === 730500 && db.saldo?.Jago === 176008 && db.saldo?.["Dana Darurat"] === 400800 && db.saldo?.["Deposito Contoh"] === 2000000,
    JSON.stringify(db.saldo),
  );

  // 3. Riwayat: filter & tanda "Perlu dilengkapi".
  await buka(`${base}/riwayat?lengkapi=1`, 6000);
  const riwayat = await langkah("riwayat perlu dilengkapi", `return { chip: !!tombol('Perlu dilengkapi'), tekan: tombol('Perlu dilengkapi')?.getAttribute('aria-pressed'), lencana: [...document.querySelectorAll('[class*=lencana]')].filter((x) => x.textContent.trim() === 'Perlu dilengkapi').length,
    chipTerlihat: (() => { const c = tombol('Perlu dilengkapi'); const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })(),
    lencana13: (() => { const l = [...document.querySelectorAll('[class*=lencana]')].find((x) => x.textContent.trim() === 'Perlu dilengkapi'); return getComputedStyle(l).fontSize + (l.querySelector('svg') ? '+ikon' : ''); })() }`);
  cek("Riwayat: chip Perlu dilengkapi aktif & tiap kartu bertanda", riwayat.chip && riwayat.tekan === "true" && riwayat.lencana === db.perlu, JSON.stringify(riwayat));
  cek("Riwayat 360 px: chip aktif terlihat tanpa digeser (#10), lencana 13px + ikon (#15)", riwayat.chipTerlihat === true && riwayat.lencana13 === "13px+ikon", JSON.stringify(riwayat));
  await foto("riwayat-lengkapi.png");

  // 4. Impor ulang SeaBank & Jago lewat lampiran Catat: tidak menggandakan.
  await buka(`${base}/`, 5000);
  await langkah("buka catat", `document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('input[type=file]')); return true`);
  const { root } = await cdp("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "dialog[open] input[type=file]" });
  await cdp("DOM.setFileInputFiles", { nodeId, files: [path.resolve(out, "sea.pdf"), path.resolve(out, "jago.pdf")] });
  const ulang = await langkah("impor ulang", `
    await sampai(() => /sudah tercatat/.test(${lembar}?.innerText ?? ''), 60);
    const teks = ${lembar}.innerText.replace(/\\s+/g, ' ');
    tombol('Impor', ${lembar}).click();
    await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60);
    const tx = await rest('transactions?select=id&source=eq.statement');
    return { teks: teks.slice(0, 500), baru: /transaksi baru/.test(teks), kabar: (teksHalaman().match(/Rekening koran diimpor[^.]*\\./) ?? [''])[0], jumlah: tx.length }`);
  cek("Impor ulang: tidak ada transaksi baru, semuanya sudah tercatat", !ulang.baru && /0 transaksi baru/.test(ulang.kabar) && ulang.jumlah === db.jumlah, JSON.stringify(ulang));

  // 5. Bank lain & saldo tidak cocok: ditolak dengan pesan, tidak ada yang tersimpan.
  const tolak = await langkah("bank lain & saldo salah", `${seret(["lain"])}
    await sampai(() => /belum bisa dibaca/.test(${lembar}?.innerText ?? ''), 60);
    const lain = ${lembar}.innerText.replace(/\\s+/g, ' ');
    tombol('Tutup', ${lembar}).click(); await sampai(() => !${lembar}, 10);
    ${seret(["seaSalah"])}
    await sampai(() => /tidak bisa dicocokkan/.test(${lembar}?.innerText ?? ''), 60);
    const salah = ${lembar}.innerText.replace(/\\s+/g, ' ');
    const impor = !!tombol('Impor', ${lembar});
    tombol('Tutup', ${lembar}).click();
    const tx = await rest('transactions?select=id&source=eq.statement');
    return { lain: lain.slice(0, 200), salah: salah.slice(0, 300), impor, jumlah: tx.length }`);
  cek("Bank lain: 'Rekening koran dari bank ini belum bisa dibaca.' (K5)", /Rekening koran dari bank ini belum bisa dibaca\./.test(tolak.lain), tolak.lain);
  cek("Saldo tidak cocok: ditolak tanpa tombol Impor, tidak ada yang tersimpan", /tidak bisa dicocokkan/.test(tolak.salah) && !tolak.impor && tolak.jumlah === db.jumlah, JSON.stringify(tolak));

  // 5b. Temuan UAT R1: SeaBank (kantongnya dibuat dari rekening koran September, saldo sejak
  //     1 Sep) lalu Oktober diimpor sendiri → saldo aplikasi di pratinjau = sesudah impor.
  const SALDO_REST = `const akun = await rest('user_accounts?select=id,name');
    const saldo = await rest('rpc/saldo_kantong', { method: 'POST', body: '{}' });
    const s = (n) => Number(saldo.find((x) => x.id === akun.find((k) => k.name === n)?.id)?.saldo);`;
  const r1 = await langkah("R1: SeaBank Oktober sendiri", `${seret(["seaOkt"])}
    await sampai(() => /SeaBank …1234 1–31 Okt 2026/.test(${lembar}?.innerText ?? '') && ${lembar}.querySelector('[aria-busy=false]'), 60); await t(300);
    const teks = ${lembar}.innerText.replace(/\\s+/g, ' ');
    tombol('Impor', ${lembar}).click(); await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60); await t(500);
    ${SALDO_REST}
    return { sama: /Saldo akhir menurut bank Rp 911\\.160 · sama dengan aplikasi/.test(teks), peringatan: /Saldo akhir tidak sama|Samakan saldo awal/.test(teks), sea: s('SeaBank') }`);
  cek("R1: SeaBank Oktober sendiri — pratinjau \"sama dengan aplikasi\", tanpa peringatan/Samakan; sesudah impor Rp 911.160", r1?.sama === true && r1?.peringatan === false && r1?.sea === 911160, JSON.stringify(r1));

  // 5c. Temuan UAT R2: Jago Agustus diimpor saat rekening SeaBank …5555 belum punya kantong
  //     (transfernya jadi pengeluaran/pemasukan biasa), lalu SeaBank …5555 diimpor →
  //     transaksi Jago itu diubah jadi pindah kantong, tanpa transaksi baru untuk pasangannya.
  const r2a = await langkah("R2: Jago Agustus", `${seret(["jagoAgu"])}
    await sampai(() => /Jago …5678 1–31 Agu 2026/.test(${lembar}?.innerText ?? '') && ${lembar}.querySelector('[aria-busy=false]'), 60); await t(300);
    const teks = ${lembar}.innerText.replace(/\\s+/g, ' ');
    tombol('Impor', ${lembar}).click(); await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60); await t(500);
    return { kabar: (teksHalaman().match(/Rekening koran diimpor[^.]*\\./) ?? [''])[0], peringatan: /Saldo akhir tidak sama/.test(teks) }`);
  cek("R2: Jago Agustus diimpor (3 transaksi baru, saldo akhir sama)", /3 transaksi baru/.test(r2a?.kabar ?? "") && r2a?.peringatan === false, JSON.stringify(r2a));
  const r2b = await langkah("R2: SeaBank …5555", `${seret(["sea5555"])}
    await sampai(() => /kantong yang mana/.test(${lembar}?.innerText ?? ''), 60);
    const d = ${lembar};
    [...d.querySelector('[aria-label="Kantong untuk SeaBank …5555"]').querySelectorAll('[role=radio]')].find((b) => b.innerText.includes('Buat kantong SeaBank')).click(); await t(100);
    tombol('Lanjut', d).click();
    await sampai(() => /SeaBank …5555 1–31 Agu 2026/.test(${lembar}.innerText) && ${lembar}.querySelector('[aria-busy=false]'), 60); await t(300);
    const teks = ${lembar}.innerText.replace(/\\s+/g, ' ');
    tombol('Impor', ${lembar}).click(); await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60); await t(500);
    const kabar = (teksHalaman().match(/Rekening koran diimpor[^.]*\\./) ?? [''])[0];
    const akun = await rest('user_accounts?select=id,name');
    const nama = (id) => akun.find((k) => k.id === id)?.name;
    const tx = await rest('transactions?select=type,amount,kantong_id,kantong_tujuan_id,ref_bank,ref_bank_tujuan,perlu_dilengkapi&source=eq.statement&transaction_date=gte.2026-08-01&transaction_date=lte.2026-08-31');
    const saldo = await rest('rpc/saldo_kantong', { method: 'POST', body: '{}' });
    return { kartu: teks.match(/SeaBank …5555[^]{0,260}/)?.[0], kabar,
      tx: tx.map((x) => [x.type, Number(x.amount), nama(x.kantong_id), nama(x.kantong_tujuan_id) ?? null, Boolean(x.ref_bank), Boolean(x.ref_bank_tujuan), x.perlu_dilengkapi]).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])),
      sea: Number(saldo.find((x) => nama(x.id) === 'SeaBank …5555')?.saldo) }`);
  cek("R2: pratinjau SeaBank …5555 \"2 transaksi di Jago diubah jadi pindah kantong\", saldo sama", /2 transaksi di Jago diubah jadi pindah kantong/.test(r2b?.kartu ?? "") && /sama dengan aplikasi/.test(r2b?.kartu ?? ""), JSON.stringify(r2b?.kartu));
  cek(
    "R2: transfer Jago ↔ SeaBank …5555 jadi pindah kantong berpengenal dua sisi; transfer ke/dari orang lain tetap; hanya 1 transaksi baru",
    JSON.stringify(r2b?.tx) === JSON.stringify([
      ["expense", 75000, "Jago", null, true, false, true],
      ["income", 75000, "SeaBank …5555", null, true, false, true],
      ["transfer", 100000, "SeaBank …5555", "Jago", true, true, false],
      ["transfer", 300000, "Jago", "SeaBank …5555", true, true, false],
    ]) && /1 transaksi baru/.test(r2b?.kabar ?? ""),
    JSON.stringify(r2b),
  );
  cek("R2: saldo SeaBank …5555 = saldo akhir bank Rp 425.000", r2b?.sea === 425000, String(r2b?.sea));

  // 6. Deposito jatuh tempo (SPEC-deposito-jatuh-tempo): laporan Jago Oktober dengan kantong
  //    "Deposito" baru → "Jadikan deposito?" (K2) → impor dulu: periode ditutup dari rekening
  //    koran, kartu evaluasi tidak muncul → Urungkan dari detail → evaluasi dulu (isian beda)
  //    lalu impor lagi: ditautkan, bunga ikut bank (K1), satu pemasukan bunga, saldo = bank.
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await buka(`${base}/`, 5000);
  // Ukuran & tata letak (SPEC-perbaikan-uiux): area sentuh ≥ 44px (chip: 40px + perluasan ::after), tanpa scroll samping.
  const UKUR = `const tinggi = (el) => el ? Math.round(el.getBoundingClientRect().height) : 0;
    const sampingAman = () => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('dialog[open] *')].every((x) => x.getBoundingClientRect().right <= innerWidth + 1);`;
  const tawar = await langkah("jadikan deposito: tawaran", `${UKUR} ${seret(["jagoOkt"])}
    await sampai(() => /Jadikan deposito\\?/.test(${lembar}?.innerText ?? ''), 60);
    const d = ${lembar};
    const kartu = [...d.querySelectorAll('section')].find((x) => /Jadikan deposito\?/.test(x.innerText));
    const cb = kartu.querySelector('[role=checkbox]');
    const sebelum = d.innerText.replace(/\\s+/g, ' ');
    cb.click(); await sampai(() => kartu.querySelector('form'), 10); await t(300);
    const f = kartu.querySelector('form');
    isi(f.querySelector('input[placeholder="Bunga per tahun (%)"]'), '5');
    [...f.querySelectorAll('[aria-label="Tenor"] button')].find((b) => b.textContent.trim() === '14 hari').click(); await t(200);
    const radio = [...f.querySelectorAll('[role=radio]')];
    const kirim = [...f.querySelectorAll('button[type=submit]')][0];
    // Fokus pada tombol kirim tidak tertutup bilah Batal/Impor (#2).
    kirim.focus(); await t(400);
    const r = kirim.getBoundingClientRect(); const bilah = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Impor').parentElement.getBoundingClientRect();
    const ukuran = { cb: tinggi(cb), chip: ((c) => tinggi(c) - 2 * Math.min(0, parseFloat(getComputedStyle(c, '::after').top) || 0))(f.querySelector('[aria-label="Tenor"] button')), radio: Math.min(...radio.map(tinggi)), kirim: tinggi(kirim), samping: sampingAman(),
      fokus: { bawah: Math.round(r.bottom), atasBilah: Math.round(bilah.top), kena: kirim.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) } };
    window.__ukurJadikan = ukuran;
    return { sebelum: sebelum.match(/Jadikan deposito\\?[^]{0,160}/)?.[0], dipilih: radio.find((x) => x.getAttribute('aria-checked') === 'true')?.innerText.split('\\n')[0], ukuran }`);
  cek("Pratinjau: kantong Jago \"Deposito\" ditawari \"Jadikan deposito?\" dengan penempatan 12 Okt Rp 10.000.000 (K2)", /Kantong Jago “Deposito” · penempatan 12 Okt 2026 Rp 10\.000\.000/.test(norm(tawar?.sebelum)), JSON.stringify(tawar));
  cek("Jadikan deposito: bawaan \"Diperpanjang dengan bunga\"", tawar?.dipilih === "Diperpanjang dengan bunga", tawar?.dipilih);
  const uk = tawar?.ukuran ?? {};
  cek("Jadikan deposito 390 px: area sentuh ≥ 44px (centang, chip, pilihan, tombol), tanpa scroll samping", uk.cb >= 44 && uk.chip >= 44 && uk.radio >= 44 && uk.kirim >= 44 && uk.samping === true, JSON.stringify(uk));
  cek("Jadikan deposito: tombol yang difokus tidak tertutup bilah Batal/Impor (#2)", uk.fokus?.kena === true && uk.fokus.bawah <= uk.fokus.atasBilah, JSON.stringify(uk.fokus));
  await foto("deposito-1-jadikan-390.png");
  const diterapkan = await langkah("jadikan deposito: terapkan", `const d = ${lembar};
    const kartu = [...d.querySelectorAll('section')].find((x) => /Jadikan deposito\?/.test(x.innerText));
    kartu.querySelector('button[type=submit]').click();
    await sampai(() => /jatuh tempo 26 Okt 2026: bunga bersih/.test(${lembar}.innerText) && ${lembar}.querySelector('[aria-busy=false]'), 60); await t(300);
    const teks = ${lembar}.innerText.replace(/\\s+/g, ' ');
    return { teks: teks.match(/Deposito jatuh tempo 26 Okt[^]{0,140}/)?.[0], peringatan: [...${lembar}.querySelectorAll('[role=status]')].filter((x) => /Bunga deposito beda/.test(x.innerText)).length, bulanan: /Jago · Deposito[^]*Bunga: 1 transaksi per bulan/.test(teks) }`);
  cek(
    "Pratinjau: \"Deposito jatuh tempo 26 Okt 2026: bunga bersih Rp 15.342 (perkiraan Rp 15.342) · diperpanjang sampai 9 Nov 2026\", tanpa peringatan, tidak ikut bunga bulanan",
    norm(diterapkan?.teks).startsWith("Deposito jatuh tempo 26 Okt 2026: bunga bersih Rp 15.342 (perkiraan Rp 15.342) · diperpanjang sampai 9 Nov 2026") && diterapkan?.peringatan === 0 && diterapkan?.bulanan === false,
    JSON.stringify(diterapkan),
  );
  await foto("deposito-2-pratinjau-390.png");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false });
  await tidur(800);
  const lebar = await langkah("pratinjau 1300 px", `${UKUR} return { samping: sampingAman(), kartu: Boolean([...${lembar}.querySelectorAll('section')].find((x) => /Jadikan deposito\?/.test(x.innerText))?.querySelector('form')) }`);
  cek("Pratinjau 1300 px: tanpa scroll samping, kartu Jadikan deposito tetap terbuka", lebar?.samping === true && lebar?.kartu === true, JSON.stringify(lebar));
  await foto("deposito-3-pratinjau-1300.png");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await tidur(500);
  const imporDepo = await langkah("jadikan deposito: impor", `tombol('Impor', ${lembar}).click();
    await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60);
    return (teksHalaman().match(/Rekening koran diimpor[^.]*\\./) ?? [''])[0]`);
  cek("Impor: dikabari \"1 jatuh tempo deposito dicocokkan\"", /1 jatuh tempo deposito dicocokkan/.test(imporDepo ?? ""), imporDepo);
  const DATA_DEPO = `const akun = await rest('user_accounts?select=id,name,macam_simpanan,induk_id,emoji');
    const depo = akun.find((k) => k.name === 'Deposito');
    const per = await rest('deposito_periode?select=ke,mulai,jatuh_tempo,pokok,bunga_diterima,dari_rekening&order=ke&deposito_id=eq.' + depo?.id);
    const bunga = await rest('transactions?select=amount,description,ref_bank,kantong_id,source,transaction_date,waktu&type=eq.income&kantong_id=eq.' + depo?.id);
    const saldo = await rest('rpc/saldo_kantong', { method: 'POST', body: '{}' });
    const s = (n) => Number(saldo.find((x) => x.id === akun.find((k) => k.name === n)?.id)?.saldo);
    return { macam: depo?.macam_simpanan, emoji: depo?.emoji, induk: akun.find((k) => k.id === depo?.induk_id)?.name, per: per.map((p) => [p.ke, p.mulai, p.jatuh_tempo, Number(p.pokok), p.bunga_diterima === null ? null : Number(p.bunga_diterima), p.dari_rekening]),
      bunga: bunga.map((b) => [Number(b.amount), b.source, Boolean(b.ref_bank), b.description, b.transaction_date, b.waktu?.slice(0, 5)]), jago: s('Jago'), deposito: s('Deposito') };`;
  const d1 = await langkah("jadikan deposito: data", DATA_DEPO);
  cek(
    "Kantong Deposito jadi deposito di Jago; periode ke-1 ditutup dari rekening koran (Rp 15.342), ke-2 pokok Rp 10.015.342 s.d. 9 Nov",
    d1?.macam === "deposito" && d1.induk === "Jago" &&
      JSON.stringify(d1.per) === JSON.stringify([[1, "2026-10-12", "2026-10-26", 10000000, 15342, true], [2, "2026-10-26", "2026-11-09", 10015342, null, false]]),
    JSON.stringify(d1),
  );
  cek("Kantong yang dijadikan deposito berganti emoji bawaan 💰", d1?.emoji === "💰", d1?.emoji);
  cek("Satu pemasukan bunga Rp 15.342 berpengenal baris bank; saldo Deposito Rp 10.015.342, Jago = saldo akhir bank Rp 176.008", d1?.bunga?.length === 1 && d1.bunga[0][0] === 15342 && d1.bunga[0][2] && d1.deposito === 10015342 && d1.jago === 176008, JSON.stringify(d1));
  await buka(`${base}/`, 6000);
  const berandaImpor = await langkah("beranda sesudah impor", `return /Deposito jatuh tempo/.test(teksHalaman())`);
  cek("Impor dulu: kartu \"Deposito jatuh tempo\" tidak muncul", berandaImpor === false, String(berandaImpor));

  // Urungkan penutupan dari detail deposito (Profil → Kantong).
  await buka(`${base}/profil/kantong`, 6000);
  const urung = await langkah("urungkan dari detail", `${UKUR}
    [...document.querySelectorAll('button')].find((b) => b.querySelector('[class*=barisJudul]')?.textContent.trim() === 'Deposito').click();
    await sampai(() => /Urungkan penutupan ke-1 dari rekening koran/.test(dialog()?.innerText ?? ''), 20); await t(400);
    const b = [...dialog().querySelectorAll('button')].find((x) => /Urungkan penutupan ke-1/.test(x.textContent));
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    window.__urung = { tinggi: tinggi(b), samping: sampingAman() };
    return { teks: teks.match(/Riwayat periode[^]{0,260}/)?.[0], ...window.__urung }`);
  cek("Detail deposito: riwayat \"Dari rekening koran.\" + \"Urungkan penutupan ke-1 dari rekening koran\" (≥ 44px, tanpa scroll samping)", /Dari rekening koran\./.test(urung?.teks ?? "") && urung?.tinggi >= 44 && urung?.samping === true, JSON.stringify(urung));
  await foto("deposito-4-detail-urungkan-390.png");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false });
  await tidur(800);
  const urungLebar = await langkah("detail 1300 px", `${UKUR} return { samping: sampingAman(), ada: /Urungkan penutupan ke-1/.test(document.body.innerText) }`);
  cek("Detail deposito 1300 px: Urungkan terlihat, tanpa scroll samping", urungLebar?.samping === true && urungLebar?.ada === true, JSON.stringify(urungLebar));
  await foto("deposito-5-detail-urungkan-1300.png");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await tidur(500);
  const urungKlik = await langkah("urungkan: klik", `const b = [...document.querySelectorAll('dialog[open] button')].find((x) => /Urungkan penutupan ke-1/.test(x.textContent));
    b.click(); await sampai(() => !/Urungkan penutupan/.test(document.body.innerText), 30); await t(1500); return 'ok'`);
  const d2 = await langkah("urungkan: data", DATA_DEPO);
  cek(
    "Urungkan: bunga dihapus, periode ke-2 hilang, ke-1 menunggu dicek lagi; saldo Deposito Rp 10.000.000",
    urungKlik === "ok" && JSON.stringify(d2?.per) === JSON.stringify([[1, "2026-10-12", "2026-10-26", 10000000, null, false]]) && d2.bunga.length === 0 && d2.deposito === 10000000,
    JSON.stringify(d2),
  );

  // Evaluasi dulu di Beranda (isian beda dengan bank), lalu impor lagi.
  await buka(`${base}/`, 6000);
  const evaluasi = await langkah("evaluasi dulu", `await sampai(() => /Deposito jatuh tempo/.test(teksHalaman()), 20);
    const ada = /Deposito · di Jago/.test(teksHalaman());
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Isi yang diterima').click();
    await sampai(() => dialog()?.querySelector('input[placeholder="Bunga bersih diterima (Rp)"]')); await t(300);
    isi(dialog().querySelector('input[placeholder="Bunga bersih diterima (Rp)"]'), '15000'); await t(200);
    [...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Simpan').click();
    await sampai(() => /Deposito: Bank memberi/.test(teksHalaman()), 30); await t(1500);
    return ada`);
  cek("Sesudah Urungkan, kartu \"Deposito jatuh tempo\" muncul lagi dan bisa dievaluasi", evaluasi === true, String(evaluasi));
  const k1 = await langkah("impor lagi: pratinjau", `${seret(["jagoOkt"])}
    await sampai(() => /sudah dicek di aplikasi/.test(${lembar}?.innerText ?? ''), 60); await t(300);
    const p = [...${lembar}.querySelectorAll('[role=status]')].find((x) => /Bunga deposito diubah sesuai bank/.test(x.innerText));
    const svg = p?.querySelector('svg');
    return { teks: p?.innerText.replace(/\\s+/g, ' '), ikon: svg?.getAttribute('stroke') || svg?.getAttribute('color'), tawaran: /Jadikan deposito\?/.test(${lembar}.innerText), saldoBeda: /Saldo akhir tidak sama/.test(${lembar}.innerText) }`);
  cek(
    "Pratinjau: peringatan (ikon + warna) \"Bunga deposito diubah sesuai bank … dari Rp 15.000 jadi Rp 15.342\" (K1), tanpa tawaran Jadikan, saldo akhir sama dengan bank",
    /Bunga deposito diubah sesuai bank .*sudah dicek di aplikasi; bunga diubah dari Rp 15\.000 jadi Rp 15\.342 sesuai bank/.test(norm(k1?.teks)) && k1?.ikon === "var(--peringatan)" && k1?.tawaran === false && k1?.saldoBeda === false,
    JSON.stringify(k1),
  );
  await foto("deposito-6-peringatan-390.png");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false });
  await tidur(800);
  await foto("deposito-7-peringatan-1300.png");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await tidur(500);
  await langkah("impor lagi", `tombol('Impor', ${lembar}).click(); await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60); return 'ok'`);
  const d3 = await langkah("evaluasi dulu: data", DATA_DEPO);
  cek(
    "Evaluasi dulu lalu impor: satu pemasukan bunga, nominal & tanggal ikut bank (Rp 15.342, 26 Okt 00.15) \"disesuaikan dengan rekening koran\", tertaut baris bank",
    d3?.bunga?.length === 1 && d3.bunga[0][0] === 15342 && d3.bunga[0][1] === "text" && d3.bunga[0][2] && /disesuaikan dengan rekening koran$/.test(d3.bunga[0][3] ?? "") &&
      d3.bunga[0][4] === "2026-10-26" && d3.bunga[0][5] === "00:15",
    JSON.stringify(d3?.bunga),
  );
  cek(
    "Periode ke-1 Rp 15.342 (evaluasi), ke-2 pokok dihitung ulang Rp 10.015.342; saldo Jago = saldo akhir bank, Deposito Rp 10.015.342",
    JSON.stringify(d3?.per?.map((p) => [p[0], p[3], p[4], p[5]])) === JSON.stringify([[1, 10000000, 15342, false], [2, 10015342, null, false]]) && d3.jago === 176008 && d3.deposito === 10015342,
    JSON.stringify(d3),
  );
  await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 860, deviceScaleFactor: 1, mobile: true });

  // 7. SPEC-kantong-sendiri. A-2: BRI dengan 3 top up DANA atas nama sendiri, kantong DANA
  //    belum ada → "Kantong baru DANA (3 top up dari BRI)" tercentang → pindah kantong, lalu
  //    "Saldo DANA sekarang berapa?" (K1).
  await buka(`${base}/`, 5000);
  const a2 = await langkah("A-2: BRI top up DANA", `${seret(["briOkt"])}
    await sampai(() => /BRI …4321 1–31 Okt 2026/.test(${lembar}?.innerText ?? '') && ${lembar}.querySelector('[aria-busy=false]'), 60); await t(300);
    const d = ${lembar};
    const cb = [...d.querySelectorAll('[role=checkbox]')].find((b) => /Kantong baru DANA/.test(b.innerText));
    const teks = cb?.innerText.replace(/\\s+/g, ' ');
    const dicentang = cb?.getAttribute('aria-checked');
    tombol('Impor', d).click();
    await sampai(() => /Saldo DANA sekarang berapa\\?/.test(${lembar}?.innerText ?? ''), 60); await t(300);
    const tanya = ${lembar}.innerText.replace(/\\s+/g, ' ');
    isi(${lembar}.querySelector('input[placeholder="0"]'), '80000'); await t(200);
    tombol('Simpan', ${lembar}).click();
    await sampai(() => !${lembar} && /Rekening koran diimpor/.test(teksHalaman()), 30); await t(800);
    const akun = await rest('user_accounts?select=id,name,kind,saldo_awal');
    const nama = (id) => akun.find((k) => k.id === id)?.name;
    const tx = await rest('transactions?select=type,amount,kantong_id,kantong_tujuan_id,merchant&source=eq.statement&transaction_date=gte.2026-10-01&transaction_date=lte.2026-10-31&kantong_id=eq.' + akun.find((k) => k.name === 'BRI')?.id);
    const saldo = await rest('rpc/saldo_kantong', { method: 'POST', body: '{}' });
    const dana = akun.find((k) => k.name === 'DANA');
    return { teks, dicentang, tanya: tanya.match(/Saldo DANA sekarang berapa\\?[^]{0,80}/)?.[0], kind: dana?.kind,
      pindah: tx.filter((x) => x.type === 'transfer').map((x) => nama(x.kantong_id) + '>' + nama(x.kantong_tujuan_id) + ':' + Number(x.amount)),
      keluarDana: tx.filter((x) => x.type === 'expense' && /DANA/.test(x.merchant ?? '')).length,
      saldoDana: Number(saldo.find((x) => x.id === dana?.id)?.saldo) }`);
  cek("A-2: pratinjau \"Kantong baru DANA (3 top up dari BRI)\" tercentang", /Kantong baru DANA \(3 top up dari BRI\)/.test(a2?.teks ?? "") && a2?.dicentang === "true", JSON.stringify(a2));
  cek("A-2: top up jadi pindah kantong BRI → DANA (bukan pengeluaran), kantong DANA berjenis e-wallet", JSON.stringify(a2?.pindah) === JSON.stringify(["BRI>DANA:100000", "BRI>DANA:50000", "BRI>DANA:25000"]) && a2?.keluarDana === 0 && a2?.kind === "ewallet", JSON.stringify(a2));
  cek("K1: sesudah impor ditanya \"Saldo DANA sekarang berapa?\"; diisi Rp 80.000 → saldo DANA Rp 80.000", Boolean(a2?.tanya) && a2?.saldoDana === 80000, JSON.stringify(a2));
  await foto("kantong-sendiri-1-dana.png");

  // C-1: user membetulkan kategori gaji & tagihan wifi bulan Oktober; November diimpor →
  //      kategorinya diingat, tanpa "Perlu dilengkapi" (K2).
  const c1 = await langkah("C-1: bulan kedua", `const okt = await rest('transactions?select=id,merchant&source=eq.statement&transaction_date=gte.2026-10-01&transaction_date=lte.2026-10-31');
    for (const [m, k] of [['PT Contoh Kerja', 'salary'], ['PT Wifi Contoh', 'bills']]) {
      const t = okt.find((x) => x.merchant === m);
      await rest('transactions?id=eq.' + t.id, { method: 'PATCH', body: JSON.stringify({ category: k, perlu_dilengkapi: false }) });
    }
    ${seret(["briNov"])}
    await sampai(() => /BRI …4321 1–30 Nov 2026/.test(${lembar}?.innerText ?? '') && ${lembar}.querySelector('[aria-busy=false]'), 60); await t(300);
    const teks = ${lembar}.innerText.replace(/\\s+/g, ' ');
    tombol('Impor', ${lembar}).click(); await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60); await t(500);
    const nov = await rest('transactions?select=merchant,type,category,perlu_dilengkapi&source=eq.statement&transaction_date=gte.2026-11-01&transaction_date=lte.2026-11-30&order=transaction_date');
    return { kartu: teks.match(/\\d+ transaksi baru[^]{0,60}/)?.[0], nov: nov.map((x) => [x.merchant, x.category, x.perlu_dilengkapi]) }`);
  cek("C-1: pratinjau \"3 transaksi baru · 2 berkategori dari bulan lalu\"", /^3 transaksi baru · 2 berkategori dari bulan lalu/.test(c1?.kartu ?? ""), JSON.stringify(c1));
  cek(
    "C-1: gaji & wifi November berkategori Gaji/Tagihan tanpa Perlu dilengkapi; QRIS tetap perlu dilengkapi",
    JSON.stringify(c1?.nov) === JSON.stringify([["PT Contoh Kerja", "salary", false], ["PT Wifi Contoh", "bills", false], ["QRIS", "other", true]]),
    JSON.stringify(c1?.nov),
  );

  // C-2: Jago Pay ke GoPay → judul "GoPay · GO-RIDE" (bukan kode referensi), kategori dari layanan.
  const c2 = await langkah("C-2: Jago Pay GoPay", `${seret(["jagoGopay"])}
    await sampai(() => /Jago …5678 1–31 Okt 2026/.test(${lembar}?.innerText ?? '') && ${lembar}.querySelector('[aria-busy=false]'), 60); await t(300);
    tombol('Impor', ${lembar}).click(); await sampai(() => /Rekening koran diimpor/.test(teksHalaman()), 60); await t(500);
    const tx = await rest('transactions?select=merchant,category,description,perlu_dilengkapi&source=eq.statement&amount=in.(18000,32000,9000)&transaction_date=gte.2026-10-06&transaction_date=lte.2026-10-15&order=transaction_date');
    return tx.map((x) => [x.merchant, x.category, x.perlu_dilengkapi, /0220260527A1B2C3D4|#RB-778899/.test(x.description ?? '')])`);
  cek(
    "C-2: \"GoPay · GO-RIDE\" Transportasi, \"GoPay · GO-FOOD\" Makan, \"Toko Contoh\" (kode referensi di keterangan)",
    JSON.stringify(c2) === JSON.stringify([["GoPay · GO-RIDE", "transport", false, true], ["GoPay · GO-FOOD", "food", false, false], ["Toko Contoh", "other", true, true]]),
    JSON.stringify(c2),
  );

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
