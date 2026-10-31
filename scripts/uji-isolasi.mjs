/**
 * Uji isolasi antar akun: akun B (dan pengunjung tanpa login) tidak bisa
 * membaca, mengubah, menghapus, atau menumpang data akun A — lewat tabel,
 * view, fungsi (termasuk yang SECURITY DEFINER), maupun kolom rujukan
 * (pecahan_dari, induk_id, kantong_id, …) yang menunjuk baris milik A.
 *
 * Lewat API Supabase sungguhan dengan dua akun sementara yang dihapus di akhir,
 * seperti aplikasi memakainya. Tidak menyentuh data akun lain.
 *
 * Pemakaian: npm run uji:isolasi   (butuh .env.local dengan SUPABASE_SERVICE_ROLE_KEY)
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const klien = () => createClient(U, ANON, { auth: { persistSession: false } });
const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const RAHASIA = "Merchant Rahasia A";

let gagal = 0;
const cek = (nama, ok, info = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nama}${!ok && info ? ` — ${info}` : ""}`);
  if (!ok) gagal++;
};
const akun = [];
async function buatAkun(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Uji12345#", email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  akun.push(data.user.id);
  const sb = klien();
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password: "Uji12345#" });
  if (e2) throw e2;
  return { id: data.user.id, sb };
}
const satu = async (q) => {
  const { data, error } = await q.select().single();
  if (error) throw new Error(error.message);
  return data;
};

try {
  const A = await buatAkun("uji-isolasi-a-sementara@example.com");
  const B = await buatAkun("uji-isolasi-b-sementara@example.com");
  const anon = klien();

  // --- Data A di setiap tempat yang menyimpan data per akun.
  const kantongA = await satu(A.sb.from("user_accounts").insert({ user_id: A.id, name: "BCA A", kind: "bank", emoji: "🏦", saldo_awal: 1000000, saldo_sejak: "2026-01-01T00:00:00+07:00" }));
  const kategoriA = await satu(A.sb.from("categories").insert({ user_id: A.id, type: "expense", slug: "kursus-a", name: "Kursus A", icon: "graduation-cap", color: "#3e91ff" }));
  const budgetA = await satu(A.sb.from("budgets").insert({ user_id: A.id, category: "food", amount: 500000 }));
  const cicilanA = await satu(A.sb.from("cicilan").insert({ user_id: A.id, nama: "HP A", category: "shopping", nominal: 100000, tenor: 3, jatuh_tempo_awal: hariIni }));
  await satu(A.sb.from("metode_budget").upsert({ user_id: A.id, metode: "pyf", persen: { tabungan: 20 } }));
  const pushA = await satu(A.sb.from("push_langganan").insert({ user_id: A.id, endpoint: "https://contoh.invalid/a", p256dh: "x", auth: "y" }));
  const txA = await satu(A.sb.from("transactions").insert({ user_id: A.id, amount: 75000, type: "expense", category: "food", merchant: RAHASIA, description: "Catatan A", transaction_date: hariIni, kantong_id: kantongA.id, status: "confirmed", source: "text" }));
  const draftA = await satu(A.sb.from("transactions").insert({ user_id: A.id, amount: 0, type: "expense", category: "other", merchant: "Draft A", transaction_date: hariIni, status: "needs_review", source: "receipt" }));
  const { data: fotoTersimpan } = await A.sb.rpc("simpan_foto_draft", { p_id: draftA.id, p_foto: Buffer.from("foto A").toString("base64") });
  cek("Persiapan: data A tersimpan di semua tempat (termasuk foto draft)", fotoTersimpan === true);
  const saldoAwalA = (await A.sb.rpc("saldo_kantong")).data?.find((k) => k.id === kantongA.id)?.saldo;

  // Baris A per tabel/view, untuk dicari, diubah, dan dihapus oleh B & pengunjung.
  const BARIS = [
    ["user_accounts", "id", kantongA.id, { name: "Dibajak" }],
    ["categories", "id", kategoriA.id, { name: "Dibajak" }],
    ["budgets", "category", "food", { amount: 1 }],
    ["cicilan", "id", cicilanA.id, { nama: "Dibajak" }],
    ["metode_budget", "user_id", A.id, { metode: "kategori" }],
    ["push_langganan", "id", pushA.id, { endpoint: "https://contoh.invalid/b" }],
    ["transactions", "id", txA.id, { amount: 1, merchant: "Dibajak" }],
  ];
  // budgets milik A dicari lewat user_id (kategori "food" juga ada di B).
  const saring = (q, tabel, kolom, nilai) => (tabel === "budgets" ? q.eq("user_id", A.id).eq(kolom, nilai) : q.eq(kolom, nilai));

  for (const [siapa, sb] of [["B", B.sb], ["pengunjung", anon]]) {
    // 1. Baca.
    for (const [tabel, kolom, nilai] of BARIS) {
      const { data } = await saring(sb.from(tabel).select("*"), tabel, kolom, nilai);
      cek(`${siapa} tidak bisa membaca ${tabel} milik A`, (data ?? []).length === 0, JSON.stringify(data));
    }
    const { data: semuaTx } = await sb.from("transactions").select("user_id, merchant");
    cek(`${siapa} tidak melihat satu pun transaksi A`, !(semuaTx ?? []).some((t) => t.user_id === A.id || t.merchant === RAHASIA));
    const { data: draft } = await sb.from("draft_catat").select("transaksi_id");
    cek(`${siapa} tidak melihat draft A`, !(draft ?? []).some((d) => d.transaksi_id === draftA.id));

    // 2. Ubah & 3. hapus: tidak ada baris yang terkena.
    for (const [tabel, kolom, nilai, ubah] of BARIS) {
      const { data: diubah } = await saring(sb.from(tabel).update(ubah), tabel, kolom, nilai).select();
      const { data: dihapus } = await saring(sb.from(tabel).delete(), tabel, kolom, nilai).select();
      cek(`${siapa} tidak bisa mengubah/menghapus ${tabel} milik A`, (diubah ?? []).length === 0 && (dihapus ?? []).length === 0, JSON.stringify({ diubah, dihapus }));
    }

    // 4. Fungsi.
    const { data: foto } = await sb.rpc("foto_draft", { p_id: draftA.id });
    cek(`${siapa} tidak bisa mengambil foto draft A`, !foto, String(foto).slice(0, 40));
    const { data: tulisFoto } = await sb.rpc("simpan_foto_draft", { p_id: draftA.id, p_foto: Buffer.from("palsu").toString("base64") });
    cek(`${siapa} tidak bisa menimpa foto draft A`, tulisFoto !== true);
    const { error: hapusKat } = await sb.rpc("hapus_kategori", { p_id: kategoriA.id });
    cek(`${siapa} tidak bisa menghapus kategori A lewat hapus_kategori`, Boolean(hapusKat));
    const { data: saldo } = await sb.rpc("saldo_kantong");
    cek(`${siapa} tidak melihat saldo kantong A`, !(saldo ?? []).some((k) => k.id === kantongA.id));
    const { data: rerata } = await sb.rpc("get_avg_monthly_expense_by_category");
    cek(`${siapa} tidak mendapat rerata pengeluaran A`, (rerata ?? []).length === 0, JSON.stringify(rerata));
  }

  // 5. Menulis atas nama A.
  const sisip = [
    ["user_accounts", { user_id: A.id, name: "Palsu", kind: "bank", emoji: "🏦", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }],
    ["categories", { user_id: A.id, type: "expense", slug: "palsu", name: "Palsu", icon: "coins", color: "#3e91ff" }],
    ["budgets", { user_id: A.id, category: "transport", amount: 1 }],
    ["cicilan", { user_id: A.id, nama: "Palsu", category: "shopping", nominal: 1, tenor: 1, jatuh_tempo_awal: hariIni }],
    ["push_langganan", { user_id: A.id, endpoint: "https://contoh.invalid/palsu", p256dh: "x", auth: "y" }],
    ["transactions", { user_id: A.id, amount: 1, type: "expense", category: "food", transaction_date: hariIni, status: "confirmed", source: "text" }],
  ];
  for (const [tabel, isi] of sisip) {
    const { error } = await B.sb.from(tabel).insert(isi);
    cek(`B tidak bisa menulis ${tabel} atas nama A`, Boolean(error));
  }
  const { error: upsertMetode } = await B.sb.from("metode_budget").upsert({ user_id: A.id, metode: "kategori" });
  cek("B tidak bisa menimpa metode_budget A lewat upsert", Boolean(upsertMetode));

  // 6. Kolom rujukan ke baris milik A: tidak boleh diterima, dan tidak boleh
  //    menyalin isi baris A (trigger salin berjalan sebagai SECURITY DEFINER).
  const RUJUKAN = [
    ["pecahan_dari", txA.id],
    ["induk_id", txA.id],
    ["pelengkap_tujuan", txA.id],
    ["duplikat_dari", txA.id],
    ["kantong_id", kantongA.id],
    ["kantong_tujuan_id", kantongA.id],
    ["cicilan_id", cicilanA.id],
  ];
  for (const [kolom, id] of RUJUKAN) {
    const isi = { user_id: B.id, amount: 1000, type: kolom === "kantong_tujuan_id" ? "transfer" : "expense", category: "other", merchant: "Milik B", transaction_date: "2020-01-01", status: "confirmed", source: "text", [kolom]: id };
    // Balikan insert lewat view adalah isian B sendiri; yang disimpan dibaca ulang.
    const { data: masuk, error } = await B.sb.from("transactions").insert(isi).select("id").maybeSingle();
    const { data } = masuk ? await B.sb.from("transactions").select("merchant, transaction_date, kantong_id, payment_method").eq("id", masuk.id).single() : { data: null };
    const bocor = data && (data.merchant === RAHASIA || data.transaction_date === hariIni || data.kantong_id === kantongA.id || data.payment_method === "BCA A");
    cek(`B tidak bisa merujuk ${kolom} milik A`, Boolean(error) && !bocor, JSON.stringify({ data, error: error?.message }));
  }
  const kantongB = await satu(B.sb.from("user_accounts").insert({ user_id: B.id, name: "BCA B", kind: "bank", emoji: "🏦", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }));
  const { error: cicilanRujuk } = await B.sb.from("cicilan").insert({ user_id: B.id, nama: "Rujuk", category: "shopping", nominal: 1, tenor: 1, jatuh_tempo_awal: hariIni, kantong_id: kantongA.id });
  cek("B tidak bisa membuat cicilan dengan kantong milik A", Boolean(cicilanRujuk));
  const { data: txB } = await B.sb.from("transactions").insert({ user_id: B.id, amount: 1000, type: "expense", category: "food", merchant: "Milik B", transaction_date: hariIni, kantong_id: kantongB.id, status: "confirmed", source: "text" }).select("id").single();
  const { data: ubahRujuk } = await B.sb.from("transactions").update({ pecahan_dari: txA.id }).eq("id", txB.id).select("pecahan_dari");
  const { data: ubahKantong } = await B.sb.from("transactions").update({ kantong_id: kantongA.id }).eq("id", txB.id).select("kantong_id");
  cek("B tidak bisa mengubah transaksinya sendiri agar merujuk milik A", !(ubahRujuk ?? []).some((t) => t.pecahan_dari === txA.id) && !(ubahKantong ?? []).some((t) => t.kantong_id === kantongA.id), JSON.stringify({ ubahRujuk, ubahKantong }));

  // 7. Semua milik A tetap utuh.
  const utuh = async (tabel, kolom, nilai, cocok) => {
    const { data } = await A.sb.from(tabel).select("*").eq(kolom, nilai);
    return (data ?? []).length === 1 && cocok(data[0]);
  };
  const rusak = [];
  for (const [tabel, kolom, nilai, cocok] of [
    ["user_accounts", "id", kantongA.id, (r) => r.name === "BCA A"],
    ["categories", "id", kategoriA.id, (r) => r.name === "Kursus A"],
    // budgets berkunci (user_id, category); A hanya melihat miliknya sendiri.
    ["budgets", "category", budgetA.category, (r) => Number(r.amount) === 500000],
    ["cicilan", "id", cicilanA.id, (r) => r.nama === "HP A"],
    ["metode_budget", "user_id", A.id, (r) => r.metode === "pyf"],
    ["push_langganan", "id", pushA.id, (r) => r.endpoint === "https://contoh.invalid/a"],
    ["transactions", "id", txA.id, (r) => r.merchant === RAHASIA && Number(r.amount) === 75000],
  ]) {
    if (!(await utuh(tabel, kolom, nilai, cocok))) rusak.push(tabel);
  }
  cek("Data A tetap utuh setelah semua percobaan", rusak.length === 0, rusak.join(", "));
  const { data: fotoA } = await A.sb.rpc("foto_draft", { p_id: draftA.id });
  cek("Foto draft A tidak tertimpa", Buffer.from(fotoA ?? "", "base64").toString() === "foto A");
  const saldoA = (await A.sb.rpc("saldo_kantong")).data?.find((k) => k.id === kantongA.id)?.saldo;
  cek("Saldo kantong A tidak terpengaruh transaksi B", Number(saldoA) === Number(saldoAwalA), JSON.stringify({ saldoAwalA, saldoA }));
  // Mengubah transaksi A tidak boleh ikut mengubah baris B yang (sempat) merujuknya.
  await A.sb.from("transactions").update({ transaction_date: "2026-01-02" }).eq("id", txA.id);
  const { data: barisB } = await admin.from("transactions").select("id, transaction_date").eq("user_id", B.id);
  cek("Mengubah transaksi A tidak mengubah baris milik B", !(barisB ?? []).some((t) => t.transaction_date === "2026-01-02"), JSON.stringify(barisB));
} catch (e) {
  gagal++;
  console.log("✗ GAGAL:", e.message);
} finally {
  for (const id of akun) await admin.auth.admin.deleteUser(id);
  console.log(`\n${gagal ? `${gagal} cek gagal` : "✓ isolasi antar akun: baca, ubah, hapus, tulis atas nama orang lain, fungsi, dan kolom rujukan"} · akun uji dihapus`);
  process.exit(gagal ? 1 : 0);
}
