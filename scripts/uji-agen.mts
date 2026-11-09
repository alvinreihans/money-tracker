/**
 * Uji asisten agen tahap A (SPEC-asisten-agen): pemilihan model (lapis 1),
 * argumen alat baru dibersihkan, periksa_saldo & cari_kejanggalan dengan data
 * buatan, putaran dua model dengan tiruan (serahkan, naik otomatis, 429 →
 * model ringan, batas waktu), dan pengurai aliran NDJSON.
 *
 * Pemakaian: npm run uji:agen
 */
import assert from "node:assert/strict";
import type { Content, FunctionCall } from "@google/generative-ai";
import { jalankanAgen, type BalasanModel, type PanggilModel } from "../src/lib/agen.ts";
import { barisAlir, pengurai } from "../src/lib/alir.ts";
import { bacaRef, cariKejanggalan, periksaSaldo, riwayatImpor, ringkasPencarian, type KantongPeriksa, type TxPeriksa } from "../src/lib/periksa.ts";
import { CATATAN_KUOTA, galatKuota, pilihModelAwal } from "../src/lib/rute-model.ts";
import { bersihkanArgCari, bersihkanArgPeriksa, idDariArgumen, jenisKejanggalanDari, labelLangkah, tautanDari } from "../src/lib/tanya.ts";

// ---------------------------------------------------------------- lapis 1
const berat = (q: string) => pilihModelAwal(q).model === "berat";
for (const q of [
  "berapa total pengeluaran bulan ini?",
  "kenapa bulan ini boros?",
  "Kenapa November boros?",
  "saldo BCA berapa?",
  "total asetku berapa?",
  "bandingin pengeluaran makan bulan ini sama bulan lalu",
  "selisih total pengeluaran bulan ini dan bulan lalu berapa?",
  "Kopi Janji Jiwa itu harusnya kategori Jajan, tolong betulkan",
  "transaksi di atas 1 juta bulan ini apa aja?",
  "pengeluaran 3 bulan terakhir",
  "utang mana yang harus kulunasi dulu?",
  "rekomendasi saham yang bagus dong",
]) assert.equal(berat(q), false, `mudah: ${q}`);
for (const [q, alasan] of [
  ["rapikan transaksi DANA dong", "ubah"],
  ["tolong hapus yang dobel", "ubah"],
  ["buatkan kantong DANA", "ubah"],
  ["kok saldo DANA beda sama aplikasi DANA?", "penyebab"],
  ["saldo Jago di aplikasi nggak sama dengan bank", "penyebab"],
  ["kenapa top up DANA tercatat jadi pengeluaran?", "penyebab"],
  ["ada transaksi yang dobel ga?", "penyebab"],
  ["uang 50rb hilang", "penyebab"],
  ["saldo BCA di m-banking Rp 24.750.000, kok di aplikasi beda?", "penyebab"],
  ["bandingkan semua kantong", "banding"],
  ["pengeluaran 6 bulan terakhir per kategori", "rentang"],
  ["total belanja dari awal", "rentang"],
  ["pengeluaran tahun ini", "rentang"],
] as const) assert.deepEqual(pilihModelAwal(q), { model: "berat", alasan }, `berat: ${q}`);
assert.deepEqual(pilihModelAwal("makasih", { sudahBerat: true }), { model: "berat", alasan: "lanjutan" });
assert.ok(galatKuota({ status: 429 }) && galatKuota(new Error("[429 Too Many Requests] RESOURCE_EXHAUSTED")) && galatKuota(new Error("You exceeded your current quota")));
assert.ok(!galatKuota(new Error("fetch failed")) && !galatKuota(null));

