import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-galat-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const klik = (sel) => `document.querySelector('${sel}').click()`;
const klikTeks = (teks, akar = "document") => `[...${akar}.querySelectorAll('button, a')].find(b => b.textContent.replace(/\\s+/g, ' ').trim().startsWith('${teks}')).click()`;
// Periksa galat di isian `kolom` setelah simpan: posisi, aria, fokus, nama isian bersih, hilang setelah diubah.
const PERIKSA = (kolom, perbaiki) => `
  const akar = dialog() || document;
  await sampai(() => akar.querySelector('[data-kolom="${kolom}"] [role=alert]'), 10);
  const f = akar.querySelector('[data-kolom="${kolom}"]');
  const pesan = f?.querySelector('[role=alert]')?.textContent || '';
  const isian = f?.querySelector('input, textarea, button');
  const bawah = isian && document.getElementById(isian.getAttribute('aria-describedby') || '-');
  const hasil = {
    pesan,
    diBawahIsian: !!pesan,
    tidakDiBawahForm: ![...akar.querySelectorAll('[class*=pesan]')].some(p => p.textContent.includes(pesan)),
    ariaInvalid: isian?.getAttribute('aria-invalid') === 'true',
    describedby: !!bawah && bawah.textContent.includes(pesan),
    fokus: f?.contains(document.activeElement),
    namaBersih: !(isian?.labels?.[0]?.textContent || '').includes(pesan),
  };
  ${perbaiki}
  await t(400);
  hasil.hilangSetelahDiubah = !akar.querySelector('[data-kolom="${kolom}"] [role=alert]') && isian?.getAttribute('aria-invalid') !== 'true';
  return hasil`;
const lulus = (r) => r && typeof r === "object" && Object.entries(r).every(([k, v]) => k === "pesan" || v === true);
const simpanDialog = `[...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan' || b.textContent.trim() === 'Bayar').click()`;
const isiKolom = (kolom, nilai) => `isi((dialog() || document).querySelector('[data-kolom="${kolom}"] input, [data-kolom="${kolom}"] textarea'), '${nilai}')`;

