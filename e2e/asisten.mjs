// Asisten agen tahap B (SPEC-asisten-agen §3, P4): kartu usulan → Terapkan → data &
// saldo berubah → Urungkan → kembali; riwayat percakapan (obrolan baru, buka obrolan
// lama, lanjutkan, hapus). Di 360 & 1024 px. Jawaban /api/tanya ditiru (tanpa kuota
// Gemini); Terapkan/Urungkan & penyimpanan obrolan memakai server & database sungguhan.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-asisten-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const ukur = async (w, h = 860) => { await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await tidur(700); };
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// /api/tanya tiruan: pertanyaan berisi "jadikan" → jawaban + kartu usulan (window.__usulan); selain itu jawaban biasa.
// Kiriman terakhir disimpan di window.__kirimanTanya.
const TIRU = `window.__tiruAsisten = window.__tiruAsisten || (() => { const asli = window.fetch; window.fetch = (u, o) => {
  if (!String(u).includes('/api/tanya')) return asli(u, o);
  const b = JSON.parse(o.body); window.__kirimanTanya = b;
  const usul = /jadikan/i.test(b.pertanyaan);
  const isi = usul
    ? { jawaban: 'Top up itu seharusnya pindah kantong ke DANA Uji. Cek kartunya, lalu tekan Terapkan.', tautan: [], ragu: false, model: 'ringan', usulan_aksi: [window.__usulan] }
    : { jawaban: 'Oke, ' + b.pertanyaan + ' sudah kucatat di percakapan ini.', tautan: [], ragu: false, model: 'ringan' };
  return new Promise(r => setTimeout(() => r(new Response(JSON.stringify(isi), { status: 200, headers: { 'content-type': 'application/json' } })), 300));
}; return true; })()`;