// ---------------------------------------------------------------- argumen alat
const DANA = "11111111-1111-4111-8111-111111111111";
const JAGO = "22222222-2222-4222-8222-222222222222";
const BRI = "33333333-3333-4333-8333-333333333333";
const k = {
  hariIni: "2026-11-09",
  kantong: [
    { id: JAGO, name: "Jago", aliases: [] },
    { id: BRI, name: "BRI", aliases: ["Bank Rakyat"] },
  ],
  kategori: [
    { type: "expense", slug: "food" },
    { type: "income", slug: "salary" },
  ],
};
const c = bersihkanArgCari(
  { sumber: "transaksi", saring: { dari: "2026-11-30", sampai: "2026-10-01", kantong: ["jago", "DANA"], kategori: ["food", "judi"], status: "draft", asal: ["rekening_koran", "aneh"], minimal: "50000", kata: "top up)", ref_bank: "tidak" }, kelompokkan: "bulan", urutkan: "terbesar", batas: 500 },
  k,
);
assert.deepEqual(
  { ...c },
  { sumber: "transaksi", dari: "2026-10-01", sampai: "2026-11-30", kantong: [JAGO], kantongTakDikenal: ["DANA"], jenis: null, kategori: ["food"], status: "draft", asal: ["statement"], minimal: 50000, maksimal: null, kata: "top up", refBank: false, kelompokkan: "bulan", urutkan: "terbesar", batas: 50 },
);
const kosong = bersihkanArgCari({ sumber: "apa", kelompokkan: "x", batas: -3, saring: { dari: "2026-02-30", status: "hapus" } }, k);
assert.equal(kosong.sumber, "transaksi");
assert.equal(kosong.dari, null);
assert.equal(kosong.status, "semua");
assert.equal(kosong.kelompokkan, null);
assert.equal(kosong.batas, 1);
assert.equal(bersihkanArgCari({ sumber: "kantong" }, k).batas, 20);
// Saringan di tingkat atas (model kadang begitu) tetap terbaca.
assert.deepEqual(bersihkanArgCari({ sumber: "transaksi", kantong: "BRI", jenis: "keluar" }, k).kantong, [BRI]);
assert.equal(idDariArgumen({ id: ` ${DANA.toUpperCase()} ` }), DANA);
assert.equal(idDariArgumen({ id: "1; drop table" }), null);
assert.equal(jenisKejanggalanDari({ jenis: "dobel" }), "dobel");
assert.equal(jenisKejanggalanDari({ jenis: "semua" }), null);
assert.deepEqual(bersihkanArgPeriksa({ kantong: "bank rakyat", saldo_bank: "1.250.000", sampai: "2027-01-01" }, k), { nama: "bank rakyat", kantongId: BRI, sampai: null, saldoBank: 1250000 });
assert.equal(labelLangkah("periksa_saldo", { kantong: "jago" }, k), "Memeriksa saldo Jago…");
assert.equal(labelLangkah("cari", { sumber: "transaksi", saring: { kata: "top up DANA" } }, k), "Mencari top up DANA…");
assert.equal(labelLangkah("cari", { sumber: "transaksi", saring: { status: "draft", kantong: ["BRI"] } }, k), "Mencari draft di BRI…");
assert.equal(labelLangkah("cari", { sumber: "impor" }, k), "Melihat riwayat impor rekening koran…");
assert.equal(labelLangkah("serahkan", {}, k), "Menyelidiki lebih jauh…");
assert.ok(!/model|flash|gemini/i.test(["cari", "detail", "periksa_saldo", "cari_kejanggalan", "serahkan"].map((n) => labelLangkah(n, {}, k)).join(" ")), "langkah tidak menyebut model (P8)");
// Tautan: transaksi → Riwayat (draft tidak punya), periksa_saldo → kantong, detail/kejanggalan/serahkan tanpa tautan.
assert.equal(tautanDari("cari", { sumber: "transaksi", saring: { kata: "DANA", kantong: ["BRI"] } }, k)?.href, `/riwayat?kantong=${BRI}&q=DANA`);
assert.equal(tautanDari("cari", { sumber: "transaksi", saring: { status: "draft" } }, k), null);
assert.equal(tautanDari("cari", { sumber: "transaksi", saring: { minimal: 5 } }, k)?.label, "Lihat semua di Riwayat");
assert.equal(tautanDari("cari", { sumber: "cicilan" }, k)?.href, "/pinjaman");
assert.equal(tautanDari("periksa_saldo", { kantong: "Jago" }, k)?.href, "/profil/kantong");
for (const n of ["detail", "cari_kejanggalan", "serahkan"] as const) assert.equal(tautanDari(n, {}, k), null);