try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const { data: tx } = await sb.from("transactions").insert({ user_id: uid, status: "confirmed", source: "text", type: "expense", amount: 25000, category: "food", merchant: "Kopi Kenangan", transaction_date: "2026-10-20", kantong_id: tunai.id }).select("id").single();
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  const KASUS = [
    ["Catat manual: nominal kosong", "/", `${klik('button[aria-label="Catat transaksi"]')}; await t(800); ${klik('button[aria-label="Catat manual (form)"]')}; await sampai(() => dialog()?.querySelector('[data-kolom=amount]'))`, "amount", isiKolom("amount", "20000")],
    ["Catat manual: kantong belum dipilih (isian pilihan)", null, `await t(100)`, "kantong_id", `dialog().querySelector('[data-kolom=kantong_id] button').click(); await sampai(() => [...document.querySelectorAll('dialog[open]')].length > 1); await t(400); [...dialog().querySelectorAll('button')].find(b => b.textContent.includes('Tunai')).click(); await t(500)`],
    ["Catat manual: cashback > nominal", null, `${isiKolom("cashback", "50000")}; await t(200)`, "cashback", isiKolom("cashback", "1000")],
    ["Edit transaksi: nominal dikosongkan", `/transactions/${tx.id}`, `${klikTeks("Edit transaksi")}; await sampai(() => dialog()?.querySelector('[data-kolom=amount]')); ${isiKolom("amount", "")}; await t(200)`, "amount", isiKolom("amount", "30000")],
    ["Kantong: nama kosong", "/profil/kantong", `${klik('button[aria-label="Tambah kantong"]')}; await sampai(() => dialog()?.querySelector('[data-kolom=name]'))`, "name", isiKolom("name", "BCA")],
    ["Kategori: nama kosong", "/profil/kategori", `${klikTeks("Tambah kategori pengeluaran")}; await sampai(() => dialog()?.querySelector('[data-kolom=name]'))`, "name", isiKolom("name", "Kopi")],
    ["Pinjamkan: nama kosong", "/pinjaman", `${klikTeks("Pinjamkan")}; await sampai(() => dialog()?.querySelector('[data-kolom=nama]'))`, "nama", isiKolom("nama", "Budi")],
    ["Pinjamkan: nominal kosong", null, `await t(100)`, "nominal", isiKolom("nominal", "50000")],
    ["Kartu kredit: nama dikosongkan", "/pinjaman", `${klikTeks("Kartu")}; await sampai(() => dialog()?.querySelector('[data-kolom=nama]')); ${isiKolom("nama", "")}; await t(200)`, "nama", isiKolom("nama", "BCA Card")],
    ["Cicilan baru: nama kosong", "/pinjaman", `${klikTeks("Cicilan")}; await sampai(() => dialog()?.querySelector('[data-kolom=nama]'))`, "nama", isiKolom("nama", "HP")],
    ["Cicilan baru: tenor salah", null, `${isiKolom("nominal", "500000")}; ${isiKolom("tenor", "0")}; await t(200)`, "tenor", isiKolom("tenor", "12")],
  ];
  for (const [nama, url, siapkan, kolom, perbaiki] of KASUS) {
    if (url) await buka(`${base}${url}`, 5000);
    const r = await langkah(nama, `${siapkan}; await t(300); ${simpanDialog}; await t(800); window.__alert = [...(dialog() || document).querySelectorAll('[role=alert]')].map(a => (a.closest('[data-kolom]')?.dataset.kolom || '-') + ':' + a.textContent).join(' | '); ${PERIKSA(kolom, perbaiki)}`);
    if (!lulus(r)) console.log('   alert terlihat:', await jalankan('window.__alert'));
    cek(nama, lulus(r), JSON.stringify(r));
  }
  await foto("360-galat-cicilan.png");

  // Budget (halaman, bukan lembar).
  await buka(`${base}/profil/budget`, 5000);
  const b = await langkah("Budget: nol", `isi(document.querySelector('[data-kolom=food] input'), '0'); await t(200); ${klikTeks("Simpan")}; ${PERIKSA("food", `isi(document.querySelector('[data-kolom=food] input'), '500000')`)}`);
  cek("Budget: nominal nol → galat di isian Makan", lulus(b), JSON.stringify(b));

  // Reset password (dengan sesi): galat di isian + daftar syarat tetap terlihat.
  await buka(`${base}/reset-password`, 5000);
  console.log("   tombol reset:", await jalankan(`(() => { const b = document.querySelector('button[type=submit]'); return b.disabled + ' ' + b.textContent })()`));
  const rp = await langkah("Reset password: lemah", `isi(document.querySelectorAll('input[type=password]')[0], 'abc'); isi(document.querySelectorAll('input[type=password]')[1], 'abc'); await t(200); document.querySelector('button[type=submit]').click(); ${PERIKSA("password", "")}`);
  const syarat = await jalankan(`document.querySelector('[data-kolom=password]').innerText.replace(/\\s+/g, ' ')`);
  cek("Reset password: galat di isian password, daftar syarat tetap tampil", rp && rp.diBawahIsian && rp.ariaInvalid && rp.describedby && rp.fokus && rp.namaBersih && /karakter|huruf|angka/i.test(syarat), JSON.stringify(rp) + " | " + syarat.slice(0, 120));
  const ul = await langkah("Reset password: ulangan beda", `isi(document.querySelectorAll('input[type=password]')[0], 'Abcdef12#xy'); isi(document.querySelectorAll('input[type=password]')[1], 'beda'); await t(200); document.querySelector('button[type=submit]').click(); ${PERIKSA("ulangi", `isi(document.querySelectorAll('input[type=password]')[1], 'Abcdef12#xy')`)}`);
  cek("Reset password: ulangan beda → galat di isian ulangi", lulus(ul), JSON.stringify(ul));

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
