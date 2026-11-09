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
  const kantongA = await satu(A.sb.from("user_accounts").insert({ user_id: A.id, name: "BCA A", kind: "bank", emoji: "🏦", saldo_awal: 1000000, saldo_sejak: "2026-01-01T00:00:00+07:00", nomor_akhir: "1111" }));
  const kategoriA = await satu(A.sb.from("categories").insert({ user_id: A.id, type: "expense", slug: "kursus-a", name: "Kursus A", icon: "graduation-cap", color: "#3e91ff" }));
  const budgetA = await satu(A.sb.from("budgets").insert({ user_id: A.id, category: "food", amount: 500000 }));
  const cicilanA = await satu(A.sb.from("cicilan").insert({ user_id: A.id, nama: "HP A", category: "shopping", nominal: 100000, tenor: 3, jatuh_tempo_awal: hariIni }));
  await satu(A.sb.from("metode_budget").upsert({ user_id: A.id, metode: "pyf", persen: { tabungan: 20 } }));
  const pushA = await satu(A.sb.from("push_langganan").insert({ user_id: A.id, endpoint: "https://contoh.invalid/a", p256dh: "x", auth: "y" }));
  // Dari rekening koran (SPEC-impor-rekening): pengenal baris & tanda perlu dilengkapi.
  const txA = await satu(A.sb.from("transactions").insert({ user_id: A.id, amount: 75000, type: "expense", category: "food", merchant: RAHASIA, description: "Catatan A", transaction_date: hariIni, kantong_id: kantongA.id, status: "confirmed", source: "statement", ref_bank: "uji:ref-a", perlu_dilengkapi: true }));
  const draftA = await satu(A.sb.from("transactions").insert({ user_id: A.id, amount: 0, type: "expense", category: "other", merchant: "Draft A", transaction_date: hariIni, status: "needs_review", source: "receipt" }));
  // Simpanan (SPEC-simpanan): deposito di dalam BCA A, beserta periodenya.
  const { data: depoA, error: eDepo } = await A.sb.rpc("buat_simpanan", {
    p_kantong: { name: "Deposito A", emoji: "🏦", induk_id: kantongA.id, macam_simpanan: "deposito", saldo: 200000 },
    p_termasuk: true,
    p_deposito: { bunga_persen: 4.5, tenor: 1, satuan_tenor: "bulan", pajak_persen: 0, perpanjangan: "sekali" },
    p_periode: { mulai: hariIni, jatuh_tempo: "2099-01-01", bunga_kotor: 1, pajak: 0, bunga_bersih: 1 },
  });
  if (eDepo) throw new Error(eDepo.message);
  const perA = await satu(A.sb.from("deposito_periode").select("id").eq("deposito_id", depoA).limit(1));
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
    ["deposito", "kantong_id", depoA, { selesai: true }],
    ["deposito_periode", "id", perA.id, { bunga_diterima: 1 }],
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
    const { error: tutup } = await sb.rpc("tutup_periode_deposito", { p_periode: perA.id, p_bunga: 1000, p_cair: true, p_keterangan: "x" });
    cek(`${siapa} tidak bisa mencairkan deposito A lewat tutup_periode_deposito`, Boolean(tutup));
    const { error: urung } = await sb.rpc("urungkan_tutup_periode", { p_periode: perA.id });
    cek(`${siapa} tidak bisa mengurungkan periode deposito A lewat urungkan_tutup_periode`, Boolean(urung));
    const { error: hapusSimpanan } = await sb.rpc("hapus_simpanan", { p_id: depoA });
    cek(`${siapa} tidak bisa menghapus simpanan A lewat hapus_simpanan`, Boolean(hapusSimpanan));
    const { error: buatDiA } = await sb.rpc("buat_simpanan", { p_kantong: { name: "Numpang", emoji: "🏦", induk_id: kantongA.id, macam_simpanan: "tabungan", saldo: 0 }, p_termasuk: false });
    cek(`${siapa} tidak bisa membuat simpanan di dalam kantong A lewat buat_simpanan`, Boolean(buatDiA));
    const { data: rerata } = await sb.rpc("get_avg_monthly_expense_by_category");
    cek(`${siapa} tidak mendapat rerata pengeluaran A`, (rerata ?? []).length === 0, JSON.stringify(rerata));
    // Impor rekening koran: pengenal baris A tidak terlihat; RPC impor tidak menyentuh milik A.
    const { data: refAda } = await sb.rpc("ref_bank_ada", { p_ref: ["uji:ref-a"] });
    cek(`${siapa} tidak melihat pengenal rekening koran A lewat ref_bank_ada`, !(refAda ?? []).length, JSON.stringify(refAda));
    await sb.rpc("impor_rekening", {
      p: {
        tautkan: [{ id: txA.id, ref_bank: "uji:curian", ref_bank_tujuan: "uji:curian-2" }],
        perbarui: [{ id: txA.id, amount: 1, description: "x" }],
        nomor_akhir: [{ id: kantongA.id, nomor_akhir: "9999" }],
        saldo: [{ kantong_id: kantongA.id, saldo_awal: 1, saldo_sejak: "2026-01-01T00:00:00+07:00" }],
      },
    });
    const { error: imporKeA } = await sb.rpc("impor_rekening", {
      p: { sisip: [{ kunci: "t0", type: "expense", amount: 1, category: "other", merchant: "x", transaction_date: hariIni, kantong_id: kantongA.id, ref_bank: "uji:sisip" }] },
    });
    cek(`${siapa} tidak bisa mengimpor transaksi ke kantong A lewat impor_rekening`, Boolean(imporKeA));
    const { error: simpananDiA } = await sb.rpc("impor_rekening", {
      p: { kantong_baru: [{ kunci: "baru:x", name: "Pocket curian", emoji: "🐷", kind: "simpanan", induk_id: kantongA.id, macam_simpanan: "tabungan", saldo_awal: 0, nomor_akhir: "" }] },
    });
    cek(`${siapa} tidak bisa membuat simpanan di kantong A lewat impor_rekening`, Boolean(simpananDiA));
    // Deposito jatuh tempo dari rekening koran (SPEC-deposito-jatuh-tempo).
    const { error: tutupDariRek } = await sb.rpc("impor_rekening", { p: { tutup: [{ periode: perA.id, deposito: depoA, bunga: 1, cair: true, transaksi: [], baru: null }] } });
    cek(`${siapa} tidak bisa menutup periode deposito A lewat impor_rekening`, Boolean(tutupDariRek));
    const { error: sesuaikanA } = await sb.rpc("impor_rekening", { p: { sesuaikan: [{ periode: perA.id, bunga: 1, transaksi: { id: txA.id, amount: 1, description: "x" }, tambah: null, berikut: null, tanggal: [{ id: txA.id, transaction_date: "2026-01-03", waktu: null }] }] } });
    cek(`${siapa} tidak bisa mengubah bunga deposito A lewat impor_rekening`, Boolean(sesuaikanA));
    const { error: jadikanA } = await sb.rpc("impor_rekening", {
      p: { jadikan: [{ kantong_id: depoA, bunga_persen: 5, tenor: 1, satuan_tenor: "bulan", pajak_persen: 0, perpanjangan: "sekali", periode: { kunci: "periode:x", mulai: hariIni, jatuh_tempo: "2099-01-01", pokok: 1, bunga_kotor: 0, pajak: 0, bunga_bersih: 0 } }] },
    });
    cek(`${siapa} tidak bisa menjadikan kantong A deposito lewat impor_rekening`, Boolean(jadikanA));
    await sb.rpc("impor_rekening", { p: { hapus: [txA.id] } });
    // Pindah antar rekening sendiri (SPEC-impor-rekening R2): transaksi A tidak bisa diubah jadi pindah kantong.
    await sb.rpc("impor_rekening", { p: { ubah_pindah: [{ id: txA.id, kantong_id: kantongA.id, kantong_tujuan_id: kantongA.id, ref_bank: "uji:curian-3", ref_bank_tujuan: "uji:curian-4", merchant: "x" }] } });
    // Penautan ulang (SPEC-kantong-sendiri A-3): transaksi & kantong A tidak bisa dijadikan/diurungkan pindah kantong.
    const { error: jadikanPindahA } = await sb.rpc("jadikan_pindah", { p: { ubah: [{ id: txA.id, updated_at: txA.updated_at, kantong_lawan: kantongA.id, merchant: "x", gabung: null }] } });
    cek(`${siapa} tidak bisa menjadikan transaksi A pindah kantong lewat jadikan_pindah`, Boolean(jadikanPindahA));
    const { error: urungPindahA } = await sb.rpc("urungkan_jadikan_pindah", {
      p: { salinan: [{ id: txA.id, sesudah: txA.updated_at, semula: { type: "income", category: "other", merchant: "Dibajak", kantong_id: kantongA.id }, gabung: null }] },
    });
    cek(`${siapa} tidak bisa mengubah transaksi A lewat urungkan_jadikan_pindah`, Boolean(urungPindahA));
    const { data: ganti } = await sb.rpc("ganti_penempatan", { p_deposito: depoA });
    cek(`${siapa} tidak bisa mengganti penempatan deposito A lewat ganti_penempatan`, !ganti, JSON.stringify(ganti));
    const { error: urungGanti } = await sb.rpc("urungkan_ganti_penempatan", {
      p: {
        pengeluaran: { id: txA.id, user_id: A.id, amount: 1, type: "expense", category: "other", transaction_date: hariIni, kantong_id: kantongA.id, status: "confirmed", source: "statement" },
        transfer: { id: txA.id, transaction_date: "2026-01-02", waktu: null },
        kantong: { id: kantongA.id, saldo_per: "2026-01-01", saldo_sejak: "2026-01-01T00:00:00+07:00" },
      },
    });
    cek(`${siapa} tidak bisa menimpa transaksi/kantong A lewat urungkan_ganti_penempatan`, Boolean(urungGanti));
    const { data: nomorDiubah } = await sb.from("user_accounts").update({ nomor_akhir: "8888" }).eq("id", kantongA.id).select("id");
    cek(`${siapa} tidak bisa mengubah nomor_akhir kantong A`, !(nomorDiubah ?? []).length);
  }

  // 5. Menulis atas nama A.
  const sisip = [
    ["user_accounts", { user_id: A.id, name: "Palsu", kind: "bank", emoji: "🏦", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }],
    ["categories", { user_id: A.id, type: "expense", slug: "palsu", name: "Palsu", icon: "coins", color: "#3e91ff" }],
    ["budgets", { user_id: A.id, category: "transport", amount: 1 }],
    ["cicilan", { user_id: A.id, nama: "Palsu", category: "shopping", nominal: 1, tenor: 1, jatuh_tempo_awal: hariIni }],
    ["push_langganan", { user_id: A.id, endpoint: "https://contoh.invalid/palsu", p256dh: "x", auth: "y" }],
    ["transactions", { user_id: A.id, amount: 1, type: "expense", category: "food", transaction_date: hariIni, status: "confirmed", source: "text" }],
    ["deposito", { kantong_id: depoA, user_id: A.id, bunga_persen: 5, tenor: 1, satuan_tenor: "bulan", pajak_persen: 0, perpanjangan: "sekali" }],
    ["deposito_periode", { user_id: A.id, deposito_id: depoA, ke: 9, mulai: hariIni, jatuh_tempo: "2099-01-01", pokok: 1, bunga_kotor: 0, pajak: 0, bunga_bersih: 0 }],
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
  // Simpanan & tujuan hanya di dalam kantong sendiri; deposito & periodenya hanya untuk kantong sendiri.
  for (const [nama, isi] of [
    ["simpanan", { user_id: B.id, name: "Pocket B", kind: "simpanan", macam_simpanan: "tabungan", induk_id: kantongA.id, emoji: "🐷", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }],
    ["tujuan", { user_id: B.id, name: "Tujuan B", kind: "tujuan", target: 1000, induk_id: kantongA.id, emoji: "🎯", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }],
  ]) {
    const { error } = await B.sb.from("user_accounts").insert(isi);
    cek(`B tidak bisa membuat ${nama} dengan induk kantong milik A`, Boolean(error));
  }
  const tujuanB = await satu(B.sb.from("user_accounts").insert({ user_id: B.id, name: "Tujuan B2", kind: "tujuan", target: 1000, emoji: "🎯", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }));
  const { data: tujuanPindah } = await B.sb.from("user_accounts").update({ induk_id: kantongA.id }).eq("id", tujuanB.id).select("induk_id");
  cek("B tidak bisa memindah tujuannya ke dalam kantong milik A", !(tujuanPindah ?? []).some((k) => k.induk_id === kantongA.id), JSON.stringify(tujuanPindah));
  const { error: depoRujuk } = await B.sb.from("deposito").insert({ kantong_id: depoA, user_id: B.id, bunga_persen: 5, tenor: 1, satuan_tenor: "bulan", pajak_persen: 0, perpanjangan: "sekali" });
  cek("B tidak bisa memasang deposito pada kantong milik A", Boolean(depoRujuk));
  const { error: periodeRujuk } = await B.sb.from("deposito_periode").insert({ user_id: B.id, deposito_id: depoA, ke: 9, mulai: hariIni, jatuh_tempo: "2099-01-01", pokok: 1, bunga_kotor: 0, pajak: 0, bunga_bersih: 0 });
  cek("B tidak bisa menambah periode ke deposito milik A", Boolean(periodeRujuk));
  const { data: txB } = await B.sb.from("transactions").insert({ user_id: B.id, amount: 1000, type: "expense", category: "food", merchant: "Milik B", transaction_date: hariIni, kantong_id: kantongB.id, status: "confirmed", source: "text" }).select("id").single();
  const { data: ubahRujuk } = await B.sb.from("transactions").update({ pecahan_dari: txA.id }).eq("id", txB.id).select("pecahan_dari");
  const { data: ubahKantong } = await B.sb.from("transactions").update({ kantong_id: kantongA.id }).eq("id", txB.id).select("kantong_id");
  cek("B tidak bisa mengubah transaksinya sendiri agar merujuk milik A", !(ubahRujuk ?? []).some((t) => t.pecahan_dari === txA.id) && !(ubahKantong ?? []).some((t) => t.kantong_id === kantongA.id), JSON.stringify({ ubahRujuk, ubahKantong }));

  // jadikan_pindah: transaksi rekening koran B sendiri tidak bisa dipindah ke kantong A, dan
  // sisi lawan yang "digabung" (dihapus) tidak bisa milik A.
  const txBS = await satu(B.sb.from("transactions").insert({ user_id: B.id, amount: 75000, type: "expense", category: "other", merchant: "Top up B", transaction_date: hariIni, kantong_id: kantongB.id, status: "confirmed", source: "statement", ref_bank: "uji:ref-b-pindah" }));
  // updated_at dibaca ulang: balikan insert lewat view bukan nilai yang tersimpan.
  Object.assign(txBS, (await B.sb.from("transactions").select("updated_at").eq("id", txBS.id).single()).data);
  const { error: pindahKeA } = await B.sb.rpc("jadikan_pindah", { p: { ubah: [{ id: txBS.id, updated_at: txBS.updated_at, kantong_lawan: kantongA.id, merchant: "x", gabung: null }] } });
  cek("B tidak bisa menjadikan transaksinya pindah ke kantong A lewat jadikan_pindah", Boolean(pindahKeA));
  const danaB = await satu(B.sb.from("user_accounts").insert({ user_id: B.id, name: "DANA B", kind: "ewallet", emoji: "📱", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }));
  const { error: gabungA } = await B.sb.rpc("jadikan_pindah", { p: { ubah: [{ id: txBS.id, updated_at: txBS.updated_at, kantong_lawan: danaB.id, merchant: "x", gabung: { id: txA.id, updated_at: txA.updated_at } }] } });
  cek("B tidak bisa menghapus transaksi A sebagai sisi lawan lewat jadikan_pindah", Boolean(gabungA));
  const { data: txBSlagi } = await B.sb.from("transactions").select("type").eq("id", txBS.id).single();
  cek("Gagal = tidak ada yang berubah (atomik)", txBSlagi?.type === "expense", JSON.stringify(txBSlagi));

  // Pengenal baris unik per akun, bukan global: B boleh memakai pengenal yang sama
  // (kalau unik global, galat "sudah ada" membocorkan bahwa A punya baris itu).
  const { error: refSama } = await B.sb.from("transactions").insert({ user_id: B.id, amount: 1, type: "expense", category: "other", transaction_date: hariIni, kantong_id: kantongB.id, status: "confirmed", source: "statement", ref_bank: "uji:ref-a" });
  cek("B bisa memakai pengenal baris yang sama dengan A (unik per akun, tidak bocor)", !refSama, refSama?.message);

  // 7. Semua milik A tetap utuh.
  const utuh = async (tabel, kolom, nilai, cocok) => {
    const { data } = await A.sb.from(tabel).select("*").eq(kolom, nilai);
    return (data ?? []).length === 1 && cocok(data[0]);
  };
  const rusak = [];
  for (const [tabel, kolom, nilai, cocok] of [
    ["user_accounts", "id", kantongA.id, (r) => r.name === "BCA A" && r.nomor_akhir === "1111" && Number(r.saldo_awal) === 1000000],
    ["categories", "id", kategoriA.id, (r) => r.name === "Kursus A"],
    // budgets berkunci (user_id, category); A hanya melihat miliknya sendiri.
    ["budgets", "category", budgetA.category, (r) => Number(r.amount) === 500000],
    ["cicilan", "id", cicilanA.id, (r) => r.nama === "HP A"],
    ["metode_budget", "user_id", A.id, (r) => r.metode === "pyf"],
    ["push_langganan", "id", pushA.id, (r) => r.endpoint === "https://contoh.invalid/a"],
    ["transactions", "id", txA.id, (r) => r.merchant === RAHASIA && Number(r.amount) === 75000 && r.ref_bank === "uji:ref-a" && !r.ref_bank_tujuan && r.perlu_dilengkapi === true && r.type === "expense"],
    ["deposito", "kantong_id", depoA, (r) => r.selesai === false && Number(r.bunga_persen) === 4.5],
    ["user_accounts", "id", depoA, (r) => r.macam_simpanan === "deposito"],
    ["deposito_periode", "deposito_id", depoA, (r) => r.id === perA.id && r.bunga_diterima === null],
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

  // 8. jadikan_pindah & urungkan untuk A sendiri (SPEC-kantong-sendiri A-3): atomik, sisi lawan
  //    digabung, gagal bila sudah berubah sejak ditampilkan, dan bisa diurungkan utuh.
  const briA = await satu(A.sb.from("user_accounts").insert({ user_id: A.id, name: "BRI A2", kind: "bank", emoji: "🏦", saldo_awal: 500000, saldo_sejak: "2026-01-01T00:00:00+07:00" }));
  const danaA = await satu(A.sb.from("user_accounts").insert({ user_id: A.id, name: "DANA A", kind: "ewallet", emoji: "📱", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }));
  const topUp = await satu(A.sb.from("transactions").insert({ user_id: A.id, amount: 50000, type: "expense", category: "other", merchant: "DANA", description: "Top Up DANA", transaction_date: "2026-02-05", waktu: "10:00", kantong_id: briA.id, status: "confirmed", source: "statement", ref_bank: "uji:ref-topup", perlu_dilengkapi: true }));
  const masuk = await satu(A.sb.from("transactions").insert({ user_id: A.id, amount: 50000, type: "income", category: "other", merchant: "BRI", transaction_date: "2026-02-05", waktu: "10:00", kantong_id: danaA.id, status: "confirmed", source: "receipt" }));
  for (const t of [topUp, masuk]) Object.assign(t, (await A.sb.from("transactions").select("updated_at").eq("id", t.id).single()).data);
  const isian = { ubah: [{ id: topUp.id, updated_at: topUp.updated_at, kantong_lawan: danaA.id, merchant: "Pindah ke DANA A", gabung: { id: masuk.id, updated_at: masuk.updated_at } }] };
  const { error: basi } = await A.sb.rpc("jadikan_pindah", { p: { ubah: [{ ...isian.ubah[0], updated_at: "2020-01-01T00:00:00+00:00" }] } });
  cek("jadikan_pindah: gagal dengan pesan bila transaksinya sudah berubah", /sudah berubah/.test(basi?.message ?? ""), basi?.message);
  const { data: jadi, error: eJadi } = await A.sb.rpc("jadikan_pindah", { p: isian });
  const { data: sesudahJadi } = await A.sb.from("transactions").select("id, type, kantong_id, kantong_tujuan_id, merchant, perlu_dilengkapi, ref_bank").in("id", [topUp.id, masuk.id]);
  const saldoJadi = Object.fromEntries(((await A.sb.rpc("saldo_kantong")).data ?? []).map((k) => [k.id, Number(k.saldo)]));
  cek(
    "jadikan_pindah: pengeluaran jadi pindah BRI → DANA, pemasukan DANA digabung (dihapus), saldo benar",
    !eJadi && jadi?.n === 1 && sesudahJadi?.length === 1 && sesudahJadi[0].type === "transfer" && sesudahJadi[0].kantong_tujuan_id === danaA.id && sesudahJadi[0].merchant === "Pindah ke DANA A" && sesudahJadi[0].perlu_dilengkapi === false && sesudahJadi[0].ref_bank === "uji:ref-topup" && saldoJadi[briA.id] === 450000 && saldoJadi[danaA.id] === 50000,
    JSON.stringify({ eJadi, jadi: jadi?.n, sesudahJadi, saldoJadi }),
  );
  const { error: eUrung } = await A.sb.rpc("urungkan_jadikan_pindah", { p: { salinan: jadi?.salinan ?? [] } });
  const { data: sesudahUrung } = await A.sb.from("transactions").select("id, type, kantong_id, kantong_tujuan_id, merchant, perlu_dilengkapi, ref_bank").in("id", [topUp.id, masuk.id]).order("type");
  cek(
    "urungkan_jadikan_pindah: pengeluaran & pemasukan kembali seperti semula",
    !eUrung && JSON.stringify(sesudahUrung?.map((t) => [t.id, t.type, t.kantong_id, t.kantong_tujuan_id, t.merchant, t.perlu_dilengkapi])) === JSON.stringify([[topUp.id, "expense", briA.id, null, "DANA", true], [masuk.id, "income", danaA.id, null, "BRI", false]]),
    JSON.stringify({ eUrung, sesudahUrung }),
  );
  // Saldo sementara (SPEC-kantong-sendiri U1): mati begitu saldo diisi user; B tidak bisa mengubah milik A.
  const sementara = await satu(A.sb.from("user_accounts").insert({ user_id: A.id, name: "SeaBank A", kind: "bank", emoji: "🏦", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00", saldo_sementara: true }));
  const { data: namaSaja } = await A.sb.from("user_accounts").update({ name: "SeaBank A2" }).eq("id", sementara.id).select("saldo_sementara").single();
  const { data: diisi } = await A.sb.from("user_accounts").update({ saldo_awal: 250000, saldo_sejak: new Date().toISOString() }).eq("id", sementara.id).select("saldo_sementara").single();
  cek("saldo_sementara: tetap saat nama diubah, mati saat saldo diisi user", namaSaja?.saldo_sementara === true && diisi?.saldo_sementara === false, JSON.stringify({ namaSaja, diisi }));
  const { data: hidupkan } = await A.sb.from("user_accounts").update({ saldo_sementara: true }).eq("id", sementara.id).select("saldo_sementara");
  cek("saldo_sementara tidak bisa dihidupkan lagi lewat update", !(hidupkan ?? []).some((k) => k.saldo_sementara), JSON.stringify(hidupkan));
  const { error: urungDua } = await A.sb.rpc("urungkan_jadikan_pindah", { p: { salinan: jadi?.salinan ?? [] } });
  cek("urungkan_jadikan_pindah dua kali: ditolak", Boolean(urungDua));

  // "Cara dicatat" (SPEC-periksa-dulu §4): jejak draft digabung saat Simpan, thumbnail draft ikut pindah (K1).
  const draftJ = await satu(A.sb.from("transactions").insert({ user_id: A.id, amount: 42000, type: "expense", category: "food", merchant: "Warung Uji", transaction_date: hariIni, kantong_id: kantongA.id, status: "needs_review", source: "receipt" }));
  await A.sb.rpc("simpan_foto_draft", { p_id: draftJ.id, p_foto: Buffer.from("thumb A").toString("base64") });
  const { data: j1 } = await A.sb.rpc("catat_jejak_draft", { p_id: draftJ.id, p_tambah: { asal: "gambar", bacaan: { merchant: "Warung Uji", nominal: 42000 }, langkah: [{ t: "tanya", teks: "Pakai kantong apa?" }] } });
  const { data: j2 } = await A.sb.rpc("catat_jejak_draft", { p_id: draftJ.id, p_tambah: { langkah: [{ t: "jawab", teks: "BCA A" }] } });
  const { data: tambahJ } = await A.sb.rpc("tambah_jejak", { p_id: draftJ.id, p_isi: { disimpan: new Date().toISOString(), cara: "kartu" } });
  await A.sb.from("transactions").update({ status: "confirmed" }).eq("id", draftJ.id);
  const { data: jejakA } = await A.sb.rpc("jejak_catat", { p_id: draftJ.id });
  cek(
    "jejak_catat: jejak draft (asal, tanya-jawab berurutan) digabung saat Simpan, thumbnail ikut",
    j1 === true && j2 === true && tambahJ === true && jejakA?.length === 1 && jejakA[0].isi.asal === "gambar" && jejakA[0].isi.cara === "kartu" &&
      JSON.stringify(jejakA[0].isi.langkah.map((l) => l.t)) === '["tanya","jawab"]' && jejakA[0].ada_foto === true,
    JSON.stringify(jejakA),
  );
  const { data: fotoJ } = await A.sb.rpc("foto_jejak", { p_id: jejakA?.[0]?.id ?? 0 });
  cek("foto_jejak: pemilik mendapat thumbnail-nya", Buffer.from(fotoJ ?? "", "base64").toString() === "thumb A");
  for (const [siapa, sb] of [["B", B.sb], ["Pengunjung", anon]]) {
    const { data: baca } = await sb.rpc("jejak_catat", { p_id: draftJ.id });
    cek(`${siapa} tidak bisa membaca jejak_catat transaksi A`, !(baca ?? []).length, JSON.stringify(baca));
    const { data: fotoB } = await sb.rpc("foto_jejak", { p_id: jejakA?.[0]?.id ?? 0 });
    cek(`${siapa} tidak bisa mengambil foto jejak A`, !fotoB);
    const { data: tambahB } = await sb.rpc("tambah_jejak", { p_id: draftJ.id, p_isi: { asal: "palsu" } });
    cek(`${siapa} tidak bisa menambah jejak ke transaksi A`, tambahB !== true);
    const { data: draftB } = await sb.rpc("catat_jejak_draft", { p_id: draftA.id, p_tambah: { asal: "palsu" } });
    cek(`${siapa} tidak bisa menulis jejak draft A`, draftB !== true);
    const { data: urungB } = await sb.rpc("urungkan_jejak", { p_id: draftJ.id });
    cek(`${siapa} tidak bisa mengurungkan jejak A`, urungB !== true);
  }
  const { data: jejakTetap } = await A.sb.rpc("jejak_catat", { p_id: draftJ.id });
  cek("Jejak A tetap satu baris sesudah percobaan B", jejakTetap?.length === 1 && jejakTetap[0].isi.asal === "gambar");
  // Urungkan Simpan: kembali draft, jejak & thumbnail kembali ke draft-nya.
  await A.sb.from("transactions").update({ status: "needs_review" }).eq("id", draftJ.id);
  const { data: urungJ } = await A.sb.rpc("urungkan_jejak", { p_id: draftJ.id });
  const { data: jejakUrung } = await A.sb.rpc("jejak_catat", { p_id: draftJ.id });
  const { data: fotoDraftJ } = await A.sb.rpc("foto_draft", { p_id: draftJ.id });
  cek("urungkan_jejak: jejak Simpan dihapus, thumbnail kembali ke draft", urungJ === true && !(jejakUrung ?? []).length && Buffer.from(fotoDraftJ ?? "", "base64").toString() === "thumb A");
  await A.sb.rpc("tambah_jejak", { p_id: draftJ.id, p_isi: { asal: "gambar" } });
  await A.sb.from("transactions").delete().eq("id", draftJ.id);
  const { data: jejakHapus } = await A.sb.rpc("jejak_catat", { p_id: draftJ.id });
  cek("jejak_catat terhapus bersama transaksinya", !(jejakHapus ?? []).length, JSON.stringify(jejakHapus));

  // Pemakaian model AI harian (SPEC-asisten-agen §1, P9): baris per akun, hanya lewat catat_pemakaian_ai.
  const MODEL_UJI = "model-uji-isolasi";
  const { data: pakai1 } = await A.sb.rpc("catat_pemakaian_ai", { p_model: MODEL_UJI });
  const { data: pakai2 } = await A.sb.rpc("catat_pemakaian_ai", { p_model: MODEL_UJI, p_jumlah: 2 });
  const { data: hariIniA } = await A.sb.rpc("pemakaian_ai_hari_ini", { p_model: MODEL_UJI });
  cek("catat_pemakaian_ai: hitungan A bertambah (1 → 3)", pakai1 === 1 && pakai2 === 3 && hariIniA === 3, JSON.stringify({ pakai1, pakai2, hariIniA }));
  const { error: eLangsung } = await A.sb.from("pemakaian_ai").insert({ user_id: A.id, tanggal: hariIni, model: "langsung", jumlah: 999 });
  cek("pemakaian_ai: pemilik pun tidak bisa insert langsung", Boolean(eLangsung));
  const { error: eAneh } = await A.sb.rpc("catat_pemakaian_ai", { p_model: MODEL_UJI, p_jumlah: 1000 });
  cek("catat_pemakaian_ai: jumlah di luar batas ditolak", Boolean(eAneh));
  for (const [siapa, sb] of [["B", B.sb], ["Anon", anon]]) {
    const { data: baca } = await sb.from("pemakaian_ai").select("*").eq("user_id", A.id);
    cek(`${siapa} tidak bisa membaca pemakaian_ai A`, !(baca ?? []).length, JSON.stringify(baca));
    await sb.from("pemakaian_ai").update({ jumlah: 0 }).eq("user_id", A.id);
    await sb.from("pemakaian_ai").delete().eq("user_id", A.id);
    const { error: eSisip } = await sb.from("pemakaian_ai").insert({ user_id: A.id, tanggal: hariIni, model: MODEL_UJI, jumlah: 50 });
    cek(`${siapa} tidak bisa menulis pemakaian_ai atas nama A`, Boolean(eSisip));
  }
  const { data: pakaiB } = await B.sb.rpc("catat_pemakaian_ai", { p_model: MODEL_UJI });
  cek("catat_pemakaian_ai B menulis baris B sendiri (mulai 1)", pakaiB === 1, JSON.stringify(pakaiB));
  const { data: anonPakai, error: eAnonPakai } = await anon.rpc("catat_pemakaian_ai", { p_model: MODEL_UJI });
  cek("Anon tidak bisa memanggil catat_pemakaian_ai", Boolean(eAnonPakai) && anonPakai == null);
  const { data: tetapA } = await A.sb.rpc("pemakaian_ai_hari_ini", { p_model: MODEL_UJI });
  cek("Hitungan A tetap 3 sesudah percobaan B & anon", tetapA === 3, JSON.stringify(tetapA));

  // --- Kartu usulan asisten (SPEC-asisten-agen §3): terapkan_usulan atomik, urungkan_aksi persis, isolasi.
  const bank = await satu(A.sb.from("user_accounts").insert({ user_id: A.id, name: "Bank Usulan A", kind: "bank", emoji: "🏦", saldo_awal: 1000000, saldo_sejak: "2026-01-01T00:00:00+07:00" }));
  const KOLOM_U = "id, amount, type, category, merchant, kantong_id, kantong_tujuan_id, status, ref_bank, ref_bank_tujuan, transaction_date, updated_at";
  const baca = async (id) => (await A.sb.from("transactions").select(KOLOM_U).eq("id", id).maybeSingle()).data;
  // updated_at dari insert lewat view selalu kosong (trigger instead of): dibaca ulang.
  const txU = async (isi) => baca((await satu(A.sb.from("transactions").insert({ user_id: A.id, status: "confirmed", source: "text", transaction_date: hariIni, kantong_id: bank.id, category: "other", ...isi }))).id);
  const grab = await txU({ amount: 100000, type: "expense", category: "food", merchant: "Grab" });
  const rek = await txU({ amount: 50000, type: "expense", merchant: "Bank fee", source: "statement", ref_bank: "uji:usulan-rek" });
  const topUpU = await txU({ amount: 200000, type: "expense", merchant: "Top Up DANA", source: "statement", ref_bank: "uji:usulan-top" });
  const draftU = await baca((await satu(A.sb.from("transactions").insert({ user_id: A.id, status: "needs_review", source: "receipt", amount: 30000, type: "expense", category: "food", merchant: "Warung Usulan", transaction_date: hariIni }))).id);
  const saldoU = async () => Object.fromEntries(((await A.sb.rpc("saldo_kantong")).data ?? []).map((s) => [s.id, Number(s.saldo)]));

  // 1. Ubah transaksi → urungkan persis.
  const { data: ubahU, error: eUbahU } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "ubah_transaksi", ringkasan: "Grab → Transportasi", ubah: [{ id: grab.id, updated_at: grab.updated_at, isian: { category: "transport", merchant: "Grab Bike" } }] } });
  const grabUbah = await baca(grab.id);
  cek("terapkan_usulan ubah_transaksi: kategori & merchant berubah", !eUbahU && ubahU?.n === 1 && grabUbah?.category === "transport" && grabUbah?.merchant === "Grab Bike", JSON.stringify({ eUbahU, ubahU, grabUbah }));
  for (const [siapa, sb] of [["B", B.sb], ["Anon", anon]]) {
    const { error: eUrungLain } = await sb.rpc("urungkan_aksi", { p_id: ubahU?.aksi_id });
    cek(`${siapa} tidak bisa mengurungkan aksi asisten A`, Boolean(eUrungLain));
    const { error: eTerapLain } = await sb.rpc("terapkan_usulan", { p: { jenis: "ubah_transaksi", ubah: [{ id: grab.id, updated_at: grabUbah?.updated_at, isian: { category: "other" } }] } });
    const { error: eHapusLain } = await sb.rpc("terapkan_usulan", { p: { jenis: "hapus", hapus: [{ id: grab.id, updated_at: grabUbah?.updated_at }] } });
    cek(`${siapa} tidak bisa menerapkan usulan atas transaksi A (ubah & hapus)`, Boolean(eTerapLain) && Boolean(eHapusLain));
    const { data: dAksi, error: eAksi } = await sb.from("aksi_asisten").select("*");
    cek(`${siapa} tidak bisa membaca aksi_asisten`, Boolean(eAksi) || !(dAksi ?? []).length);
  }
  const { error: eKantongLain } = await B.sb.rpc("terapkan_usulan", { p: { jenis: "catat", sisip: [{ type: "expense", amount: 1000, category: "food", kantong_id: bank.id, transaction_date: hariIni }] } });
  cek("B tidak bisa mencatat ke kantong A lewat usulan", Boolean(eKantongLain));
  const grabTetap = await baca(grab.id);
  cek("Transaksi A tetap sesudah percobaan B & anon", grabTetap?.category === "transport" && grabTetap?.updated_at === grabUbah?.updated_at);
  const { data: urungU, error: eUrungU } = await A.sb.rpc("urungkan_aksi", { p_id: ubahU?.aksi_id });
  const grabBalik = await baca(grab.id);
  cek("urungkan_aksi: kategori & merchant kembali persis", !eUrungU && urungU?.n === 1 && grabBalik?.category === "food" && grabBalik?.merchant === "Grab", JSON.stringify({ eUrungU, grabBalik }));
  const { error: eUrungDua } = await A.sb.rpc("urungkan_aksi", { p_id: ubahU?.aksi_id });
  cek("urungkan_aksi dua kali: ditolak", Boolean(eUrungDua));

  // 2. Atomik & validasi: baris kedua (nominal bank diubah) gagal → baris pertama juga tidak berubah.
  const { error: eBankU } = await A.sb.rpc("terapkan_usulan", {
    p: { jenis: "ubah_transaksi", ubah: [{ id: grab.id, updated_at: grabBalik.updated_at, isian: { category: "transport" } }, { id: rek.id, updated_at: rek.updated_at, isian: { amount: 60000 } }] },
  });
  const [grabAtom, rekAtom] = [await baca(grab.id), await baca(rek.id)];
  cek("terapkan_usulan: nominal rekening koran diubah → ditolak, baris lain tidak ikut berubah", Boolean(eBankU) && /rekening koran/.test(eBankU?.message ?? "") && grabAtom?.category === "food" && Number(rekAtom?.amount) === 50000, JSON.stringify({ eBankU, grabAtom }));
  const { error: eBasi } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "ubah_transaksi", ubah: [{ id: grab.id, updated_at: grab.updated_at, isian: { category: "transport" } }] } });
  cek("terapkan_usulan: transaksi sudah berubah sejak usulan → ditolak", /sudah berubah/.test(eBasi?.message ?? ""), JSON.stringify(eBasi));
  const { error: eKatU } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "ubah_transaksi", ubah: [{ id: grab.id, updated_at: grabBalik.updated_at, isian: { category: "kategori-tidak-ada" } }] } });
  cek("terapkan_usulan: kategori yang tidak ada → ditolak", Boolean(eKatU));
  const { error: eBanyak } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "hapus", hapus: Array.from({ length: 201 }, () => ({ id: grab.id, updated_at: grabBalik.updated_at })) } });
  cek("terapkan_usulan: lebih dari 200 transaksi → ditolak", /200/.test(eBanyak?.message ?? ""), JSON.stringify(eBanyak));

  // 3. Buat kantong + jadikan pindah → saldo; urungkan → kantong baru hilang, transaksi kembali.
  const saldoAwalU = await saldoU();
  const { data: pindahU, error: ePindahU } = await A.sb.rpc("terapkan_usulan", {
    p: { jenis: "jadikan_pindah", kantong_baru: { nama: "DANA Usulan", jenis: "ewallet", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" }, pindah: [{ id: topUpU.id, updated_at: topUpU.updated_at, ke: "baru" }] },
  });
  const topSesudah = await baca(topUpU.id);
  const saldoPindahU = await saldoU();
  cek(
    "terapkan_usulan jadikan_pindah + kantong baru: top up jadi pindah kantong, saldo bank tetap, DANA bertambah",
    !ePindahU && pindahU?.kantong_baru && topSesudah?.type === "transfer" && topSesudah?.kantong_tujuan_id === pindahU.kantong_baru && topSesudah?.merchant === "Pindah ke DANA Usulan" &&
      saldoPindahU[bank.id] === saldoAwalU[bank.id] && saldoPindahU[pindahU.kantong_baru] === 200000,
    JSON.stringify({ ePindahU, pindahU, topSesudah }),
  );
  const { error: eUrungPindah } = await A.sb.rpc("urungkan_aksi", { p_id: pindahU?.aksi_id });
  const topBalik = await baca(topUpU.id);
  const { data: danaHilang } = await A.sb.from("user_accounts").select("id").eq("id", pindahU?.kantong_baru ?? A.id);
  cek("urungkan_aksi jadikan_pindah: kembali pengeluaran, kantong baru dihapus", !eUrungPindah && topBalik?.type === "expense" && topBalik?.kantong_tujuan_id === null && topBalik?.ref_bank === "uji:usulan-top" && !(danaHilang ?? []).length, JSON.stringify({ eUrungPindah, topBalik, danaHilang }));

  // 4. Hapus: rekening koran tanpa kembaran ditolak; transaksi biasa → urungkan mengembalikan id yang sama.
  const { error: eHapusRek } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "hapus", hapus: [{ id: rek.id, updated_at: rek.updated_at }] } });
  cek("terapkan_usulan hapus: transaksi rekening koran tanpa kembaran → ditolak", /kembaran/.test(eHapusRek?.message ?? ""), JSON.stringify(eHapusRek));
  const kembar = await txU({ amount: 50000, type: "expense", merchant: "Bank fee (ketik)" });
  const { data: hapusU, error: eHapusU } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "hapus", hapus: [{ id: kembar.id, updated_at: kembar.updated_at }] } });
  const hilang = await baca(kembar.id);
  await A.sb.rpc("urungkan_aksi", { p_id: hapusU?.aksi_id });
  const kembali = await baca(kembar.id);
  cek("terapkan_usulan hapus → urungkan: transaksi kembali dengan id & merchant yang sama", !eHapusU && !hilang && kembali?.merchant === "Bank fee (ketik)" && Number(kembali?.amount) === 50000, JSON.stringify({ eHapusU, kembali }));

  // 5. Selesaikan draft & catat baru → urungkan.
  const { data: draftSel, error: eDraftSel } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "selesaikan_draft", draft: [{ id: draftU.id, updated_at: draftU.updated_at, isian: { kantong_id: bank.id, waktu: "12:30" } }] } });
  const draftSesudah = await baca(draftU.id);
  await A.sb.rpc("urungkan_aksi", { p_id: draftSel?.aksi_id });
  const draftBalik = await baca(draftU.id);
  cek("selesaikan_draft: tersimpan dengan kantongnya; urungkan → kembali draft", !eDraftSel && draftSesudah?.status === "confirmed" && draftSesudah?.kantong_id === bank.id && draftBalik?.status === "needs_review" && draftBalik?.kantong_id === null, JSON.stringify({ eDraftSel, draftSesudah, draftBalik }));
  const { data: catatU, error: eCatatU } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "catat", sisip: [{ type: "expense", amount: 25000, category: "food", merchant: "Bakso Usulan", kantong_id: bank.id, transaction_date: hariIni, teks: "tadi bakso 25rb" }] } });
  const { data: baksoAda } = await A.sb.from("transactions").select("id, source").eq("merchant", "Bakso Usulan");
  const { error: eUrungCatat } = await A.sb.rpc("urungkan_aksi", { p_id: catatU?.aksi_id });
  const { data: baksoHilang } = await A.sb.from("transactions").select("id").eq("merchant", "Bakso Usulan");
  cek("catat: transaksi baru (ketikan) → urungkan menghapusnya", !eCatatU && baksoAda?.length === 1 && baksoAda[0].source === "text" && !eUrungCatat && !(baksoHilang ?? []).length, JSON.stringify({ eCatatU, baksoAda, eUrungCatat }));

  // 6. Urungkan ditolak bila barisnya sudah diubah lagi.
  const grabKini = await baca(grab.id);
  const { data: ubahLagi } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "ubah_transaksi", ubah: [{ id: grab.id, updated_at: grabKini.updated_at, isian: { category: "shopping" } }] } });
  await A.sb.from("transactions").update({ description: "diubah sendiri" }).eq("id", grab.id);
  const { error: eUrungBerubah } = await A.sb.rpc("urungkan_aksi", { p_id: ubahLagi?.aksi_id });
  const grabAkhir = await baca(grab.id);
  cek("urungkan_aksi: baris sudah diubah lagi → ditolak, tidak ada yang berubah", /diubah lagi/.test(eUrungBerubah?.message ?? "") && grabAkhir?.category === "shopping", JSON.stringify({ eUrungBerubah, grabAkhir }));

  // 7. Ubah kategori per merchant (keputusan 35): kategori baru dibuat di usulan yang sama ("baru"),
  //    urungkan mengembalikan kategori lama & menghapus kategori itu bila tidak dipakai lagi.
  const cuci1 = await txU({ amount: 16000, type: "expense", category: "food", merchant: "Cuci Usulan" });
  const cuci2 = await txU({ amount: 18000, type: "expense", category: "other", merchant: "Cuci Usulan", source: "statement", ref_bank: "uji:usulan-cuci" });
  const isiKat = (a, b, kategori_baru = { type: "expense", nama: "Laundry  Usulan", kelompok: "kebutuhan" }) => ({
    jenis: "ubah_kategori", ringkasan: "Cuci Usulan → Laundry", kategori_baru,
    ubah: [{ id: a.id, updated_at: a.updated_at, isian: { category: "baru" } }, { id: b.id, updated_at: b.updated_at, isian: { category: "baru" } }],
  });
  for (const [siapa, sb] of [["B", B.sb], ["Anon", anon]]) {
    const { error: eKatLain } = await sb.rpc("terapkan_usulan", { p: isiKat(cuci1, cuci2) });
    cek(`${siapa}: terapkan_usulan ubah_kategori atas transaksi A → ditolak`, Boolean(eKatLain), JSON.stringify(eKatLain));
  }
  const { data: katSisaB } = await admin.from("categories").select("id").eq("name", "Laundry Usulan").in("user_id", [A.id, B.id]);
  cek("Percobaan B & anon tidak meninggalkan kategori (satu transaksi database)", !(katSisaB ?? []).length, JSON.stringify(katSisaB));
  const { error: eTanpaBaru } = await A.sb.rpc("terapkan_usulan", { p: { jenis: "ubah_kategori", ubah: [{ id: cuci1.id, updated_at: cuci1.updated_at, isian: { category: "baru" } }] } });
  cek("terapkan_usulan: category \"baru\" tanpa kategori_baru → ditolak", /Kategori barunya tidak ada/.test(eTanpaBaru?.message ?? ""), JSON.stringify(eTanpaBaru));
  for (const salah of [{ type: "transfer", nama: "X" }, { type: "expense", nama: "x".repeat(31) }, { type: "expense", nama: "Y", kelompok: "ngawur" }]) {
    const { error: eKatSalah } = await A.sb.rpc("terapkan_usulan", { p: isiKat(cuci1, cuci2, salah) });
    cek(`terapkan_usulan: kategori_baru tidak valid (${JSON.stringify(salah).slice(0, 60)}) → ditolak`, /tidak valid/.test(eKatSalah?.message ?? ""), JSON.stringify(eKatSalah));
  }
  const { data: katU, error: eKatU2 } = await A.sb.rpc("terapkan_usulan", { p: isiKat(cuci1, cuci2) });
  const { data: katBaru } = await A.sb.from("categories").select("slug, name, kelompok, icon").eq("slug", katU?.kategori_baru ?? "-").maybeSingle();
  const [c1, c2] = [await baca(cuci1.id), await baca(cuci2.id)];
  cek("terapkan_usulan ubah_kategori + kategori baru: kategori Laundry Usulan (kebutuhan) dibuat, kedua transaksi pindah (rekening koran boleh)",
    !eKatU2 && katU?.n === 2 && katBaru?.name === "Laundry Usulan" && katBaru?.kelompok === "kebutuhan" && c1?.category === katBaru?.slug && c2?.category === katBaru?.slug,
    JSON.stringify({ eKatU2, katU, katBaru, c1: c1?.category, c2: c2?.category }));
  const { data: katDiB } = await B.sb.from("categories").select("id").eq("name", "Laundry Usulan");
  cek("B tidak melihat kategori baru A", !(katDiB ?? []).length);
  for (const [siapa, sb] of [["B", B.sb], ["Anon", anon]]) {
    const { error: eUrungKatLain } = await sb.rpc("urungkan_aksi", { p_id: katU?.aksi_id });
    cek(`${siapa}: urungkan_aksi ubah_kategori milik A → ditolak`, Boolean(eUrungKatLain));
  }
  const { data: urungKat, error: eUrungKat } = await A.sb.rpc("urungkan_aksi", { p_id: katU?.aksi_id });
  const { data: katHilang } = await A.sb.from("categories").select("id").eq("slug", katU?.kategori_baru ?? "-");
  const [b1, b2] = [await baca(cuci1.id), await baca(cuci2.id)];
  cek("urungkan_aksi ubah_kategori: kategori lama kembali, kategori baru ikut dihapus",
    !eUrungKat && urungKat?.kategori_dihapus === true && !(katHilang ?? []).length && b1?.category === "food" && b2?.category === "other",
    JSON.stringify({ eUrungKat, urungKat, katHilang, b1: b1?.category, b2: b2?.category }));
  // Nama yang sudah ada (beda huruf) dipakai lagi dan tidak dihapus saat urungkan.
  const { data: makan } = await A.sb.from("categories").select("slug, name").eq("type", "expense").eq("slug", "food").single();
  const { data: katAda } = await A.sb.rpc("terapkan_usulan", { p: isiKat(b1, b2, { type: "expense", nama: makan.name.toUpperCase() }) });
  const { data: urungAda } = await A.sb.rpc("urungkan_aksi", { p_id: katAda?.aksi_id });
  const { data: makanTetap } = await A.sb.from("categories").select("slug").eq("slug", "food").maybeSingle();
  cek("kategori_baru dengan nama yang sudah ada → kategori itu dipakai, tidak dihapus saat urungkan", katAda?.kategori_baru === "food" && urungAda?.kategori_dihapus === false && makanTetap?.slug === "food", JSON.stringify({ katAda, urungAda }));
  // Kategori baru yang sudah dipakai transaksi lain tidak ikut dihapus.
  const [d1, d2] = [await baca(cuci1.id), await baca(cuci2.id)];
  const { data: katLagi } = await A.sb.rpc("terapkan_usulan", { p: isiKat(d1, d2) });
  await txU({ amount: 5000, type: "expense", category: katLagi?.kategori_baru, merchant: "Cuci Lain" });
  const { data: urungLagi, error: eUrungLagi } = await A.sb.rpc("urungkan_aksi", { p_id: katLagi?.aksi_id });
  const { data: katMasih } = await A.sb.from("categories").select("id").eq("slug", katLagi?.kategori_baru ?? "-");
  cek("urungkan_aksi: kategori baru yang sudah dipakai transaksi lain tetap ada", !eUrungLagi && urungLagi?.kategori_dihapus === false && (katMasih ?? []).length === 1, JSON.stringify({ eUrungLagi, urungLagi, katMasih }));

  // --- Riwayat percakapan Tanya AI (P4): terenkripsi, hanya pemilik.
  const pesanA = [{ peran: "saya", teks: "Rahasia obrolan A" }, { peran: "ai", teks: "Jawaban A" }];
  const { data: obrolanA, error: eObrolan } = await A.sb.rpc("simpan_obrolan", { p_id: null, p_judul: "Rahasia obrolan A", p_pesan: pesanA });
  const { data: daftarA } = await A.sb.rpc("daftar_obrolan");
  const { data: bukaA } = await A.sb.rpc("buka_obrolan", { p_id: obrolanA });
  cek("simpan/daftar/buka obrolan: pemilik membaca percakapannya", !eObrolan && daftarA?.length === 1 && daftarA[0].judul === "Rahasia obrolan A" && bukaA?.[0]?.pesan?.[0]?.teks === "Rahasia obrolan A", JSON.stringify({ eObrolan, daftarA, bukaA }));
  for (const [siapa, sb] of [["B", B.sb], ["Anon", anon]]) {
    const { data: dB } = await sb.rpc("daftar_obrolan");
    const { data: bB } = await sb.rpc("buka_obrolan", { p_id: obrolanA });
    cek(`${siapa} tidak bisa membaca obrolan A`, !(dB ?? []).length && !(bB ?? []).length, JSON.stringify({ dB, bB }));
    const { error: eTimpa } = await sb.rpc("simpan_obrolan", { p_id: obrolanA, p_judul: "palsu", p_pesan: [] });
    const { data: hB } = await sb.rpc("hapus_obrolan", { p_id: obrolanA });
    cek(`${siapa} tidak bisa menimpa atau menghapus obrolan A`, Boolean(eTimpa) && hB !== true);
    const { data: tabel, error: eTabel } = await sb.from("obrolan_asisten").select("*");
    cek(`${siapa} tidak bisa membaca tabel obrolan_asisten`, Boolean(eTabel) || !(tabel ?? []).length);
  }
  const { data: masihA } = await A.sb.rpc("buka_obrolan", { p_id: obrolanA });
  const { data: hapusObrolan } = await A.sb.rpc("hapus_obrolan", { p_id: obrolanA });
  cek("Obrolan A utuh sesudah percobaan B & anon, lalu bisa dihapus pemiliknya", masihA?.[0]?.judul === "Rahasia obrolan A" && hapusObrolan === true);
} catch (e) {
  gagal++;
  console.log("✗ GAGAL:", e.message);
} finally {
  for (const id of akun) await admin.auth.admin.deleteUser(id);
  console.log(`\n${gagal ? `${gagal} cek gagal` : "✓ isolasi antar akun: baca, ubah, hapus, tulis atas nama orang lain, fungsi, dan kolom rujukan (termasuk simpanan, deposito, impor rekening koran, deposito jatuh tempo, jadikan pindah, jejak “Cara dicatat”, pemakaian AI, kartu usulan asisten & riwayat obrolan)"} · akun uji dihapus`);
  process.exit(gagal ? 1 : 0);
}
