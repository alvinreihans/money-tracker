// Perbaikan temuan C1–C12 (SPEC-perbaikan-temuan): kartu kredit (kelebihan
// bayar, jatuh tempo tiap tanggal, saldo sejak), hapus orang & tujuan, sumber
// uang tanpa tujuan, nama kantong kembar, tenggat & jatuh tempo, Profil, ekspor.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-perbaikan-utang-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ");
const geserHari = (n) => new Date(Date.now() + 7 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);
const hariIni = geserHari(0), kemarin = geserHari(-1);
const tekan = (teks, akar = "document") => `[...${akar}.querySelectorAll('button, a')].find(b => b.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(teks)})`;
// Baris orang/kartu di Utang & Piutang → lembar aksi → aksi.
const aksi = (nama, label) => `[...document.querySelectorAll('button')].find(b => b.querySelector('[class*=barisJudul]')?.textContent === ${JSON.stringify(nama)}).click();
  await sampai(() => dialog()?.innerText.includes(${JSON.stringify(label)})); await t(300); ${tekan(label, "dialog()")}.click(); await t(800);`;
// Pilihan di Pilih (lembar bertingkat) untuk kolom itu, lalu tutup lembarnya.
const PILIHAN = `const pilihan = async (kolom) => { const akar = dialog(); akar.querySelector('[data-kolom="' + kolom + '"] button').click(); await sampai(() => dialog() !== akar); await t(300);
  const isi = [...dialog().querySelectorAll('[role=radio]')].map(b => b.innerText.trim()); dialog().querySelector('[role=radio]').click(); await t(400); return isi; };`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const sejak = "2026-01-01T00:00:00+07:00";
  const kantong = async (name, kind, saldo_awal, extra = {}) =>
    (await sb.from("user_accounts").insert({ user_id: uid, name, kind, emoji: "🏦", saldo_awal, saldo_sejak: sejak, ...extra }).select("id").single()).data;
  const bca = await kantong("BCA", "bank", 1000000);
  const dana = await kantong("Dana darurat", "tujuan", 200000, { target: 5000000 });
  await kantong("Liburan", "tujuan", 0, { target: 1000000 });
  const teman = await kantong("Teman (contoh)", "orang", 0);
  const kartuA = await kantong("Kartu A", "kredit", -500000);
  const kartuB = await kantong("Kartu B", "kredit", -300000);
  const tx = (amount, type, kantong_id, kantong_tujuan_id, extra = {}) =>
    sb.from("transactions").insert({ user_id: uid, amount, type, category: type === "transfer" ? "other" : "food", transaction_date: hariIni, source: "text", status: "confirmed", kantong_id, kantong_tujuan_id, ...extra });
  await tx(100000, "transfer", bca.id, teman.id, { merchant: "Teman (contoh)" }); // piutang
  await tx(100000, "transfer", bca.id, dana.id); // sisihkan
  await tx(50000, "expense", dana.id, null, { merchant: "Obat" }); // pakai
  const saldo = async (id) => Number(((await sb.rpc("saldo_kantong")).data ?? []).find((s) => s.id === id)?.saldo ?? NaN);

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  const halaman = async () => norm(await jalankan(`document.body.innerText`));

  // --- C3: database menolak nama kembar tanpa beda huruf/spasi tepi.
  const { error: kembar } = await sb.from("user_accounts").insert({ user_id: uid, name: "bca ", kind: "bank", saldo_awal: 0, saldo_sejak: sejak });
  cek("C3: 'bca ' ditolak database (23505)", kembar?.code === "23505", JSON.stringify(kembar));

  // --- C6 + C8: Pinjamkan — sumber tanpa tujuan; jatuh tempo sebelum tanggal pinjam ditolak.
  await buka(`${base}/pinjaman`, 6000);
  const pinjamkan = await langkah("pinjamkan", `${PILIHAN} ${tekan("Pinjamkan")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Nominal (Rp)"]')); await t(400);
    const sumber = await pilihan('kantong');
    isi(dialog().querySelector('input[placeholder="Dipinjamkan ke"]'), 'Andi');
    isi(dialog().querySelector('input[placeholder="Nominal (Rp)"]'), '10000');
    const jt = dialog().querySelector('input[aria-label="Jatuh tempo"]');
    isi(jt, '${kemarin}'); await t(200);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await t(1500);
    return JSON.stringify({ sumber, min: jt.min, teks: dialog().innerText.replace(/\\s+/g, ' ') })`);
  const pj = JSON.parse(pinjamkan.startsWith("{") ? pinjamkan : "{}");
  cek("C6: Pinjamkan 'Dari kantong' tanpa tujuan tabungan", pj.sumber?.some((x) => x.includes("BCA")) && !pj.sumber?.some((x) => /Dana darurat|Liburan/.test(x)), JSON.stringify(pj.sumber));
  cek("C8: jatuh tempo sebelum tanggal pinjam ditolak, isian ber-min", pj.min === hariIni && /Jatuh tempo tidak boleh sebelum tanggal pinjam\./.test(pj.teks ?? ""), pj.min);
  const { count: andi } = await sb.from("user_accounts").select("id", { count: "exact", head: true }).eq("name", "Andi");
  cek("C8: tidak ada yang tersimpan", andi === 0);

  // --- C1: Bayar tagihan Kartu A 600 rb (tagihan 500 rb) → catat selisihnya sebagai biaya kartu.
  await buka(`${base}/pinjaman`, 6000);
  const bayarA = await langkah("bayar kartu A", `${PILIHAN} ${aksi("Kartu A", "Bayar tagihan")}
    await sampai(() => dialog()?.querySelector('input[placeholder="Nominal (Rp)"]')); await t(400);
    const sumber = await pilihan('kantong');
    isi(dialog().querySelector('input[placeholder="Nominal (Rp)"]'), '600000'); await t(500);
    const peringatan = dialog().innerText.replace(/\\s+/g, ' ');
    tombol('Catat selisihnya sebagai biaya kartu', dialog()).click(); await sampai(() => !dialog(), 30); await t(2500);
    return JSON.stringify({ sumber, peringatan })`);
  const ba = JSON.parse(bayarA.startsWith("{") ? bayarA : "{}");
  cek("C6: Bayar tagihan 'Dari kantong' tanpa tujuan", ba.sumber?.length > 0 && !ba.sumber.some((x) => /Dana darurat|Liburan/.test(x)), JSON.stringify(ba.sumber));
  cek("C1: peringatan kelebihan bayar dengan dua pilihan",
    /Lebih Rp 100\.000 dari tagihan di aplikasi\. Biasanya ada bunga, iuran, atau belanja kartu yang belum dicatat\./.test(ba.peringatan ?? "") && /Simpan saja/.test(ba.peringatan ?? ""), ba.peringatan?.slice(0, 300));
  const { data: biaya } = await sb.from("transactions").select("amount, type, category, kantong_id, description, transaction_date").eq("kantong_id", kartuA.id).eq("type", "expense");
  cek("C1: selisih tercatat sebagai Biaya dari kartu, tanggal sama; tagihan jadi 0",
    biaya?.length === 1 && Number(biaya[0].amount) === 100000 && biaya[0].category === "fees" && biaya[0].description === "Selisih tagihan kartu" && biaya[0].transaction_date === hariIni && (await saldo(kartuA.id)) === 0,
    JSON.stringify(biaya));

  // --- C1: Kartu B 350 rb (tagihan 300 rb) → Simpan saja → "Kelebihan bayar", tidak menambah total Utang.
  await langkah("bayar kartu B", `${aksi("Kartu B", "Bayar tagihan")}
    await sampai(() => dialog()?.querySelector('input[placeholder="Nominal (Rp)"]')); await t(400);
    isi(dialog().querySelector('input[placeholder="Nominal (Rp)"]'), '350000'); await t(500);
    tombol('Simpan saja', dialog()).click(); await sampai(() => !dialog(), 30); await t(2500); return 'ok'`);
  let h = await halaman();
  cek("C1: Kartu B tampil 'Kelebihan bayar Rp 50.000' di Utang; total Utang Rp 0",
    (await saldo(kartuB.id)) === 50000 && /Kartu B Kelebihan bayar Rp 50\.000/.test(h) && /Utang · Rp 0/.test(h) && /Utang Rp 0 · Piutang Rp 100\.000/.test(h), h.slice(0, 400));
  await foto("utang-1-kelebihan-bayar.png");

  // --- C9 + C10: Tambah kartu — jatuh tempo tiap tanggal (32 ditolak), saldo sejak jam sekarang.
  const tambah = await langkah("tambah kartu", `${tekan("Kartu")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Jatuh tempo tiap tanggal"]')); await t(400);
    isi(kolom('Nama'), 'Kartu C'); isi(kolom('Tagihan sekarang (Rp)'), '100000'); isi(kolom('Jatuh tempo tiap tanggal'), '32'); await t(200);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await t(1200);
    const galat = dialog().innerText.includes('Tanggalnya 1–31.');
    isi(kolom('Jatuh tempo tiap tanggal'), '25'); await t(200);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await sampai(() => !dialog(), 30); await t(2500); return galat`);
  const { data: kc } = await sb.from("user_accounts").select("id, jatuh_tempo_hari, saldo_sejak, saldo_per").eq("name", "Kartu C").single();
  cek("C10: tanggal 32 ditolak; jatuh tempo tiap tanggal 25 tersimpan", tambah === true && kc?.jatuh_tempo_hari === 25, JSON.stringify(kc));
  cek("C9: kartu baru per hari ini berlaku sejak jam sekarang, bukan 00.00",
    kc?.saldo_per === hariIni && new Date(kc.saldo_sejak) > new Date(`${hariIni}T00:00:00+07:00`), kc?.saldo_sejak);
  h = await halaman();
  cek("C10: baris kartu menyebut jatuh tempo berikutnya", /Kartu C Tagihan kartu kredit · jatuh tempo 25 \w+/.test(h), h.match(/Kartu C.{0,60}/)?.[0]);

  // --- C10 + C4: Ubah kartu — nama orang yang sudah ada ditolak dengan menyebut tempatnya; jatuh tempo diubah.
  const ubah = await langkah("ubah kartu", `${aksi("Kartu C", "Ubah kartu")}
    await sampai(() => dialog()?.querySelector('input[placeholder="Jatuh tempo tiap tanggal"]')); await t(400);
    const awal = kolom('Jatuh tempo tiap tanggal').value;
    isi(kolom('Nama'), 'teman (CONTOH)'); await t(200);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await t(2500);
    const galat = dialog().innerText.replace(/\\s+/g, ' ');
    isi(kolom('Nama'), 'Kartu C'); isi(kolom('Jatuh tempo tiap tanggal'), '31'); await t(200);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await sampai(() => !dialog(), 30); await t(2000);
    return JSON.stringify({ awal, galat })`);
  const ub = JSON.parse(ubah.startsWith("{") ? ubah : "{}");
  const { data: kc2 } = await sb.from("user_accounts").select("name, jatuh_tempo_hari").eq("id", kc.id).single();
  cek("C4: nama kembar menyebut di mana dipakai", /Nama ini sudah dipakai untuk Teman \(contoh\) di Utang & Piutang\./.test(ub.galat ?? ""), ub.galat?.slice(0, 200));
  cek("C10: Ubah kartu terisi 25, tersimpan 31", ub.awal === "25" && kc2?.name === "Kartu C" && kc2?.jatuh_tempo_hari === 31, JSON.stringify({ awal: ub.awal, kc2 }));

  // --- C2: Hapus orang — konfirmasi menyebut akibatnya; transaksi tetap, saldo BCA tidak berubah.
  const bcaSebelum = await saldo(bca.id);
  const hapus = await langkah("hapus orang", `${aksi("Teman (contoh)", "Hapus")}
    await sampai(() => /tetap tercatat/.test(dialog()?.innerText || '')); await t(300);
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    ${tekan("Hapus", "dialog()")}.click(); await sampai(() => !dialog(), 30); await t(2500); return teks`);
  cek("C2: konfirmasi menyebut transaksi & piutang yang hilang",
    /1 transaksi dengan Teman \(contoh\) tetap tercatat, tanpa kantong Teman \(contoh\)\./.test(hapus) && /Piutang Rp 100\.000 ikut hilang dari Utang & Piutang\./.test(hapus), hapus?.slice(0, 300));
  const { count: sisaTeman } = await sb.from("user_accounts").select("id", { count: "exact", head: true }).eq("id", teman.id);
  const { data: txTeman } = await sb.from("transactions").select("kantong_id, kantong_tujuan_id").eq("merchant", "Teman (contoh)");
  h = await halaman();
  cek("C2: kantong orang terhapus, transaksinya tetap (tanpa kantong orang), saldo BCA tetap, Piutang hilang",
    sisaTeman === 0 && txTeman?.length === 1 && txTeman[0].kantong_tujuan_id === null && txTeman[0].kantong_id === bca.id && (await saldo(bca.id)) === bcaSebelum && !/Teman \(contoh\)/.test(h),
    JSON.stringify({ sisaTeman, txTeman }));

  // --- C2: Hapus kartu bertagihan.
  const hapusKartu = await langkah("hapus kartu", `${aksi("Kartu C", "Hapus")}
    await sampai(() => /Tagihan Rp/.test(dialog()?.innerText || '')); await t(300);
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    ${tekan("Hapus", "dialog()")}.click(); await sampai(() => !dialog(), 30); await t(2000); return teks`);
  const { count: sisaKartu } = await sb.from("user_accounts").select("id", { count: "exact", head: true }).eq("id", kc.id);
  cek("C2: hapus kartu — 'Tagihan Rp 100.000 ikut hilang', terhapus", /Hapus kartu “Kartu C”\?/.test(hapusKartu) && /Tagihan Rp 100\.000 ikut hilang dari Utang & Piutang\./.test(hapusKartu) && sisaKartu === 0, hapusKartu?.slice(0, 200));

  // --- C6: Sisihkan ke Dana darurat — "Dari kantong" tanpa tujuan (termasuk tujuan itu sendiri).
  await buka(`${base}/profil/tujuan`, 6000);
  const sisihkan = await langkah("sisihkan", `${PILIHAN} ${tekan("Dana darurat")}?.click() ?? [...document.querySelectorAll('button')].find(b => b.innerText.includes('Dana darurat')).click();
    await sampai(() => dialog()?.innerText.includes('Sisihkan')); await t(300);
    ${tekan("Sisihkan", "dialog()")}.click(); await sampai(() => dialog()?.querySelector('[data-kolom="kantong_id"]')); await t(500);
    return JSON.stringify(await pilihan('kantong_id'))`);
  const ss = JSON.parse(sisihkan.startsWith("[") ? sisihkan : "[]");
  cek("C6: Sisihkan 'Dari kantong' = kantong uang tanpa tujuan tabungan", ss.some((x) => x.includes("BCA")) && !ss.some((x) => /Dana darurat|Liburan|Kartu/.test(x)), sisihkan);

  // --- C7: tujuan baru dengan tenggat kemarin ditolak.
  await buka(`${base}/profil/tujuan`, 6000);
  const tenggat = await langkah("tenggat lalu", `document.querySelector('button[aria-label="Tujuan baru"]').click(); await sampai(() => dialog()?.querySelector('input[aria-label="Tenggat"]')); await t(400);
    isi(kolom('Nama'), 'Motor'); isi(kolom('Target (Rp)'), '1000000'); isi(dialog().querySelector('input[aria-label="Tenggat"]'), '${kemarin}'); await t(200);
    [...dialog().querySelectorAll('[class*=pil] button')].find(b => b.textContent.trim() === 'Simpan').click(); await t(1500);
    return dialog().innerText.replace(/\\s+/g, ' ')`);
  const { count: motor } = await sb.from("user_accounts").select("id", { count: "exact", head: true }).eq("name", "Motor");
  cek("C7: 'Tenggatnya paling cepat hari ini.'", /Tenggatnya paling cepat hari ini\./.test(tenggat) && motor === 0, tenggat?.slice(0, 200));

  // --- C5: hapus tujuan yang punya riwayat & saldo — konfirmasi menyebut akibatnya.
  await buka(`${base}/profil/tujuan`, 6000);
  const hapusTujuan = await langkah("hapus tujuan", `[...document.querySelectorAll('button')].find(b => b.innerText.includes('Dana darurat')).click();
    await sampai(() => dialog()?.innerText.includes('Ubah')); await t(300); ${tekan("Ubah", "dialog()")}.click();
    await sampai(() => tombol('Hapus tujuan', dialog())); await t(400); tombol('Hapus tujuan', dialog()).click();
    await sampai(() => /Total aset/.test(dialog()?.innerText || '')); await t(300);
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    ${tekan("Hapus", "dialog()")}.click(); await sampai(() => !dialog(), 30); await t(2000); return teks`);
  const { count: sisaDana } = await sb.from("user_accounts").select("id", { count: "exact", head: true }).eq("id", dana.id);
  cek("C5: konfirmasi 'Rp 250.000 … Total aset' & '2 transaksi tetap tercatat'; tujuan terhapus",
    /Rp 250\.000 di tujuan ini ikut hilang dari Total aset\. Kalau uangnya masih ada, pakai Pakai dulu untuk memindahkannya\./.test(hapusTujuan) &&
      /2 transaksi tetap tercatat, tanpa tujuan ini\./.test(hapusTujuan) && sisaDana === 0,
    hapusTujuan?.slice(0, 300));

  // --- C11: subjudul Budget mengikuti metode; baris tujuan di Kantong membungkus teks.
  await sb.from("metode_budget").upsert({ user_id: uid, metode: "50-30-20" });
  await buka(`${base}/profil`, 5000);
  h = await halaman();
  cek("C11: Profil → Budget 'Metode 50/30/20'", /Budget Metode 50\/30\/20/.test(h), h.match(/Budget.{0,40}/)?.[0]);
  await buka(`${base}/profil/kantong`, 5000);
  const bungkus = await langkah("bungkus", `const el = [...document.querySelectorAll('a')].find(a => a.innerText.includes('Disisihkan ke tujuan'));
    return el ? [...el.querySelectorAll('span')].filter(s => /Disisihkan|tujuan tabungan/.test(s.textContent) && !s.children.length).map(s => getComputedStyle(s).whiteSpace).join(',') : 'tidak ada'`);
  cek("C11: 'Disisihkan ke tujuan' tidak dipotong", bungkus === "normal,normal", bungkus);

  // --- C12: ekspor CSV menulis kategori pindah kantong "Pindah kantong".
  const csv = await langkah("ekspor", `const r = await fetch('/api/ekspor'); const t2 = await r.text(); return t2.split('\\n').find(b => b.includes('Pindah kantong')) ?? t2.slice(0, 200)`);
  cek("C12: ekspor — kategori pindah kantong 'Pindah kantong'", /Pindah kantong[,;]Pindah kantong/.test(csv), csv?.slice(0, 200));

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