// ---------------------------------------------------------------- periksa_saldo & cari_kejanggalan (data buatan)
assert.deepEqual(bacaRef("bri:9999:2026-10-31T10:15:00:-50000:1200000"), { bank: "bri", tanggal: "2026-10-31", jam: "10:15", nominal: -50000, saldo: 1200000 });
assert.deepEqual(bacaRef("sea:9999:2026-10-30:25000:400000"), { bank: "sea", tanggal: "2026-10-30", jam: null, nominal: 25000, saldo: 400000 });
assert.equal(bacaRef("jago:abc123"), null);
assert.equal(bacaRef("sea:9999:bunga:2026-10"), null);

const kantongUji: KantongPeriksa[] = [
  { id: BRI, name: "BRI", kind: "bank", aliases: [], saldo_awal: 1000000, saldo_per: "2026-10-01", saldo_sejak: "2026-10-01T00:00:00+07:00", induk_id: null, nomor_akhir: "9999" },
  { id: JAGO, name: "Jago", kind: "bank", aliases: [], saldo_awal: 500000, saldo_per: "2026-10-01", saldo_sejak: "2026-10-01T00:00:00+07:00", induk_id: null, nomor_akhir: "8888" },
];
let n = 0;
const tx = (x: Partial<TxPeriksa> & Pick<TxPeriksa, "amount" | "type" | "transaction_date">): TxPeriksa => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  status: "confirmed",
  source: "text",
  kantong_id: BRI,
  kantong_tujuan_id: null,
  updated_at: "2026-11-01T00:00:00Z",
  created_at: `2026-11-01T00:00:${String(n).padStart(2, "0")}Z`,
  ...x,
});
// Skenario DANA: top up dari BRI tercatat sebagai pengeluaran (kantong DANA belum ada).
const topup = tx({ amount: 200000, type: "expense", source: "statement", merchant: "Top Up DANA", description: "Top Up DANA 0812xxxx345 BUDX SAXXXXX via BRImo", transaction_date: "2026-10-05", waktu: "09:00:00", ref_bank: "bri:9999:2026-10-05T09:00:00:-200000:800000" });
const gaji = tx({ amount: 400000, type: "income", source: "statement", merchant: "Kantor", transaction_date: "2026-10-10", waktu: "08:00:00", ref_bank: "bri:9999:2026-10-10T08:00:00:400000:1200000" });
// Dobel: makan dicatat dari ketikan dan dari rekening koran.
const makan1 = tx({ amount: 50000, type: "expense", source: "statement", merchant: "Warung", transaction_date: "2026-10-12", waktu: "12:00:00", ref_bank: "bri:9999:2026-10-12T12:00:00:-50000:1150000" });
const makan2 = tx({ amount: 50000, type: "expense", source: "text", merchant: "Warung", transaction_date: "2026-10-12" });
// Pindah lepas: keluar di BRI + masuk di Jago (seharusnya satu pindah kantong).
const keJago = tx({ amount: 300000, type: "expense", source: "text", merchant: "Transfer Jago", transaction_date: "2026-10-15" });
const dariBri = tx({ amount: 300000, type: "income", source: "text", merchant: "Dari BRI", kantong_id: JAGO, transaction_date: "2026-10-15" });
// Sesudah rekening koran & draft.
const sesudah = tx({ amount: 25000, type: "expense", merchant: "Parkir", transaction_date: "2026-11-02" });
const draft = tx({ amount: 75000, type: "expense", status: "needs_review", merchant: "Draft struk", transaction_date: "2026-11-03" });
const perlu = tx({ amount: 10000, type: "expense", source: "statement", perlu_dilengkapi: true, merchant: null, transaction_date: "2026-10-20", ref_bank: "bri:9999:2026-10-20T07:00:00:-10000:1140000" });
const semuaTx = [topup, gaji, makan1, makan2, keJago, dariBri, sesudah, draft, perlu];
// Saldo BRI sekarang = 1.000.000 − 200.000 + 400.000 − 50.000 − 50.000 − 300.000 − 25.000 − 10.000 = 765.000.
const p = periksaSaldo({ kantong: kantongUji[0], semuaKantong: kantongUji, transaksi: semuaTx, saldoSekarang: 765000, namaUser: ["BUDI SANTOSO"] });
assert.equal(p.rekening_koran_terakhir?.saldo_bank_di_baris_terakhir, 1140000);
assert.equal(p.rekening_koran_terakhir?.tanggal_baris_terakhir, "2026-10-20");
// Aplikasi pada 20 Okt 07.00: 1.000.000 − 200.000 + 400.000 − 50.000 − 50.000 − 300.000 − 10.000 = 790.000; bank 1.140.000.
assert.equal((p.dibandingkan as { saldo_aplikasi_pada_titik_itu: number }).saldo_aplikasi_pada_titik_itu, 790000);
assert.equal((p.dibandingkan as { selisih_aplikasi_dikurangi_bank: number }).selisih_aplikasi_dikurangi_bank, -350000);
const jenisPenyebab = p.calon_penyebab.map((x) => x.jenis);
assert.ok(jenisPenyebab.includes("dobel"), JSON.stringify(jenisPenyebab));
assert.ok(jenisPenyebab.includes("pindah_lepas"));
assert.ok(jenisPenyebab.includes("draft_belum_dihitung"));
// Dobel 50.000 + pindah lepas 300.000 = selisih 350.000 (dijelaskan berdua; masing-masing tidak cocok sendiri).
assert.equal(p.calon_penyebab.find((x) => x.jenis === "dobel")?.total, 50000);
assert.equal(p.calon_penyebab.find((x) => x.jenis === "pindah_lepas")?.total, 300000);
// Saldo bank disebut user (sekarang): transaksi sesudah rekening koran ikut jadi calon.
const p2 = periksaSaldo({ kantong: kantongUji[0], semuaKantong: kantongUji, transaksi: semuaTx, saldoSekarang: 765000, namaUser: [], saldoBank: 790000 });
assert.equal((p2.dibandingkan as { selisih_aplikasi_dikurangi_bank: number }).selisih_aplikasi_dikurangi_bank, -25000);
const lewat = p2.calon_penyebab.find((x) => x.jenis === "sesudah_rekening_koran");
assert.equal(lewat?.total, -25000);
assert.equal(lewat?.cocok_dengan_selisih, true, "parkir sesudah rekening koran persis menjelaskan selisih");
// Titik `sampai` sebelum saldo awal: tidak bisa dibandingkan, tidak mengarang angka.
const p3 = periksaSaldo({ kantong: kantongUji[0], semuaKantong: kantongUji, transaksi: semuaTx, saldoSekarang: 765000, namaUser: [], saldoBank: 1, sampai: "2026-09-01" });
assert.equal((p3.dibandingkan as { saldo_aplikasi_pada_titik_itu: number | null }).saldo_aplikasi_pada_titik_itu, null);
// Kantong tanpa rekening koran.
const pj = periksaSaldo({ kantong: kantongUji[1], semuaKantong: kantongUji, transaksi: semuaTx, saldoSekarang: 800000, namaUser: [] });
assert.equal(pj.rekening_koran_terakhir, null);

