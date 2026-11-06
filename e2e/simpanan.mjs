// Simpanan (SPEC-simpanan): deposito "sudah termasuk" → saldo gabungan sama;
// jatuh tempo (periode disuntik bertanggal hari ini) → kartu evaluasi →
// Sesuai / Isi yang diterima untuk ketiga perpanjangan; Cairkan sekarang;
// hapus simpanan bersaldo; pocket di pilihan kantong; tujuan disimpan di
// BCA; induk dengan simpanan tidak bisa dihapus.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-simpanan-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
const rp = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const geser = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Persis: "Simpan" tidak boleh mengenai segmen "Simpanan".
const persis = (teks) => `[...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(teks)})`;
// Baris kantong menurut judulnya (rincian induk juga menyebut nama simpanannya).
const judul = (teks) => `[...document.querySelectorAll('button')].find(b => b.querySelector('[class*=barisJudul]')?.textContent.trim() === ${JSON.stringify(teks)})`;
const tekan = (teks, akar = "document") => `[...${akar}.querySelectorAll('button, a')].find(b => b.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(teks)}))`;
// Isian pilihan (Pilih): buka daftarnya, ketuk pilihan yang memuat teks.
const PILIH = `const pilih = async (akar, kolom, teks) => { akar.querySelector('[data-kolom="' + kolom + '"] button').click(); await sampai(() => dialog() !== akar); await t(300); [...dialog().querySelectorAll('button')].find(b => b.textContent.includes(teks)).click(); await t(400); };
  const seg = (teks) => [...dialog().querySelectorAll('button[aria-pressed]')].find(b => b.textContent.trim() === teks);`;
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const kantong = (name, saldo_awal) => ({ user_id: uid, name, kind: "bank", emoji: "🏦", saldo_awal, saldo_per: "2026-01-01", saldo_sejak: "2026-01-01T00:00:00+07:00" });
  // Saldo SeaBank di aplikasi bank: Rp 2,5 jt (rekening Rp 500 rb + deposito Rp 2 jt).
  const { data: sea } = await sb.from("user_accounts").insert(kantong("SeaBank", 2500000)).select("id").single();
  const { data: bca } = await sb.from("user_accounts").insert(kantong("BCA", 10000000)).select("id").single();
  const saldo = async (id) => Number((await sb.rpc("saldo_kantong")).data?.find((k) => k.id === id)?.saldo);
  const total = async () => {
    const { data: ks } = await sb.from("user_accounts").select("id, kind");
    const s = (await sb.rpc("saldo_kantong")).data ?? [];
    return ks.filter((k) => !["orang", "kredit"].includes(k.kind)).reduce((n, k) => n + Number(s.find((x) => x.id === k.id)?.saldo ?? 0), 0);
  };
  const totalAwal = await total();

  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
  const halaman = async () => norm(await jalankan(`document.body.innerText`));

  // --- 1. Deposito baru di SeaBank, "sudah termasuk": gabungan tetap Rp 2,5 jt.
  await buka(`${base}/profil/kantong`, 6000);
  const buat = await langkah("buat deposito", `${PILIH}
    document.querySelector('button[aria-label="Tambah kantong"]').click(); await sampai(() => dialog()?.querySelector('input[placeholder="Nama"]')); await t(300);
    seg('Simpanan').click(); await t(300);
    isi(dialog().querySelector('input[placeholder="Nama"]'), 'Deposito');
    await pilih(dialog(), 'induk_id', 'SeaBank');
    seg('Deposito').click(); await t(300);
    isi(dialog().querySelector('input[placeholder="Pokok (Rp)"]'), '2000000');
    isi(dialog().querySelector('input[placeholder="Bunga per tahun (%)"]'), '4,5'); await t(200);
    ${tekan("1 bln", "dialog()")}.click(); await t(400);
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    ${persis("Simpan")}.click(); await sampai(() => !dialog(), 20); await t(1500);
    return { termasuk: /Sudah termasuk di saldo SeaBank\\?/.test(teks), pratinjau: teks.match(/Jatuh tempo [^·]+\\(\\d+ hari\\) · bunga ± Rp[^·]+· pajak Rp 0 · bersih Rp [\\d.]+/)?.[0] }`);
  const { data: depo } = await sb.from("user_accounts").select("id, kind, macam_simpanan, induk_id, saldo_awal").eq("name", "Deposito").single();
  const { data: per1 } = await sb.from("deposito_periode").select("*").eq("deposito_id", depo?.id);
  let h = await halaman();
  cek(
    "Deposito dibuat: pindah SeaBank → deposito, saldo gabungan SeaBank tetap Rp 2.500.000",
    buat?.termasuk && Boolean(buat?.pratinjau) && depo?.macam_simpanan === "deposito" && depo.induk_id === sea.id && Number(depo.saldo_awal) === 0 &&
      (await saldo(depo.id)) === 2000000 && (await saldo(sea.id)) === 500000 && per1?.length === 1 && Number(per1[0].pokok) === 2000000 &&
      /SeaBank Rp 500\.000 \+ Deposito Rp 2\.000\.000 Rp 2\.500\.000/.test(h) && /Deposito Deposito · 4,5%\/th · jatuh tempo/.test(h),
    JSON.stringify({ buat, depo, per1: per1?.length }) + " " + h.slice(0, 300),
  );
  cek("Total aset tidak berubah", (await total()) === totalAwal && h.includes(`Total aset ${rp(totalAwal)}`));
  await foto("simpanan-1-kantong.png");

  // --- 2. Pocket "uang baru" di SeaBank; Beranda menggabungkan, tanpa baris terpisah.
  const { error: ePocket } = await sb.rpc("buat_simpanan", {
    p_kantong: { name: "Pocket Liburan", emoji: "🐷", induk_id: sea.id, macam_simpanan: "tabungan", saldo: 300000 }, p_termasuk: false,
  });
  const { data: pocket } = await sb.from("user_accounts").select("id").eq("name", "Pocket Liburan").single();
  await buka(`${base}/`, 6000);
  h = await halaman();
  cek("Beranda: SeaBank gabungan Rp 2.800.000 + rincian, deposito & pocket tidak dipisah", !ePocket && /SeaBank Rp 500\.000 \+ Deposito Rp 2\.000\.000 \+ Pocket Liburan Rp 300\.000 Rp 2\.800\.000/.test(h) && !/Pocket Liburan Rp 300\.000 Rp 300\.000/.test(h), h.match(/Total aset.{0,300}/)?.[0]);

  // --- 3. Pilihan kantong di Catat manual: pocket menyebut induknya, deposito tidak ada.
  const pilihan = await langkah("pilihan kantong", `document.querySelector('button[aria-label="Catat transaksi"]').click(); await t(800);
    document.querySelector('button[aria-label="Catat manual (form)"]').click(); await sampai(() => dialog()?.querySelector('[data-kolom=kantong_id]')); await t(300);
    dialog().querySelector('[data-kolom=kantong_id] button').click(); await sampai(() => [...document.querySelectorAll('dialog[open]')].length > 2 || dialog()?.querySelector('[role=radiogroup]')); await t(400);
    const opsi = [...dialog().querySelectorAll('[role=radio]')].map(b => b.textContent.trim());
    return opsi`);
  cek("Catat manual: 'Pocket Liburan · di SeaBank' ada, Deposito tidak", Array.isArray(pilihan) && pilihan.some((x) => x.includes("Pocket Liburan · di SeaBank")) && !pilihan.some((x) => /^.?.?Deposito$/.test(x) || x.endsWith("Deposito")), JSON.stringify(pilihan));

  // --- 4. Jatuh tempo, sekali saja: Sesuai → bunga ke SeaBank, pokok kembali, deposito hilang.
  await sb.from("deposito_periode").update({ mulai: geser(hariIni, -30), jatuh_tempo: hariIni }).eq("id", per1[0].id);
  await buka(`${base}/`, 6000);
  h = await halaman();
  const est1 = Number(per1[0].bunga_bersih);
  cek("Beranda: kartu 'Deposito jatuh tempo' dengan estimasi", /Deposito jatuh tempo/.test(h) && /Deposito · di SeaBank/.test(h) && h.includes(`bersih ${rp(est1)}`), h.match(/Deposito jatuh tempo.{0,300}/)?.[0]);
  await foto("simpanan-2-jatuh-tempo.png");
  const sesuai = await langkah("sesuai", `${tekan("Sesuai")}.click(); await sampai(() => /sama dengan perhitungan/.test(document.body.innerText), 30); await t(1500); return document.body.innerText.match(/Deposito: Bank memberi[^\\n]*/)?.[0]`);
  const { data: d1 } = await sb.from("deposito").select("selesai").eq("kantong_id", depo.id).single();
  const { data: bunga1 } = await sb.from("transactions").select("amount, category, merchant, description, kantong_id").eq("type", "income").eq("merchant", "Deposito");
  cek(
    "Sekali saja: bunga ke SeaBank (Bunga/Investasi), Rp 2 jt kembali, deposito selesai",
    d1?.selesai === true && bunga1?.length === 1 && bunga1[0].kantong_id === sea.id && bunga1[0].category === "investment" && /^Bunga deposito ke-1 · kotor/.test(bunga1[0].description ?? "") &&
      (await saldo(sea.id)) === 500000 + 2000000 + est1 && (await saldo(depo.id)) === 0 && /kembali ke SeaBank/.test(sesuai ?? ""),
    JSON.stringify({ d1, bunga1, sesuai }),
  );
  await buka(`${base}/profil/kantong`, 5000);
  h = await halaman();
  cek("Deposito selesai hilang dari Profil → Kantong", !/Deposito ·|jatuh tempo/.test(h) && /SeaBank Rp [\d.]+ \+ Pocket Liburan Rp 300\.000/.test(h), h.slice(0, 300));
  const { data: riwayat1 } = await sb.from("deposito_periode").select("bunga_diterima").eq("deposito_id", depo.id);
  cek("Riwayat periodenya tetap tersimpan", riwayat1?.length === 1 && Number(riwayat1[0].bunga_diterima) === est1);

  // --- 5. Diperpanjang tanpa bunga (14 hari) di BCA: Isi yang diterima → bunga ke BCA, periode baru pokok sama.
  const buatDepo = async (name, saldoPokok, perpanjangan, tenor, satuan, pajak = { pajak_persen: 20, pajak_otomatis: false }) => {
    const { data: id, error: e } = await sb.rpc("buat_simpanan", {
      p_kantong: { name, emoji: "💰", induk_id: bca.id, macam_simpanan: "deposito", saldo: saldoPokok }, p_termasuk: true,
      p_deposito: { bunga_persen: 6, tenor, satuan_tenor: satuan, perpanjangan, ...pajak },
      // Periode disuntik: jatuh tempo hari ini.
      p_periode: { mulai: geser(hariIni, -14), jatuh_tempo: hariIni, bunga_kotor: 23014, pajak: 4603, bunga_bersih: 18411 },
    });
    if (e) throw new Error(e.message);
    return id;
  };
  const flash = await buatDepo("Flash", 10000000, "pokok", 14, "hari");
  const bcaSetelahFlash = await saldo(bca.id);
  await buka(`${base}/`, 6000);
  const isiLain = await langkah("isi yang diterima", `${tekan("Isi yang diterima")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Bunga bersih diterima (Rp)"]')); await t(300);
    isi(dialog().querySelector('input[placeholder="Bunga bersih diterima (Rp)"]'), '18000'); await t(200);
    ${persis("Simpan")}.click(); await sampai(() => /Flash: Bank memberi/.test(document.body.innerText), 30); await t(1500);
    return document.body.innerText.match(/Flash: Bank memberi[^\\n]*/)?.[0]`);
  const { data: perFlash } = await sb.from("deposito_periode").select("ke, mulai, jatuh_tempo, pokok, bunga_diterima").eq("deposito_id", flash).order("ke");
  cek(
    "Tanpa bunga: Rp 18.000 ke BCA, periode ke-2 pokok sama mulai di jatuh tempo lama (+14 hari), selisih −Rp 411",
    perFlash?.length === 2 && Number(perFlash[0].bunga_diterima) === 18000 && Number(perFlash[1].pokok) === 10000000 && perFlash[1].mulai === hariIni && perFlash[1].jatuh_tempo === geser(hariIni, 14) &&
      (await saldo(bca.id)) === bcaSetelahFlash + 18000 && (await saldo(flash)) === 10000000 && /beda −Rp 411 dari perhitungan/.test(norm(isiLain)),
    JSON.stringify({ perFlash, isiLain }),
  );

  // --- 6. Diperpanjang dengan bunga (1 bulan): Sesuai → bunga ke deposito, pokok + bunga.
  // Pajak otomatis: pokok Rp 7.495.000 (0%) + bunga → di atas Rp 7,5 jt, periode ke-2 kena 20%.
  const tumbuh = await buatDepo("Tumbuh", 7495000, "pokok_bunga", 1, "bulan", { pajak_persen: 0, pajak_otomatis: true });
  const bcaSetelahTumbuh = await saldo(bca.id);
  await buka(`${base}/`, 6000);
  await langkah("sesuai tumbuh", `${tekan("Sesuai")}.click(); await sampai(() => /Tumbuh: Bank memberi/.test(document.body.innerText), 30); await t(1500); return 'ok'`);
  const { data: perTumbuh } = await sb.from("deposito_periode").select("ke, pokok, jatuh_tempo, bunga_kotor, pajak").eq("deposito_id", tumbuh).order("ke");
  cek(
    "Dengan bunga: Rp 18.411 masuk ke deposito, periode ke-2 pokok Rp 7.513.411 dengan pajak 20% (pokok > Rp 7,5 jt), BCA tidak berubah",
    perTumbuh?.length === 2 && Number(perTumbuh[1].pokok) === 7513411 && (await saldo(tumbuh)) === 7513411 && (await saldo(bca.id)) === bcaSetelahTumbuh &&
      Number(perTumbuh[1].pajak) > 0 && Number(perTumbuh[1].pajak) === Math.round(Number(perTumbuh[1].bunga_kotor) * 0.2),
    JSON.stringify({ perTumbuh }),
  );
  await buka(`${base}/`, 6000);
  h = await halaman();
  cek("Kartu jatuh tempo hilang sesudah semua dicek", !/Deposito jatuh tempo/.test(h));

  // --- 7. Cairkan sekarang (Flash, periode ke-2 belum jatuh tempo): bunga Rp 0, saldo kembali ke BCA.
  await buka(`${base}/profil/kantong`, 6000);
  const bcaSebelumCair = await saldo(bca.id);
  const cair = await langkah("cairkan", `${judul("Flash")}.click(); await sampai(() => dialog()?.innerText.includes('Cairkan sekarang')); await t(300);
    const detail = dialog().innerText.replace(/\\s+/g, ' ');
    // U5: dibuka dengan klik → tidak ada garis fokus di tombol mana pun.
    const garisFokus = [...dialog().querySelectorAll(':focus-visible')].map((x) => x.textContent.trim());
    ${tekan("Cairkan sekarang", "dialog()")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Bunga bersih diterima (Rp)"]')); await t(300);
    const awal = dialog().querySelector('input[placeholder="Bunga bersih diterima (Rp)"]').value;
    ${tekan("Cairkan", "dialog()")}.click(); await sampai(() => /kembali ke BCA/.test(document.body.innerText), 30); await t(1500);
    return { detail: /Riwayat periode/.test(detail) && /Ke-1/.test(detail), awal, garisFokus }`);
  const { data: dFlash } = await sb.from("deposito").select("selesai").eq("kantong_id", flash).single();
  const { data: perCair } = await sb.from("deposito_periode").select("dicairkan_awal, bunga_diterima").eq("deposito_id", flash).eq("ke", 2).single();
  cek(
    "Cairkan sekarang: bawaan Rp 0, Rp 10 jt kembali ke BCA, dicairkan awal, deposito selesai",
    cair?.detail && cair?.awal === "0" && Array.isArray(cair?.garisFokus) && cair.garisFokus.length === 0 && dFlash?.selesai && perCair?.dicairkan_awal === true && Number(perCair.bunga_diterima) === 0 && (await saldo(bca.id)) === bcaSebelumCair + 10000000 && (await saldo(flash)) === 0,
    JSON.stringify({ cair, dFlash, perCair }),
  );

  // --- 8. Hapus simpanan bersaldo: Rp 300.000 kembali ke SeaBank.
  await buka(`${base}/profil/kantong`, 6000);
  const seaSebelum = await saldo(sea.id);
  const hapus = await langkah("hapus pocket", `${judul("Pocket Liburan")}.click(); await sampai(() => dialog()?.innerText.includes('Hapus simpanan')); await t(300);
    ${tekan("Hapus simpanan", "dialog()")}.click(); await sampai(() => /kembali ke SeaBank/.test(dialog()?.innerText || '')); await t(300);
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    ${tekan("Hapus", "dialog()")}.click(); await sampai(() => !dialog(), 20); await t(1500); return teks`);
  const { data: pocketSisa } = await sb.from("user_accounts").select("id").eq("id", pocket.id);
  cek("Hapus pocket: konfirmasi menyebut Rp 300.000 kembali ke SeaBank; saldo SeaBank naik", /Rp 300\.000 kembali ke SeaBank, lalu simpanan ini dihapus/.test(norm(hapus)) && pocketSisa?.length === 0 && (await saldo(sea.id)) === seaSebelum + 300000, norm(hapus));

  // --- 9. Tujuan "Disimpan di" BCA → gabungan BCA; "di BCA" di halaman Tujuan.
  await buka(`${base}/profil/tujuan`, 5000);
  await langkah("tujuan di BCA", `${PILIH} ${tekan("Buat tujuan")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Nama"]')); await t(300);
    isi(dialog().querySelector('input[placeholder="Nama"]'), 'Dana darurat');
    isi(dialog().querySelector('input[placeholder="Target (Rp)"]'), '10000000');
    isi(dialog().querySelector('input[placeholder="Sudah terkumpul (Rp)"]'), '3000000');
    await pilih(dialog(), 'induk_id', 'BCA');
    ${persis("Simpan")}.click(); await sampai(() => !dialog() && document.body.innerText.includes('Dana darurat'), 20); await t(1000); return 'ok'`);
  const { data: dana } = await sb.from("user_accounts").select("id, induk_id").eq("name", "Dana darurat").single();
  h = await halaman();
  cek("Tujuan disimpan di BCA, tertulis 'di BCA'", dana?.induk_id === bca.id && /Dana darurat Rp 3\.000\.000 di BCA/.test(h), h.slice(0, 200));
  await buka(`${base}/profil/kantong`, 5000);
  h = await halaman();
  const bcaSendiri = await saldo(bca.id);
  cek(
    "Kantong: BCA gabungan = BCA + Tumbuh + Dana darurat; lebih dari dua isi diringkas",
    h.includes(`BCA ${rp(bcaSendiri)} + Tumbuh ${rp(7513411)} + Dana darurat Rp 3.000.000 ${rp(bcaSendiri + 7513411 + 3000000)}`),
    h.slice(0, 400),
  );
  // U3: yang disimpan di BCA tidak dihitung dua kali; tanpa tujuan terpisah nominalnya tidak tampil.
  cek("Disisihkan ke tujuan: '1 tujuan · disimpan di BCA', tanpa nominal Rp 0", /Disisihkan ke tujuan 1 tujuan · disimpan di BCA(?! Rp)/.test(h), h.match(/Disisihkan.{0,80}/)?.[0]);
  await foto("simpanan-3-gabungan.png");

  // --- 10. Induk dengan simpanan tidak bisa dihapus (aplikasi & database), di lebar 390 px:
  //     pesannya terlihat penuh, tidak tertutup bilah Batal/Simpan (U4).
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 640, deviceScaleFactor: 1, mobile: true });
  await buka(`${base}/profil/kantong`, 5000);
  const tolakInfo = await langkah("hapus BCA", `${tekan("BCA")}.click(); await sampai(() => dialog()?.innerText.includes('Hapus kantong')); await t(300);
    ${tekan("Hapus kantong", "dialog()")}.click(); await sampai(() => /masih berisi/.test(dialog()?.innerText || ''), 10); await t(800);
    const pesan = [...dialog().querySelectorAll('[role=alert]')].find((x) => /masih berisi/.test(x.textContent));
    const r = pesan.getBoundingClientRect();
    const bilah = ${persis("Simpan")}.parentElement.getBoundingClientRect();
    return { teks: pesan.textContent, atas: Math.round(r.top), bawah: Math.round(r.bottom), atasBilah: Math.round(bilah.top), tinggi: innerHeight }`);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 860, deviceScaleFactor: 1, mobile: true });
  const tolak = tolakInfo?.teks;
  cek("390 px: pesan galat terlihat penuh di atas bilah Batal/Simpan", tolakInfo?.atas >= 0 && tolakInfo?.bawah <= tolakInfo?.atasBilah, JSON.stringify(tolakInfo));
  const { error: eHapus } = await sb.from("user_accounts").delete().eq("id", bca.id);
  const { data: bcaAda } = await sb.from("user_accounts").select("id").eq("id", bca.id);
  cek("BCA berisi deposito: ditolak dengan pesan, database juga menolak", /BCA masih berisi 1 simpanan\. Cairkan atau hapus simpanannya dulu\./.test(tolak ?? "") && Boolean(eHapus) && bcaAda?.length === 1, JSON.stringify({ tolak, eHapus: eHapus?.message }));

  // --- 11. Hapus deposito yang masih berjalan = Cairkan sekarang lalu hapus: bunga diisi, saldo kembali ke BCA.
  await buka(`${base}/profil/kantong`, 6000);
  const bcaSebelumHapus = await saldo(bca.id);
  const hapusDepo = await langkah("hapus deposito", `${judul("Tumbuh")}.click(); await sampai(() => dialog()?.innerText.includes('Ubah')); await t(300);
    [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === 'Ubah').click(); await sampai(() => dialog()?.innerText.includes('Hapus simpanan')); await t(300);
    ${tekan("Hapus simpanan", "dialog()")}.click(); await sampai(() => dialog()?.querySelector('input[placeholder="Bunga bersih diterima (Rp)"]')); await t(300);
    const awal = dialog().querySelector('input[placeholder="Bunga bersih diterima (Rp)"]').value;
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    isi(dialog().querySelector('input[placeholder="Bunga bersih diterima (Rp)"]'), '5000'); await t(200);
    ${persis("Hapus")}.click(); await sampai(() => !dialog(), 20); await t(1500); return { awal, teks }`);
  const { data: tumbuhSisa } = await sb.from("user_accounts").select("id").eq("id", tumbuh);
  const { data: bungaHapus } = await sb.from("transactions").select("amount, kantong_id, description").eq("type", "income").eq("merchant", "Tumbuh");
  cek(
    "Hapus deposito berjalan: isian bunga (bawaan 0), Rp 5.000 masuk ke BCA, Rp 7.513.411 kembali, deposito terhapus",
    hapusDepo?.awal === "0" && /kembali ke BCA, lalu deposito ini dihapus/.test(norm(hapusDepo?.teks)) && tumbuhSisa?.length === 0 &&
      bungaHapus?.some((b) => Number(b.amount) === 5000 && b.kantong_id === bca.id && /dicairkan sebelum jatuh tempo/.test(b.description ?? "")) &&
      (await saldo(bca.id)) === bcaSebelumHapus + 7513411 + 5000,
    JSON.stringify({ hapusDepo, tumbuhSisa, bungaHapus }),
  );

  // Induk tanpa simpanan berjalan: tujuan di dalamnya dilepas, deposito selesai ikut terhapus.
  await sb.from("user_accounts").update({ induk_id: sea.id }).eq("id", dana.id);
  const { error: eHapusSea } = await sb.from("user_accounts").delete().eq("id", sea.id);
  const { data: danaLepas } = await sb.from("user_accounts").select("induk_id").eq("id", dana.id).single();
  const { data: depoLama } = await sb.from("user_accounts").select("id").eq("id", depo.id);
  cek("SeaBank (hanya deposito selesai) bisa dihapus; tujuan di dalamnya jadi terpisah", !eHapusSea && danaLepas?.induk_id === null && depoLama?.length === 0, JSON.stringify({ e: eHapusSea?.message, danaLepas }));
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
