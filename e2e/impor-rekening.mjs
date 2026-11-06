// Impor rekening koran (docs/specs/SPEC-impor-rekening.md): PDF BUATAN per bank
// (bukan data user, digambar dengan pdf-lib dari scripts/contoh-rekening.mjs)
// → seret-lepas → "kantong yang mana?" → pratinjau → Impor → saldo kantong;
// impor ulang lewat lampiran Catat tidak menggandakan; bank lain & saldo yang
// tidak cocok ditolak; Riwayat "Perlu dilengkapi".
import { createRequire } from "node:module";
import path from "node:path";
import { base, buka, cdp, edge, foto, fs, langkah, masalah, out } from "./kepala.mjs";
import { bri, Halaman, jagoBulanan, seabank } from "../scripts/contoh-rekening.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const { PDFDocument, StandardFonts } = req("pdf-lib");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-rekening-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

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
  // Jago (belum diingat), BCA & ShopeePay (lawan pindah kantong).
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
  cek("Rekening SeaBank & Jago ditanya kantongnya, BRI langsung (4 digit akhir)", JSON.stringify(tanya.grup) === JSON.stringify(["Kantong untuk SeaBank …1234", "Kantong untuk Jago …5678"]), JSON.stringify(tanya));
  cek("Pilihan Buat kantong SeaBank", /Buat kantong SeaBank/.test(tanya.teks), tanya.teks);

  const pratinjau = await langkah("jawab & pratinjau", `const d = ${lembar};
    const pilih = (grup, teks) => [...d.querySelector('[aria-label="' + grup + '"]').querySelectorAll('[role=radio]')].find((b) => b.innerText.includes(teks)).click();
    pilih('Kantong untuk SeaBank …1234', 'Buat kantong SeaBank'); await t(100);
    pilih('Kantong untuk Jago …5678', 'Jago'); await t(100);
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
  const riwayat = await langkah("riwayat perlu dilengkapi", `return { chip: !!tombol('Perlu dilengkapi'), tekan: tombol('Perlu dilengkapi')?.getAttribute('aria-pressed'), lencana: [...document.querySelectorAll('[class*=lencana]')].filter((x) => x.textContent === 'Perlu dilengkapi').length }`);
  cek("Riwayat: chip Perlu dilengkapi aktif & tiap kartu bertanda", riwayat.chip && riwayat.tekan === "true" && riwayat.lencana === db.perlu, JSON.stringify(riwayat));
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