// Rekening sendiri dikenali → calon pindah kantong (cariCalonPindah, SPEC-kantong-sendiri).
const keDana = [...kantongUji, { id: DANA, name: "DANA", kind: "ewallet", aliases: [], saldo_awal: 0, saldo_per: "2026-10-01", saldo_sejak: null, induk_id: null, nomor_akhir: null } as KantongPeriksa];
const pd = periksaSaldo({ kantong: keDana[2], semuaKantong: keDana, transaksi: semuaTx, saldoSekarang: 0, namaUser: ["BUDI SANTOSO"], saldoBank: 200000 });
const tampak = pd.calon_penyebab.find((x) => x.jenis === "tampak_pindah_kantong_sendiri");
assert.equal(tampak?.jumlah_transaksi, 1);
assert.equal(tampak?.cocok_dengan_selisih, true, "top up 200.000 persis selisih saldo DANA");

const kj = cariKejanggalan(semuaTx, kantongUji, null) as Record<string, { jumlah?: number; jumlah_pasangan?: number; total?: number }> & { topup_tanpa_kantong: { lembaga: string; total: number }[] };
assert.deepEqual(kj.topup_tanpa_kantong.map((x) => [x.lembaga, x.total]), [["DANA", 200000]]);
assert.equal(kj.perlu_dilengkapi.jumlah, 1);
assert.equal(kj.draft.jumlah, 1);
assert.equal(kj.dobel.jumlah_pasangan, 1);
assert.equal(kj.pindah_lepas.jumlah_pasangan, 1);
// Sesudah kantong DANA dibuat, top up-nya bukan "tanpa kantong" lagi; jenis membatasi.
const kj2 = cariKejanggalan(semuaTx, keDana, "topup_tanpa_kantong");
assert.deepEqual(Object.keys(kj2), ["topup_tanpa_kantong"]);
assert.deepEqual(kj2.topup_tanpa_kantong, []);

