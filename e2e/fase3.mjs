import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-fase3-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s).replace(/ /g, " ").replace(/\s+/g, " ");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const B = hariIni.slice(0, 7);
const tgl = (h) => `${B}-${String(Math.min(h, Number(hariIni.slice(8)))).padStart(2, "0")}`;
// Pilih (isian pilihan) di dialog teratas: buka daftar, ketuk pilihan.
const PILIH = `const pilih = async (akar, kolom, teks) => { akar.querySelector('[data-kolom="' + kolom + '"] button').click(); await sampai(() => [...document.querySelectorAll('dialog[open]')].length > 1 || dialog() !== akar); await t(300); [...dialog().querySelectorAll('button')].find(b => b.textContent.trim().startsWith(teks)).click(); await t(400); };`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  await sb.from("user_accounts").update({ saldo_awal: 20000000, saldo_sejak: "2026-01-01T00:00:00+07:00", saldo_per: "2026-01-01" }).eq("id", tunai.id);
  const tx = (amount, type, category, merchant, d) => ({ user_id: uid, status: "confirmed", source: "text", amount, type, category, merchant, transaction_date: d, kantong_id: tunai.id });
  await sb.from("transactions").insert([
    tx(8000000, "income", "salary", "Kantor", tgl(1)),
    tx(3000000, "expense", "food", "Katering", tgl(2)),
    tx(2900000, "expense", "shopping", "Toko Gadget", tgl(3)),
  ]);
  const { data: alfa } = await sb.from("transactions").insert(tx(15000, "expense", "groceries", "Alfamart", tgl(4))).select("id").single();
  const saldo = async () => Number((await sb.rpc("saldo_kantong")).data?.find((k) => k.id === tunai.id)?.saldo);
  const saldoAwal = await saldo();
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  // --- 1. Pilih 50/30/20 di Profil → Budget.
  await buka(`${base}/profil/budget`, 5000);
  const pilihMetode = await langkah("pilih 50/30/20", `
    const awal = !!document.querySelector('input[placeholder="Makan"]');
    [...document.querySelectorAll('[role=radio]')].find(b => b.textContent.includes('50/30/20')).click();
    await sampai(() => /Memakai metode 50\\/30\\/20/.test(document.body.innerText), 20); await t(1500);
    const contoh = [...document.querySelectorAll('ul')].map(u => u.parentElement.innerText).find(x => /Penghasilan per bulan/.test(x)).replace(/\\s+/g, ' ');
    return { awalAdaTarget: awal, contoh, targetDisembunyikan: !document.querySelector('input[placeholder="Makan"]') }`);
  const { data: mb } = await sb.from("metode_budget").select("metode").maybeSingle();
  cek("Budget: pilih 50/30/20 tersimpan, contoh rupiah dari pemasukan, isian per kategori disembunyikan",
    pilihMetode?.awalAdaTarget && mb?.metode === "50-30-20" && /Kebutuhan 50% Rp 4 jt/.test(norm(pilihMetode.contoh)) && pilihMetode.targetDisembunyikan, JSON.stringify({ pilihMetode, mb }));
  await foto("fase3-budget.png");

  // --- 2. Analitik: kartu metode.
  const kartu = async () => jalankan(`(() => { const s = [...document.querySelectorAll('section')].find(x => /Metode 50\\/30\\/20/.test(x.innerText)); return s ? s.innerText.replace(/\\s+/g, ' ') : null })()`).then((x) => (x ? norm(x) : x));
  await buka(`${base}/analitik`, 6000);
  const k1 = await kartu();
  cek("Analitik: Kebutuhan 3.015.000 / jatah 4 jt, Keinginan 2.900.000 lewat, Tabungan 2.085.000 tercapai",
    k1 && /Kebutuhan 50% Rp 3\.015\.000/.test(k1) && /Keinginan 30% Rp 2\.900\.000/.test(k1) && /Lewat/.test(k1) && /Tabungan & investasi 20% Rp 2\.085\.000/.test(k1) && /Tercapai/.test(k1), k1);
  await foto("fase3-analitik.png");
  const keRiw = await langkah("ketuk Keinginan", `[...document.querySelectorAll('section a')].find(a => /^Keinginan/.test(a.innerText.trim())).click(); await sampai(() => location.pathname === '/riwayat'); await t(2500); return { url: location.search, isi: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400) }`);
  cek("Analitik → Riwayat tersaring kelompok Keinginan (Toko Gadget saja, chip Keinginan)",
    /kelompok=keinginan/.test(keRiw.url) && /Toko Gadget/.test(keRiw.isi) && !/Katering/.test(keRiw.isi) && /Keinginan/.test(keRiw.isi), JSON.stringify(keRiw));

  // --- 3. Pecah Alfamart 15.000 → sabun 10.000 (kebutuhan) + kopi 5.000 (keinginan).
  await buka(`${base}/transactions/${alfa.id}`, 5000);
  const pecah = await langkah("pecah transaksi", `${PILIH}
    tombol('Pecah transaksi').click(); await sampai(() => dialog()?.innerText.includes('Bagian 2'));
    const d = dialog();
    const blok = () => [...d.querySelectorAll('[class*=blokForm]')];
    isi(blok()[1].querySelector('[data-kolom] input, input[inputmode]'), '5000'); await t(300);
    const otomatis = blok()[0].querySelector('input[inputmode]').value;
    isi(blok()[0].querySelector('input[placeholder^="Keterangan"]'), 'sabun');
    isi(blok()[1].querySelector('input[placeholder^="Keterangan"]'), 'kopi'); await t(200);
    blok()[1].querySelectorAll('[class*=fieldBaris] button')[1].click(); await sampai(() => [...document.querySelectorAll('dialog[open]')].length > 1); await t(300);
    [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === 'Keinginan').click(); await t(500);
    const status = d.innerText.match(/Jumlah Rp[^\\n]*/)?.[0];
    [...d.querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click();
    await sampai(() => /Dipecah jadi 2 bagian/.test(document.body.innerText), 20); await t(2500);
    return { otomatis, status, rincian: document.body.innerText.includes('Rincian'), judul: document.querySelector('h1')?.innerText }`);
  const { data: rows } = await sb.from("transactions").select("id, amount, kelompok, kelompok_efektif, description, pecahan_dari, merchant, transaction_date").or(`id.eq.${alfa.id},pecahan_dari.eq.${alfa.id}`);
  cek("Pecah: bagian 1 otomatis Rp 10.000; dua baris (10.000 kebutuhan + 5.000 keinginan, merchant & tanggal sama); detail tetap Rp 15.000 dengan Rincian; saldo sama",
    norm(pecah?.otomatis) === "10.000" && rows?.length === 2 && rows.some((r) => Number(r.amount) === 5000 && r.kelompok_efektif === "keinginan" && r.description === "kopi" && r.merchant === "Alfamart" && r.pecahan_dari === alfa.id) && rows.some((r) => r.id === alfa.id && Number(r.amount) === 10000 && r.kelompok_efektif === "kebutuhan") && pecah.rincian && /15\.000/.test(norm(pecah.judul)) && (await saldo()) === saldoAwal,
    JSON.stringify({ pecah, rows }));
  await foto("fase3-detail-pecah.png");

  // Riwayat: satu kartu Alfamart Rp 15.000 · 2 bagian; filter keinginan → bagian Rp 5.000.
  await buka(`${base}/riwayat`, 5000);
  const daftar = await jalankan(`[...document.querySelectorAll('a[class*=kartuTx]')].filter(a => a.innerText.includes('Alfamart')).map(a => a.innerText.replace(/\\s+/g, ' '))`);
  cek("Riwayat: satu kartu Alfamart Rp 15.000 · 2 bagian", daftar.length === 1 && /2 bagian/.test(daftar[0]) && /15\.000/.test(norm(daftar[0])), JSON.stringify(daftar));
  await buka(`${base}/riwayat?kelompok=keinginan`, 5000);
  const bagian = await jalankan(`[...document.querySelectorAll('a[class*=kartuTx]')].filter(a => a.innerText.includes('Alfamart')).map(a => a.innerText.replace(/\\s+/g, ' ') + ' → ' + a.getAttribute('href'))`);
  cek("Riwayat Keinginan: 'Alfamart Rp 5.000 · Bagian dari Rp 15.000', membuka transaksi aslinya", bagian.length === 1 && /5\.000/.test(norm(bagian[0])) && /Bagian dari Rp.15\.000/.test(norm(bagian[0])) && bagian[0].includes(`/transactions/${alfa.id}`), JSON.stringify(bagian));

  // Ubah tanggal di Edit transaksi → bagian ikut; nominal tidak bisa diubah di sana.
  await buka(`${base}/transactions/${alfa.id}`, 5000);
  const tglBaru = tgl(1);
  const edit = await langkah("ubah tanggal transaksi yang dipecah", `
    tombol('Edit transaksi').click(); await sampai(() => dialog()?.querySelector('input[type=date]'));
    const adaNominal = !!dialog().querySelector('[data-kolom=amount]');
    isi(dialog().querySelector('input[type=date]'), '${tglBaru}'); await t(300);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await sampai(() => !dialog(), 20); await t(1500);
    return { adaNominal }`);
  const { data: tglRows } = await sb.from("transactions").select("transaction_date").or(`id.eq.${alfa.id},pecahan_dari.eq.${alfa.id}`);
  cek("Edit transaksi dipecah: isian nominal disembunyikan; tanggal baru ikut ke semua bagian", edit && !edit.adaNominal && tglRows.every((r) => r.transaction_date === tglBaru), JSON.stringify({ edit, tglRows }));

  // Hapus → semua bagian hilang; Urungkan → kembali.
  const hapus = await langkah("hapus & urungkan", `
    document.querySelector('button[aria-label="Hapus transaksi"]').click(); await sampai(() => dialog()); tombol('Hapus', dialog()).click();
    await sampai(() => /Transaksi dihapus/.test(document.body.innerText), 20); return 'ok'`);
  const { data: setelahHapus } = await sb.from("transactions").select("id").or(`id.eq.${alfa.id},pecahan_dari.eq.${alfa.id}`);
  await langkah("urungkan", `tombol('Urungkan').click(); await sampai(() => /dikembalikan/.test(document.body.innerText), 20); await t(1000); return 'ok'`);
  const { data: setelahUrung } = await sb.from("transactions").select("id, amount").or(`id.eq.${alfa.id},pecahan_dari.eq.${alfa.id}`);
  cek("Hapus menghapus semua bagian; Urungkan mengembalikan semuanya", hapus === "ok" && setelahHapus.length === 0 && setelahUrung.length === 2 && (await saldo()) === saldoAwal, JSON.stringify({ setelahHapus: setelahHapus.length, setelahUrung }));

  // Gabungkan lagi.
  await buka(`${base}/transactions/${alfa.id}`, 5000);
  await langkah("gabungkan", `tombol('Atur pecahan').click(); await sampai(() => dialog()); tombol('Gabungkan lagi', dialog()).click(); await sampai(() => [...document.querySelectorAll('dialog[open]')].length > 1); tombol('Gabungkan', dialog()).click(); await sampai(() => /Digabung lagi/.test(document.body.innerText), 20); await t(1000); return 'ok'`);
  const { data: gabung } = await sb.from("transactions").select("id, amount").or(`id.eq.${alfa.id},pecahan_dari.eq.${alfa.id}`);
  cek("Gabungkan lagi → satu baris Rp 15.000", gabung.length === 1 && Number(gabung[0].amount) === 15000, JSON.stringify(gabung));

  // --- 4. Ubah kelompok satu transaksi (Katering → Keinginan) lewat Edit; detail menandai "(diubah)".
  const { data: katering } = await sb.from("transactions").select("id").eq("merchant", "Katering").single();
  await buka(`${base}/transactions/${katering.id}`, 5000);
  const kel = await langkah("ubah kelompok", `${PILIH}
    tombol('Edit transaksi').click(); await sampai(() => dialog()?.querySelector('[data-kolom=kelompok]'));
    const opsi = dialog().querySelector('[data-kolom=kelompok] button').innerText;
    await pilih(dialog(), 'kelompok', 'Keinginan');
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await sampai(() => !dialog(), 20); await t(2000);
    return { opsi, detail: document.body.innerText.replace(/\\s+/g, ' ').match(/Kelompok [A-Za-z ]+\\(diubah\\)/)?.[0] }`);
  await buka(`${base}/analitik`, 6000);
  const k2 = await kartu();
  cek("Kelompok per transaksi: pilihan 'Ikut kategori (Kebutuhan)'; detail 'Keinginan (diubah)'; Analitik bergeser (Keinginan 5.900.000: Katering 3 jt + Toko Gadget 2,9 jt)",
    /Ikut kategori \(Kebutuhan\)/.test(kel?.opsi ?? "") && /Keinginan \(diubah\)/.test(kel?.detail ?? "") && /Keinginan 30% Rp 5\.900\.000/.test(k2 ?? ""), JSON.stringify({ kel, k2 }));

  // --- 5. Beranda: peringatan kelompok.
  await buka(`${base}/`, 6000);
  const beranda = await jalankan(`(() => { const s = [...document.querySelectorAll('section')].find(x => /Budget hampir habis/.test(x.innerText)); return s ? s.innerText.replace(/\\s+/g, ' ') : null })()`);
  cek("Beranda: 'Budget hampir habis' menampilkan Keinginan yang lewat", beranda && /Keinginan/.test(beranda) && !/Tabungan/.test(beranda), beranda);

  // --- 6. Kustom harus 100%; lalu kembali ke Per kategori.
  await buka(`${base}/profil/budget`, 5000);
  const kustom = await langkah("kustom", `
    [...document.querySelectorAll('[role=radio]')].find(b => b.textContent.includes('Kustom')).click(); await t(500);
    const kolom = [...document.querySelectorAll('input[placeholder$="(%)"]')];
    isi(kolom[0], '50'); isi(kolom[1], '30'); isi(kolom[2], '10'); isi(kolom[3], '0'); await t(300);
    const status1 = document.body.innerText.match(/Total \\d+%[^\\n]*/)?.[0];
    tombol('Pakai persen ini').click(); await t(800);
    const galat = document.querySelector('[role=alert]')?.textContent;
    isi(kolom[3], '10'); await t(300);
    const status2 = document.body.innerText.match(/Total \\d+%[^\\n]*/)?.[0];
    tombol('Pakai persen ini').click(); await sampai(() => /Memakai metode Kustom/.test(document.body.innerText), 20); await t(1000);
    return { status1, galat, status2 }`);
  const { data: mbK } = await sb.from("metode_budget").select("metode, persen").maybeSingle();
  cek("Kustom: 90% ditolak dengan pesan di isian; 100% tersimpan",
    /Total 90%/.test(kustom?.status1 ?? "") && /harus 100%/.test(kustom?.galat ?? "") && /Total 100% ✓/.test(kustom?.status2 ?? "") && mbK?.metode === "kustom" && mbK?.persen?.berbagi === 10, JSON.stringify({ kustom, mbK }));
  await langkah("kembali per kategori", `[...document.querySelectorAll('[role=radio]')].find(b => b.textContent.includes('Per kategori')).click(); await sampai(() => /Memakai budget per kategori/.test(document.body.innerText), 20); await t(1000); return 'ok'`);
  await buka(`${base}/analitik`, 6000);
  const perKategori = await jalankan(`({ metode: [...document.querySelectorAll('section')].some(x => /Metode /.test(x.innerText)), budget: /Pasang budget bulanan|Budget /.test(document.body.innerText) })`);
  cek("Kembali ke Per kategori → Analitik menampilkan kartu Budget lama", !perKategori.metode && perKategori.budget, JSON.stringify(perKategori));

  // --- 7. Kategori baru dengan kelompok Tabungan.
  await buka(`${base}/profil/kategori`, 5000);
  const katBaru = await langkah("kategori Emas → Tabungan", `${PILIH}
    tombol('Tambah kategori pengeluaran').click(); await sampai(() => dialog()?.querySelector('[data-kolom=kelompok]'));
    isi(dialog().querySelector('[data-kolom=name] input'), 'Emas'); await t(200);
    await pilih(dialog(), 'kelompok', 'Tabungan');
    const sebelum = dialog().innerText.replace(/\s+/g, ' ').slice(0, 300);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); const tutup = await sampai(() => !dialog(), 20); await t(1000);
    return tutup ? 'ok' : 'masih terbuka: ' + (dialog()?.innerText.replace(/\s+/g, ' ').slice(0, 300) ?? '') + ' || sebelum: ' + sebelum`);
  const { data: emas } = await sb.from("categories").select("kelompok").eq("name", "Emas").maybeSingle();
  cek("Kategori baru 'Emas' tersimpan dengan kelompok Tabungan", katBaru === "ok" && emas?.kelompok === "tabungan", JSON.stringify({ katBaru, emas }));

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
