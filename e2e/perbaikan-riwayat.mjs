// Perbaikan temuan 2.9.0, bagian Riwayat (SPEC-perbaikan-temuan A1–A6, B1/B2 sisi Riwayat):
// kartu bagian pecahan saat disaring, hitungan per transaksi, halaman "Muat lagi"
// tidak memisahkan bagian, pecah/gabung atomik (RPC), kartu bagian terpilih,
// header Beranda, satu panel saat Tanya AI terbuka, filter merchant= & tujuan=tanpa.
import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, jalankan, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-perbaikan-riwayat-sementara@example.com", SANDI = "Uji12345#";
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const geser = (n) => { const d = new Date(`${hariIni}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ukur = async (w, h = 860) => { await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await tidur(700); };
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ");
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const { data: tunai } = await sb.from("user_accounts").select("id").eq("name", "Tunai").single();
  const { data: hp, error: eHp } = await sb.from("user_accounts").insert({ user_id: uid, name: "HP baru", kind: "tujuan", emoji: "🎯", saldo_awal: 3000000, saldo_sejak: "2026-01-01T00:00:00+07:00", target: 5000000 }).select("id").single();
  if (eHp) throw eHp;
  const tx = (r) => ({ user_id: uid, status: "confirmed", source: "text", category: "transport", type: "expense", kantong_id: tunai.id, payment_method: "Tunai", ...r });

  // Urutan Riwayat (terbaru dulu): 6 baris (Kopi ×3, Toko HP, 4 Warung hari ini dihitung di 93)
  // + Alfamart 2 baris; total 99 baris sebelum Superindo (3 baris) → halaman pertama
  // (100 baris) memotong Superindo, yang harus ditunda utuh ke "Muat lagi".
  const { error: e1 } = await sb.from("transactions").insert([
    tx({ amount: 25000, category: "food", merchant: "Kopi Kenangan", transaction_date: hariIni }),
    tx({ amount: 20000, category: "food", merchant: "  kopi   kenangan ", transaction_date: geser(-1) }),
    tx({ amount: 10000, category: "food", merchant: "Kopi Kenangan Mantan", transaction_date: geser(-1) }),
    tx({ amount: 2000000, category: "shopping", merchant: "Toko HP", transaction_date: geser(-3), kantong_id: hp.id, payment_method: "HP baru" }),
    ...Array.from({ length: 93 }, (_, i) => tx({ amount: 1000, merchant: `Warung ${i}`, transaction_date: i < 4 ? hariIni : geser(-2 - (i % 19)) })),
    ...Array.from({ length: 10 }, (_, i) => tx({ amount: 500, merchant: `Lama ${i}`, transaction_date: geser(-40) })),
  ]);
  if (e1) throw e1;
  const asli = async (merchant, amount, tanggal) => (await sb.from("transactions").insert(tx({ amount, category: "groceries", merchant, transaction_date: tanggal })).select("id").single()).data.id;
  const superindo = await asli("Superindo", 30000, geser(-30));
  const alfamart = await asli("Alfamart", 15000, hariIni);
  const baris = async (id) => (await sb.from("transactions").select("id, amount, category, pecahan_dari").or(`id.eq.${id},pecahan_dari.eq.${id}`)).data ?? [];

  // --- A3: simpan_pecahan / gabung_pecahan atomik.
  const bagian = (...b) => b.map(([amount, category, id]) => ({ id: id ?? null, amount, category, kelompok: null, description: null }));
  let r = await sb.rpc("simpan_pecahan", { p_id: alfamart, p_bagian: bagian([10000, "groceries", alfamart], [4000, "food"]) });
  cek("RPC: jumlah ≠ total ditolak", /total semula/.test(r.error?.message ?? ""), r.error?.message);
  r = await sb.rpc("simpan_pecahan", { p_id: alfamart, p_bagian: bagian([5000, "groceries", alfamart], [5000, "food"], [5000, "tidak-ada"]) });
  let rows = await baris(alfamart);
  cek("RPC: gagal di tengah (kategori asing) → tidak ada yang berubah", Boolean(r.error) && rows.length === 1 && Number(rows[0].amount) === 15000, JSON.stringify({ e: r.error?.message, rows }));
  r = await sb.rpc("simpan_pecahan", { p_id: crypto.randomUUID(), p_bagian: bagian([1, "food"]) });
  cek("RPC: transaksi asing/tidak ada ditolak", /tidak ditemukan/.test(r.error?.message ?? ""), r.error?.message);
  r = await sb.rpc("simpan_pecahan", { p_id: alfamart, p_bagian: bagian([10000, "groceries", alfamart], [5000, "food"]) });
  rows = await baris(alfamart);
  cek("RPC: pecah Alfamart 10.000 + 5.000", !r.error && r.data === 2 && rows.length === 2 && rows.some((x) => x.pecahan_dari === alfamart && Number(x.amount) === 5000 && x.category === "food"), JSON.stringify({ e: r.error?.message, rows }));
  r = await sb.rpc("simpan_pecahan", { p_id: superindo, p_bagian: bagian([12000, "groceries", superindo], [10000, "food"], [8000, "food"]) });
  rows = await baris(superindo);
  cek("RPC: pecah Superindo 12.000 + 10.000 + 8.000", !r.error && rows.length === 3, JSON.stringify({ e: r.error?.message, rows }));
  // Ubah bagian lama + hapus satu + tambah satu, sekali jalan.
  const lama = rows.filter((x) => x.pecahan_dari);
  r = await sb.rpc("simpan_pecahan", { p_id: superindo, p_bagian: bagian([11000, "groceries", superindo], [11000, "food", lama[0].id], [8000, "food"]) });
  rows = await baris(superindo);
  cek("RPC: atur ulang (ubah, hapus, tambah) tetap total 30.000", !r.error && rows.length === 3 && rows.reduce((n, x) => n + Number(x.amount), 0) === 30000 && rows.some((x) => x.id === lama[0].id && Number(x.amount) === 11000) && !rows.some((x) => x.id === lama[1].id), JSON.stringify({ e: r.error?.message, rows }));
  r = await sb.rpc("simpan_pecahan", { p_id: superindo, p_bagian: bagian([12000, "groceries", superindo], [10000, "food", lama[0].id], [8000, "food"]) });

  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  const keadaan = () =>
    jalankan(`(()=>({
      url: location.pathname + location.search,
      sub: document.querySelector('header p')?.innerText.replace(/\\s+/g, ' '),
      hari: [...document.querySelectorAll('section h3')].map(h => h.innerText.replace(/\\s+/g, ' ')),
      kartu: [...document.querySelectorAll('[class*=panelDaftar] section a')].map(a => a.innerText.replace(/\\s+/g, ' ')),
      kaki: [...document.querySelectorAll('button')].find(b => b.innerText.startsWith('Muat lagi'))?.innerText,
      chips: [...document.querySelectorAll('[aria-label="Saring transaksi"] button')].map(b => b.innerText.trim()),
    }))()`);
  const kartu = (k, merchant) => norm(k.kartu.find((x) => x.startsWith(merchant + " ")));

  // --- A2: hitungan per transaksi & halaman tidak memisahkan bagian.
  await buka(`${base}/riwayat`, 9000);
  let k = await keadaan();
  cek("Subjudul: 109 transaksi (bagian dihitung satu)", /^109 transaksi · keluar/.test(k.sub), k.sub);
  cek("Halaman pertama: 98 kartu, Superindo ditunda utuh", k.kartu.length === 98 && !kartu(k, "Superindo"), `kartu=${k.kartu.length}`);
  cek("Muat lagi · 11 transaksi lebih lama", norm(k.kaki) === "Muat lagi · 11 transaksi lebih lama", k.kaki);
  cek("Alfamart tanpa filter: satu kartu Rp 15.000 · 2 bagian", /2 bagian/.test(kartu(k, "Alfamart")) && /Rp 15\.000$/.test(kartu(k, "Alfamart")), kartu(k, "Alfamart"));
  await langkah("muat lagi", `[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('Muat lagi')).click(); await sampai(() => document.body.innerText.includes('Superindo')); await t(500); return 'ok'`);
  k = await keadaan();
  cek("Setelah Muat lagi: 109 kartu, Superindo utuh Rp 30.000 · 3 bagian, tanpa Muat lagi", k.kartu.length === 109 && /3 bagian/.test(kartu(k, "Superindo")) && /Rp 30\.000$/.test(kartu(k, "Superindo")) && !k.kaki, `kartu=${k.kartu.length} | ${kartu(k, "Superindo")} | ${k.kaki}`);

  // --- A1: hanya bagian yang cocok filter.
  await buka(`${base}/riwayat?kategori=expense:groceries`, 7000);
  k = await keadaan();
  cek("Filter Belanja harian: Alfamart Rp 10.000, Bagian dari Rp 15.000", /Bagian dari Rp 15\.000/.test(kartu(k, "Alfamart")) && /Rp 10\.000$/.test(kartu(k, "Alfamart")), kartu(k, "Alfamart"));
  cek("Filter Belanja harian: 2 transaksi, total = kartu (Rp 22.000), hari ini −Rp 10.000", /^2 transaksi · keluar Rp 22\.000$/.test(k.sub) && k.hari.some((h) => h === "Hari ini −Rp 10.000"), `${k.sub} | ${JSON.stringify(k.hari)}`);
  await foto("a1-belanja-harian.png");
  await buka(`${base}/riwayat?kategori=expense:food`, 7000);
  k = await keadaan();
  cek("Filter Makan: Superindo satu kartu 2 dari 3 bagian, Rp 18.000", /2 dari 3 bagian/.test(kartu(k, "Superindo")) && /Bagian dari Rp 30\.000/.test(kartu(k, "Superindo")) && /Rp 18\.000$/.test(kartu(k, "Superindo")), kartu(k, "Superindo"));
  cek("Filter Makan: Alfamart Rp 5.000; hari ini −Rp 30.000; 5 transaksi", /Rp 5\.000$/.test(kartu(k, "Alfamart")) && k.hari.includes("Hari ini −Rp 30.000") && /^5 transaksi/.test(k.sub), `${kartu(k, "Alfamart")} | ${JSON.stringify(k.hari.slice(0, 2))} | ${k.sub}`);

  // --- B1: merchant persis.
  await buka(`${base}/riwayat?merchant=${encodeURIComponent("KOPI kenangan")}`, 7000);
  k = await keadaan();
  cek("merchant=: 2 transaksi (beda huruf/spasi ikut, Kopi Kenangan Mantan tidak)", /^2 transaksi · keluar Rp 45\.000$/.test(k.sub) && k.kartu.length === 2 && !k.kartu.some((x) => x.includes("Mantan")), `${k.sub} | ${k.kartu.length}`);
  cek("merchant=: chip Merchant: KOPI kenangan", k.chips.includes("Merchant: KOPI kenangan"), JSON.stringify(k.chips));
  const lepas = await langkah("lepas chip merchant", `[...document.querySelectorAll('[aria-label="Saring transaksi"] button')].find(b => b.innerText.startsWith('Merchant:')).click(); await sampai(() => !location.search.includes('merchant')); await t(1500); return location.pathname + location.search`);
  cek("Chip merchant dilepas → /riwayat", lepas === "/riwayat", lepas);

  // --- B2: tanpa pembelian dari tujuan tabungan.
  await buka(`${base}/riwayat?jenis=keluar&tujuan=tanpa`, 7000);
  k = await keadaan();
  cek("tujuan=tanpa: Toko HP (dari tujuan) disembunyikan, 108 transaksi", !k.kartu.some((x) => x.startsWith("Toko HP")) && /^108 transaksi/.test(k.sub), k.sub);
  cek("tujuan=tanpa: chip Tanpa dari tujuan tabungan", k.chips.includes("Tanpa dari tujuan tabungan"), JSON.stringify(k.chips));
  await buka(`${base}/riwayat?jenis=keluar&tujuan=ya`, 7000);
  k = await keadaan();
  cek("tujuan=ya diabaikan: Toko HP tampil, 109 transaksi", k.kartu.some((x) => x.startsWith("Toko HP")) && /^109 transaksi/.test(k.sub), k.sub);

  // --- A2/A5: Beranda 5 transaksi, header = pengeluaran sebenarnya hari ini.
  await buka(`${base}/`, 8000);
  const beranda = await langkah("Beranda", `const kotak = [...document.querySelectorAll('a')].find(a => a.innerText.trim() === 'Lihat semua riwayat').parentElement; return { kartu: [...kotak.querySelectorAll('section a')].length, hari: [...kotak.querySelectorAll('section h2')].map(h => h.innerText.replace(/\\s+/g, ' ')) }`);
  cek("Beranda: 5 kartu walau ada transaksi dipecah", beranda?.kartu === 5, JSON.stringify(beranda));
  cek("Beranda: Hari ini −Rp 44.000 (semua pengeluaran hari ini, bukan hanya 5 kartu)", beranda?.hari?.[0] === "Hari ini −Rp 44.000", JSON.stringify(beranda?.hari));

  // --- A4: kartu bagian yang dibuka bertanda terpilih (dua panel).
  await ukur(1024);
  await buka(`${base}/riwayat?kategori=expense:food`, 7000);
  const pilih = await langkah("klik kartu bagian Alfamart", `const a = [...document.querySelectorAll('[class*=panelDaftar] section a')].find(a => a.innerText.startsWith('Alfamart')); a.click(); await sampai(() => document.querySelector('[class*=panelDetail]')?.innerText.includes('15.000')); await t(300); return { url: location.search, terpilih: document.querySelector('[class*=panelDaftar] a[aria-current="true"]')?.innerText.split('\\n')[0] }`);
  cek("A4: kartu bagian ber-aria-current, ?id= transaksi asli", pilih?.terpilih === "Alfamart" && pilih.url.endsWith(`id=${alfamart}`), JSON.stringify(pilih));

  // --- A6: panel Tanya AI terbuka → Riwayat satu panel bila ruangnya < 840px.
  for (const [w, dua] of [[1300, false], [1500, true]]) {
    await ukur(w);
    await buka(`${base}/`, 7000);
    await langkah(`buka Tanya ${w}`, `document.querySelector('button[aria-label="Tanya AI soal keuanganmu"]').click(); await sampai(() => dialog()); await t(500); document.querySelector('nav a[href="/riwayat"]').click(); await sampai(() => location.pathname === '/riwayat'); await t(3000); return 'ok'`);
    const tata = await langkah(`Riwayat + Tanya ${w}`, `const dp = document.querySelector('[class*=duaPanel]'); return { tanya: !!dialog() && !dialog().matches(':modal'), tampil: getComputedStyle(dp).display, kanan: getComputedStyle(document.querySelector('[class*=panelDetail]')).display }`);
    cek(`A6 ${w}px + Tanya: ${dua ? "dua panel" : "satu panel"}`, tata?.tanya && (dua ? tata.tampil === "grid" : tata.tampil === "block" && tata.kanan === "none"), JSON.stringify(tata));
    if (!dua) {
      const det = await langkah(`klik transaksi ${w}`, `[...document.querySelectorAll('[class*=panelDaftar] section a')].find(a => a.innerText.startsWith('Kopi Kenangan')).click(); await sampai(() => document.querySelector('[class*=panelDetail]')?.innerText.includes('25.000')); await t(500); const kb = document.querySelector('[class*=panelDetail] a[aria-label="Kembali"]'); return { daftar: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display, kembali: kb && getComputedStyle(kb).display }`);
      cek(`A6 ${w}px + Tanya: detail mengisi halaman dengan tombol kembali`, det?.daftar === "none" && det.kembali && det.kembali !== "none", JSON.stringify(det));
      await foto(`a6-${w}-tanya-detail.png`);
      const tutup = await langkah(`tutup Tanya ${w}`, `dialog().querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await t(600); return { tampil: getComputedStyle(document.querySelector('[class*=duaPanel]')).display, daftar: getComputedStyle(document.querySelector('[class*=panelDaftar]')).display }`);
      cek(`A6 ${w}px: Tanya ditutup → dua panel lagi`, tutup?.tampil === "grid" && tutup.daftar !== "none", JSON.stringify(tutup));
    }
  }

  // --- A3 lewat UI: Gabungkan lagi jadi satu.
  await ukur(360);
  await buka(`${base}/transactions/${superindo}`, 6000);
  await langkah("gabung", `[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('Atur pecahan')).click(); await sampai(() => dialog()?.innerText.includes('Bagian 3')); tombol('Gabungkan lagi', dialog()).click(); await sampai(() => tombol('Gabungkan', dialog())?.textContent.trim() === 'Gabungkan'); [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === 'Gabungkan').click(); await sampai(() => /Digabung lagi/.test(document.body.innerText), 20); await t(1500); return 'ok'`);
  rows = await baris(superindo);
  cek("Gabung lewat UI: satu baris Rp 30.000 Belanja harian", rows.length === 1 && Number(rows[0].amount) === 30000 && rows[0].category === "groceries", JSON.stringify(rows));

  console.log(masalah.length ? `masalah konsol: ${masalah.slice(0, 3).join(" | ")}` : "konsol bersih");
  cek("tidak ada error di console", masalah.length === 0, masalah.slice(0, 3).join(" | "));
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