// Riwayat impor diturunkan dari baris berpengenal.
const imp = riwayatImpor(semuaTx, kantongUji);
assert.deepEqual(imp.map((x) => [x.kantong, x.bank, x.bulan, x.jumlah_baris, x.saldo_bank_akhir, x.perlu_dilengkapi]), [["BRI", "BRI", "2026-10", 4, 1140000, 1]]);

// Hasil cari: total tercatat (draft terpisah), kelompok, maksimal batas baris + ringkasan sisanya.
const namaKantong = (id: string | null) => kantongUji.find((x) => x.id === id)?.name ?? null;
const rc = ringkasPencarian(semuaTx, { kelompokkan: "status", urutkan: "terbesar", batas: 2, namaKantong, namaKategori: (s) => s });
assert.equal(rc.jumlah_transaksi, 9);
assert.equal(rc.total_keluar, 200000 + 50000 + 50000 + 300000 + 25000 + 10000);
assert.deepEqual(rc.draft_belum_dihitung, { jumlah: 1, total: 75000 });
assert.deepEqual(rc.baris.map((b) => b.nominal), [400000, 300000]);
assert.equal(rc.baris_lain?.jumlah, 7);
assert.deepEqual((rc.kelompok ?? []).map((x) => x.kelompok).sort(), ["draft", "perlu dilengkapi", "tercatat"]);
const banyak = Array.from({ length: 80 }, (_, i) => tx({ amount: 1000 + i, type: "expense", transaction_date: "2026-10-01" }));
assert.equal(ringkasPencarian(banyak, { kelompokkan: "merchant", urutkan: "terbaru", batas: 50, namaKantong, namaKategori: (s) => s }).baris.length, 50);