try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const ref = new URL(U).hostname.split(".")[0];
  const isiKue = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isiKue.length; i += 3180) p.push(isiKue.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isiKue]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  const { data: bca } = await sb.from("user_accounts").insert({ user_id: uid, name: "BCA Uji", kind: "bank", emoji: "🏦", saldo_awal: 1000000, saldo_sejak: "2026-01-01T00:00:00+07:00" }).select().single();
  const saldo = async () => Object.fromEntries(((await sb.rpc("saldo_kantong")).data ?? []).map((x) => [x.id, Number(x.saldo)]));

  for (const lebar of [360, 1024]) {
    await ukur(lebar);
    // Top up BCA → DANA yang tercatat sebagai pengeluaran (kantong DANA belum ada).
    const { data: baru } = await sb.from("transactions").insert({ user_id: uid, amount: 100000, type: "expense", category: "other", merchant: `Top Up DANA ${lebar}`, transaction_date: hariIni, kantong_id: bca.id, status: "confirmed", source: "text" }).select("id").single();
    const { data: top } = await sb.from("transactions").select("id, updated_at").eq("id", baru.id).single();
    const nama = `DANA Uji ${lebar}`;
    const usulan = {
      kunci: `uji-${lebar}`,
      jenis: "jadikan_pindah",
      judul: `Buat kantong ${nama} dan jadikan 1 transaksi pindah kantong ke ${nama}`,
      jumlah: 1,
      total: 100000,
      baris: [{ id: top.id, tanggal: hariIni, teks: `Top Up DANA ${lebar}`, nominal: 100000, sebelum: "Pengeluaran · Lainnya · BCA Uji", sesudah: `Pindah BCA Uji → ${nama}` }],
      saldo: [{ nama, sebelum: null, sesudah: 100000 }],
      catatan: [`Kantong ${nama} (e-wallet) dibuat dengan saldo awal Rp 0 sejak ${hariIni}.`],
      kantong: [bca.id, "baru"],
      isian: { jenis: "jadikan_pindah", ringkasan: `Jadikan 1 transaksi pindah kantong ${nama}`, kantong_baru: { nama, jenis: "ewallet", saldo_awal: 0, saldo_sejak: `${hariIni}T00:00:00+07:00` }, pindah: [{ id: top.id, updated_at: top.updated_at, ke: "baru", gabung: null }] },
    };
    const saldoAwal = (await saldo())[bca.id];

    await buka(`${base}/`, 6000);
    await jalankan(TIRU);
    await jalankan(`window.__usulan = ${JSON.stringify(usulan)}; true`);
    // --- Kartu usulan: tampil dengan sebelum → sesudah & saldo, lalu Terapkan.
    const kartu = await langkah(`kartu usulan di ${lebar}`, `
      document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
      // Mulai dari percakapan baru (lebar kedua: percakapan lebar pertama masih terbuka).
      dialog().querySelector('button[aria-label="Percakapan baru"]').click(); await t(300);
      isi(dialog().querySelector('textarea'), 'jadikan top up DANA pindah kantong ya'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
      await sampai(() => tombol('Terapkan', dialog()), 20);
      const k = dialog().querySelector('[role=group][aria-label^="Usulan:"]');
      const r = k.getBoundingClientRect();
      const tombolKecil = [...k.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.innerText);
      return { teks: k.innerText, muat: r.left >= -1 && r.right <= innerWidth + 1, tombolKecil, gulirSamping: document.documentElement.scrollWidth > innerWidth + 1 }`);
    cek(`${lebar}: kartu usulan menampilkan judul, sebelum → sesudah, saldo kantong baru, Batal & Terapkan; muat tanpa gulir samping; tombol ≥ 44px`,
      kartu && kartu.teks.includes(usulan.judul) && kartu.teks.includes(`Pindah BCA Uji → ${nama}`) && /Saldo DANA Uji \d+: kantong baru → Rp.100\.000/.test(kartu.teks) && kartu.muat && !kartu.gulirSamping && !kartu.tombolKecil.length,
      JSON.stringify(kartu));
    await foto(`asisten-kartu-${lebar}.png`);
    const { data: belum } = await sb.from("transactions").select("type").eq("id", top.id).single();
    cek(`${lebar}: sebelum Terapkan, belum ada yang berubah`, belum?.type === "expense");

    const terap = await langkah(`Terapkan di ${lebar}`, `
      tombol('Terapkan', dialog()).click();
      await sampai(() => /Diterapkan\\./.test(dialog().innerText), 30); await t(300);
      return { teks: dialog().querySelector('[role=group][aria-label^="Usulan:"]').innerText, urungkan: !!tombol('Urungkan', dialog()) }`);
    const { data: sesudah } = await sb.from("transactions").select("type, kantong_tujuan_id, merchant").eq("id", top.id).single();
    const { data: dana } = await sb.from("user_accounts").select("id, kind").eq("name", nama).maybeSingle();
    const saldoSesudah = await saldo();
    cek(`${lebar}: Terapkan → top up jadi pindah kantong ke kantong baru, saldo BCA tetap, ${nama} Rp 100.000; kartu menyebut saldo baru & Urungkan`,
      terap?.urungkan && /Saldo BCA Uji sekarang Rp.\d/.test(terap.teks) && new RegExp(`${nama} sekarang Rp.100\\.000`).test(terap.teks) &&
        sesudah?.type === "transfer" && dana?.kind === "ewallet" && sesudah?.kantong_tujuan_id === dana?.id && saldoSesudah[bca.id] === saldoAwal && saldoSesudah[dana.id] === 100000,
      JSON.stringify({ terap, sesudah, dana, saldoAwal, saldoSesudah: saldoSesudah[bca.id] }));
    // Riwayat menampilkan pindah kantongnya.
    await foto(`asisten-diterapkan-${lebar}.png`);

    const urung = await langkah(`Urungkan di ${lebar}`, `
      tombol('Urungkan', dialog()).click();
      await sampai(() => /Diurungkan/.test(dialog().innerText), 30); await t(300);
      return dialog().querySelector('[role=group][aria-label^="Usulan:"]').innerText`);
    const { data: balik } = await sb.from("transactions").select("type, kantong_tujuan_id").eq("id", top.id).single();
    const { data: danaHilang } = await sb.from("user_accounts").select("id").eq("name", nama);
    cek(`${lebar}: Urungkan → kembali pengeluaran, kantong baru dihapus, saldo BCA kembali`,
      /Diurungkan, semuanya kembali seperti semula\. Kantong barunya ikut dihapus\./.test(urung ?? "") && balik?.type === "expense" && balik?.kantong_tujuan_id === null && !(danaHilang ?? []).length && (await saldo())[bca.id] === saldoAwal,
      JSON.stringify({ urung, balik, danaHilang }));

    // --- Riwayat percakapan: tersimpan, Percakapan baru, buka yang lama (kartu tetap "Diurungkan"), lanjutkan, hapus.
    const daftarAwal = (await sb.rpc("daftar_obrolan")).data ?? [];
    const judulLama = "jadikan top up DANA pindah kantong ya";
    const obrolanLama = daftarAwal.find((o) => o.judul === judulLama);
    cek(`${lebar}: percakapan tersimpan dengan judul dari pertanyaan pertama`, Boolean(obrolanLama), JSON.stringify(daftarAwal));
    const baruObrolan = await langkah(`percakapan baru di ${lebar}`, `
      dialog().querySelector('button[aria-label="Percakapan baru"]').click(); await t(400);
      const kosong = !!dialog().querySelector('[class*=gptKosong]');
      isi(dialog().querySelector('textarea'), 'catatan kedua ${lebar}'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
      await sampai(() => /sudah kucatat/.test(dialog().innerText), 20); await t(1500);
      return { kosong, riwayatTerkirim: window.__kirimanTanya.riwayat.length }`);
    const daftarDua = (await sb.rpc("daftar_obrolan")).data ?? [];
    cek(`${lebar}: Percakapan baru → layar kosong, riwayat tidak terbawa, tersimpan sebagai percakapan terpisah`,
      baruObrolan?.kosong && baruObrolan.riwayatTerkirim === 0 && daftarDua.length === daftarAwal.length + 1 && daftarDua[0].judul === `catatan kedua ${lebar}`,
      JSON.stringify({ baruObrolan, daftarDua }));

    const lama = await langkah(`buka percakapan lama di ${lebar}`, `
      const tombolRiwayat = dialog().querySelector('button[aria-label="Riwayat percakapan"]');
      const tombolRiwayatTampil = tombolRiwayat.getBoundingClientRect().width > 0;
      if (tombolRiwayatTampil) { tombolRiwayat.click(); await t(400); }
      const daftar = dialog().querySelector('ul[aria-label="Percakapan tersimpan"]');
      await sampai(() => daftar && daftar.getBoundingClientRect().width > 0 && daftar.innerText.includes(${JSON.stringify(judulLama)}), 20);
      const sampingObrolan = dialog().querySelector('[class*=gptRuang]').getBoundingClientRect().width > 0;
      const item = [...daftar.querySelectorAll('button')].find(b => b.innerText.startsWith(${JSON.stringify(judulLama)}));
      const ukuran = [...daftar.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().height));
      const ikonTanpaLabel = [...dialog().querySelectorAll('button')].filter(b => !b.innerText.trim() && !b.getAttribute('aria-label')).length;
      item.click();
      await sampai(() => /Diurungkan, semuanya kembali/.test(dialog().innerText), 20); await t(300);
      return { tombolRiwayatTampil, sampingObrolan, ukuran, ikonTanpaLabel, teks: dialog().querySelector('[class*=gptPesan]').innerText, gulirSamping: document.documentElement.scrollWidth > innerWidth + 1 }`);
    // Di bawah 1280 px (termasuk 1024) daftar lewat tombol riwayat & menggantikan isi; ≥ 1280 di samping (dicek di bawah).
    cek(`${lebar}: daftar percakapan lewat tombol riwayat (menggantikan isi) → buka yang lama: pesannya & kartu "Diurungkan" kembali`,
      lama && lama.tombolRiwayatTampil && !lama.sampingObrolan &&
        lama.teks.includes(judulLama) && /Diurungkan, semuanya kembali/.test(lama.teks) && !lama.teks.includes(`catatan kedua ${lebar}`) &&
        lama.ukuran.every((h) => h >= 44) && lama.ikonTanpaLabel === 0 && !lama.gulirSamping,
      JSON.stringify(lama));
    await foto(`asisten-riwayat-${lebar}.png`);

    const lanjut = await langkah(`lanjutkan percakapan lama di ${lebar}`, `
      isi(dialog().querySelector('textarea'), 'lanjut ${lebar}'); await t(200); dialog().querySelector('button[aria-label="Kirim"]').click();
      await sampai(() => /lanjut ${lebar} sudah kucatat/.test(dialog().innerText), 20); await t(1500);
      return window.__kirimanTanya.riwayat`);
    const daftarTiga = (await sb.rpc("daftar_obrolan")).data ?? [];
    const { data: isiLama } = await sb.rpc("buka_obrolan", { p_id: obrolanLama?.id });
    cek(`${lebar}: lanjutkan → riwayat percakapan lama (dengan status kartu) ikut terkirim, tersimpan di percakapan yang sama`,
      Array.isArray(lanjut) && lanjut.length === 2 && /\[Kartu usulan .*diterapkan lalu diurungkan/.test(lanjut[1].teks) &&
        daftarTiga.length === daftarDua.length && daftarTiga[0].id === obrolanLama?.id && isiLama?.[0]?.pesan?.length === 4,
      JSON.stringify({ lanjut, daftarTiga: daftarTiga.map((o) => o.judul), n: isiLama?.[0]?.pesan?.length }));

    const hapus = await langkah(`hapus percakapan di ${lebar}`, `
      const tombolRiwayat = dialog().querySelector('button[aria-label="Riwayat percakapan"]');
      if (tombolRiwayat.getBoundingClientRect().width > 0) { tombolRiwayat.click(); await t(400); }
      dialog().querySelector('button[aria-label="Hapus percakapan catatan kedua ${lebar}"]').click(); await t(300);
      const tanya = /Hapus “catatan kedua ${lebar}”\\?/.test(dialog().innerText);
      tombol('Hapus', dialog().querySelector('ul[aria-label="Percakapan tersimpan"] li[class*=Hapus]')).click();
      await sampai(() => !dialog().innerText.includes('catatan kedua ${lebar}'), 20);
      return { tanya }`);
    const daftarAkhir = (await sb.rpc("daftar_obrolan")).data ?? [];
    cek(`${lebar}: hapus percakapan (dengan konfirmasi) → hilang dari daftar`, hapus?.tanya && daftarAkhir.length === daftarTiga.length - 1 && !daftarAkhir.some((o) => o.judul === `catatan kedua ${lebar}`), JSON.stringify({ hapus, daftarAkhir }));
    await langkah("tutup", `dialog()?.dispatchEvent(new Event('cancel', { cancelable: true })); await t(500); return 'ok'`);
  }

  // Layar ≥ 1280 px: daftar percakapan selalu di samping obrolan, tanpa tombol riwayat, tanpa gulir samping.
  await ukur(1440);
  await buka(`${base}/`, 6000);
  const samping = await langkah("daftar di samping di 1440", `
    document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
    await sampai(() => dialog().querySelector('ul[aria-label="Percakapan tersimpan"]'), 20);
    const lebarDaftar = dialog().querySelector('ul[aria-label="Percakapan tersimpan"]').getBoundingClientRect().width;
    return { lebarDaftar, obrolan: dialog().querySelector('[class*=gptRuang]').getBoundingClientRect().width, tombol: dialog().querySelector('button[aria-label="Riwayat percakapan"]').getBoundingClientRect().width, gulirSamping: document.documentElement.scrollWidth > innerWidth + 1 }`);
  cek("1440: daftar percakapan di samping obrolan, tombol riwayat tersembunyi", samping && samping.lebarDaftar > 100 && samping.obrolan > 300 && samping.tombol === 0 && !samping.gulirSamping, JSON.stringify(samping));
  await foto("asisten-samping-1440.png");

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