// ---------------------------------------------------------------- putaran dua model (tiruan)
const balas = (o: { teks?: string; panggil?: { name: string; args?: object }[] }): BalasanModel => ({
  candidates: [{ content: { role: "model", parts: o.panggil ? o.panggil.map((x) => ({ functionCall: { name: x.name, args: x.args ?? {} } })) : [{ text: o.teks ?? "" }] } as Content }],
  functionCalls: () => (o.panggil?.length ? (o.panggil as FunctionCall[]) : undefined),
  text: () => o.teks ?? "",
});
const dasar = (panggil: PanggilModel, extra: Partial<Parameters<typeof jalankanAgen>[0]> = {}) =>
  jalankanAgen({
    pertanyaan: "kok saldo DANA beda?",
    riwayat: [],
    mulai: "ringan",
    panggil,
    hasilAwal: [],
    bolehBerat: async () => true,
    batasWaktu: Date.now() + 60_000,
    label: (nm) => `Langkah ${nm}…`,
    jalankanAlat: async (nm) => (nm === "periksa_saldo" ? { selisih: 200000 } : { ok: 1 }),
    ...extra,
  });

// 1. Model ringan menyerahkan → model besar melanjutkan dengan hasil yang sudah didapat.
{
  const log: { jenis: string; isi: Content[]; serahkan?: boolean }[] = [];
  const h = await dasar(async (jenis, isi, o) => {
    log.push({ jenis, isi: structuredClone(isi), serahkan: o.serahkan });
    if (jenis === "ringan") return log.length === 1 ? balas({ panggil: [{ name: "periksa_saldo", args: { kantong: "DANA" } }] }) : balas({ panggil: [{ name: "serahkan", args: { alasan: "butuh penyelidikan" } }] });
    return balas({ teks: "Selisihnya Rp 200.000 dari top up." });
  });
  assert.equal(h.model, "berat");
  assert.equal(h.jawaban, "Selisihnya Rp 200.000 dari top up.");
  assert.deepEqual(h.asing, []);
  assert.equal(h.pakaiBerat, 1);
  assert.equal(log[0].serahkan, true, "model ringan diberi alat serahkan");
  const isiBerat = log.find((x) => x.jenis === "berat")!.isi;
  assert.equal(isiBerat.length, 1);
  assert.match(String((isiBerat[0].parts[0] as { text: string }).text), /periksa_saldo[\s\S]*200000/, "hasil fungsi ikut diteruskan");
  assert.ok(!isiBerat.some((c) => c.parts.some((x) => "functionCall" in x)), "tanpa potongan panggilan fungsi model lain");
  assert.deepEqual(h.langkah, ["Langkah periksa_saldo…", "Menyelidiki lebih jauh…"]);
}
// 2. Model besar kena 429 → model ringan dengan catatan kuota; serahkan tidak ditawarkan lagi.
{
  const log: { jenis: string; serahkan?: boolean }[] = [];
  const h = await dasar(
    async (jenis, _isi, o) => {
      log.push({ jenis, serahkan: o.serahkan });
      if (jenis === "berat") throw Object.assign(new Error("[429 Too Many Requests] quota"), { status: 429 });
      return balas({ teks: "Saldo DANA belum bisa dipastikan." });
    },
    { mulai: "berat" },
  );
  assert.equal(h.model, "ringan");
  assert.equal(h.kuotaHabis, true);
  assert.equal(h.pakaiBerat, 0);
  assert.deepEqual(log, [{ jenis: "berat", serahkan: false }, { jenis: "ringan", serahkan: false }]);
  assert.equal(CATATAN_KUOTA, "Dijawab model ringan, kuota model besar hari ini habis.");
}
// 3. Jatah harian (RPD) habis menurut hitungan kita → langsung model ringan, tanpa memanggil model besar.
{
  const log: string[] = [];
  const h = await dasar(async (jenis) => (log.push(jenis), balas({ teks: "ok" })), { mulai: "berat", bolehBerat: async () => false });
  assert.deepEqual(log, ["ringan"]);
  assert.equal(h.kuotaHabis, true);
}
// 4. Putaran model ringan habis → naik otomatis; di model besar putarannya 10.
{
  const log: string[] = [];
  const h = await dasar(async (jenis) => {
    log.push(jenis);
    if (jenis === "ringan") return balas({ panggil: [{ name: "cari", args: { sumber: "transaksi" } }] });
    return log.filter((x) => x === "berat").length <= 3 ? balas({ panggil: [{ name: "cari", args: { sumber: "kantong" } }] }) : balas({ teks: "Beres." });
  });
  assert.equal(log.filter((x) => x === "ringan").length, 5, "4 putaran + panggilan pertama");
  assert.equal(h.model, "berat");
  assert.equal(h.jawaban, "Beres.");
}
// 5. Angka gagal diperiksa dua kali di model ringan → model besar melanjutkan.
{
  const log: string[] = [];
  const h = await dasar(async (jenis) => (log.push(jenis), balas({ teks: jenis === "ringan" ? "Total Rp 999.999." : "Belum ada angka pasti." })));
  assert.deepEqual(log, ["ringan", "ringan", "berat"]);
  assert.equal(h.jawaban, "Belum ada angka pasti.");
  assert.deepEqual(h.asing, []);
}
// 6. Batas waktu: sisa sedikit → model diminta menjawab tanpa alat; waktu habis di tengah panggilan → jawaban sebagian dari kode.
{
  let t = 0;
  const opsi: boolean[] = [];
  const h = await dasar(
    async (_j, _isi, o) => {
      opsi.push(Boolean(o.tanpaAlat));
      t += 40_000;
      return o.tanpaAlat ? balas({ teks: "Yang sudah ketemu: top up DANA. Mau kulanjutkan?" }) : balas({ panggil: [{ name: "cari", args: {} }] });
    },
    { sekarang: () => t, batasWaktu: 50_000, mulai: "berat" },
  );
  assert.deepEqual(opsi, [false, true]);
  assert.equal(h.lanjutkan, true);
  assert.match(h.jawaban, /lanjutkan/i);
}
{
  const h = await dasar(async () => new Promise<BalasanModel>(() => {}), { batasWaktu: Date.now() + 3_200 });
  assert.equal(h.lanjutkan, true);
  assert.match(h.jawaban, /^Waktunya habis/);
  assert.deepEqual(h.asing, []);
}
// 7. Galat lain (bukan kuota) tetap dilempar → route menjawab "sibuk".
await assert.rejects(dasar(async () => Promise.reject(new Error("fetch failed"))), /fetch failed/);

// ---------------------------------------------------------------- aliran NDJSON
{
  const u = pengurai<{ jawaban: string }>();
  const teks = barisAlir({ t: "langkah", teks: "Mencari top up DANA…" }) + barisAlir({ t: "langkah", teks: "Memeriksa saldo BRI…" }) + "bukan json\n" + barisAlir({ t: "jawaban", isi: { jawaban: "Rp 200.000 dari top up" } });
  // Dipotong di sembarang tempat, termasuk di tengah karakter multibyte (… → sudah jadi string di sini).
  const hasil = [...u.tambah(teks.slice(0, 7)), ...u.tambah(teks.slice(7, 60)), ...u.tambah(teks.slice(60)), ...u.selesai()];
  assert.deepEqual(hasil, [
    { t: "langkah", teks: "Mencari top up DANA…" },
    { t: "langkah", teks: "Memeriksa saldo BRI…" },
    { t: "jawaban", isi: { jawaban: "Rp 200.000 dari top up" } },
  ]);
  const u2 = pengurai();
  assert.deepEqual([...u2.tambah('{"t":"galat","error":"Lagi sibuk"}'), ...u2.selesai()], [{ t: "galat", error: "Lagi sibuk" }], "baris terakhir tanpa ganti baris");
}

console.log("✓ agen: pilih model (mudah/berat), argumen alat baru dibersihkan, periksa_saldo & cari_kejanggalan (dobel, pindah lepas, top up DANA tanpa kantong, sesudah rekening koran, draft), riwayat impor, hasil cari ≤ 50 baris, serahkan & naik otomatis, 429 → model ringan + catatan, jatah harian, batas waktu + Lanjutkan, aliran NDJSON");
