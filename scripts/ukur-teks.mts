/**
 * Ukur ketepatan AI membaca teks ketikan Catat (SPEC-ai-kantong) lewat KODE
 * PRODUKSI (processReceiptText, Groq sungguhan): satu kalimat per aturan
 * prompt, dibandingkan dengan isian yang diharapkan. Dipakai sebelum & sesudah
 * mengubah prompt. Juga mencetak perkiraan ukuran prompt sistem.
 *
 * Memakai kuota Groq (kasus × UKUR_ULANG panggilan), jadi tidak otomatis.
 * Pemakaian: npm run ukur:teks          (UKUR_ULANG=1, UKUR_JEDA=15000 ms bawaan)
 *            UKUR_HANYA=kantong npm run ukur:teks   (kasus berlabel tertentu)
 */
import { KATEGORI_BAWAAN } from "@/lib/kategori";
import { cocokkanKantong } from "@/lib/kantong";
import { processReceiptText } from "@/lib/receipt";
import type { ExtractedReceipt } from "@/types/transaction";

const KANTONG = ["BCA", "GoPay", "Tunai", "Jago", "Liburan", "Dana Darurat", "Tabungan Nikah"];
const konteks = {
  kategori: KATEGORI_BAWAAN,
  pihak: ["Budi", "Ibu", "Kartu kredit BCA"],
  cicilan: [{ nama: "HP Samsung", penyedia: "Shopee PayLater" }],
  kantong: KANTONG,
};
const daftar = KANTONG.map((name) => ({ name }));
const kantongnya = (teks: string | null | undefined) => cocokkanKantong(teks, daftar)?.name ?? teks ?? null;

type Harap = Partial<Record<keyof ExtractedReceipt | "dari" | "ke", unknown>>;
const KASUS: [label: string, teks: string, harap: Harap][] = [
  ["dasar", "kopi 25rb gopay", { type: "expense", amount: 25000, category: "food", dari: "GoPay" }],
  ["dasar", "gajian 8jt masuk bca", { type: "income", amount: 8000000, category: "salary", dari: "BCA" }],
  ["dasar", "dikasih ibu 500rb ke jago", { type: "income", amount: 500000, dari: "Jago" }],
  ["dasar", "transfer ke budi 50rb pake bca buat bayar makan", { type: "expense", amount: 50000, dari: "BCA" }],
  ["kantong", "sisihkan 200rb dari bca ke Liburan", { type: "transfer", dari: "BCA", ke: "Liburan" }],
  ["kantong", "nabung 500rb ke dana darurat pakai gopay", { type: "transfer", dari: "GoPay", ke: "Dana Darurat" }],
  ["kantong", "pindahin 1jt dari jago ke tabungan nikah", { type: "transfer", dari: "Jago", ke: "Tabungan Nikah" }],
  ["kantong", "topup jago 300rb dari bca admin 2500", { type: "transfer", dari: "BCA", ke: "Jago", fee: 2500 }],
  ["kantong", "ambil 100rb dari liburan ke tunai", { type: "transfer", dari: "Liburan", ke: "Tunai" }],
  ["kantong", "tarik tunai 250rb dari bca", { type: "transfer", dari: "BCA", ke: "Tunai" }],
  ["pinjaman", "minjemin budi 200rb dari bca", { type: "transfer", pinjaman: { arah: "beri", pihak: "Budi" } }],
  ["pinjaman", "budi balikin 100rb ke gopay", { type: "transfer", pinjaman: { arah: "terima_bayar", pihak: "Budi" } }],
  ["cicilan", "bayar cicilan spaylater 150rb pake bca", { type: "expense", cicilan: "Shopee PayLater" }],
  ["paylater", "beli sepatu 600rb kredivo 3x", { type: "expense", paylater: { penyedia: "Kredivo", tenor: 3 } }],
  ["lain", "beli pulsa 50rb shopeepay cashback 5rb", { type: "expense", cashback: 5000 }],
  ["lain", "15rb di indomaret, 10rb sabun 5rb kopi pake tunai", { type: "expense", amount: 15000, rincian: 2 }],
  ["lain", "zakat 250rb lewat bca", { type: "expense", kelompok: "berbagi" }],
  ["lain", "tadi pagi beli roti 12rb tunai", { type: "expense", time_hint: "pagi" }],
];

const ULANG = Number(process.env.UKUR_ULANG ?? 1);
// Jeda antar panggilan: rantai Groq dibatasi ±8.000 token/menit per model.
const JEDA = Number(process.env.UKUR_JEDA ?? 15000);
const HANYA = process.env.UKUR_HANYA;
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Isian yang meleset dari harapan; kosong = benar. */
function meleset(e: ExtractedReceipt, harap: Harap): string[] {
  const salah: string[] = [];
  for (const [k, v] of Object.entries(harap)) {
    const dapat =
      k === "dari" ? kantongnya(e.payment_method) : k === "ke" ? kantongnya(e.payment_target) : k === "rincian" ? (e.rincian?.length ?? 0) : e[k as keyof ExtractedReceipt];
    const cocok =
      v && typeof v === "object"
        ? Object.entries(v).every(([kk, vv]) => (dapat as Record<string, unknown> | null)?.[kk] === vv)
        : dapat === v;
    if (!cocok) salah.push(`${k}=${JSON.stringify(dapat)}`);
  }
  return salah;
}

let benar = 0;
let dihitung = 0;
let gagalAi = 0;
for (const [label, teks, harap] of KASUS) {
  if (HANYA && label !== HANYA) continue;
  const hasil: string[] = [];
  for (let i = 0; i < ULANG; i++) {
    await tidur(JEDA);
    const r = await processReceiptText(teks, konteks);
    if (r.source === "none" || !r.extracted) {
      gagalAi++;
      hasil.push("…AI gagal");
      continue;
    }
    dihitung++;
    const salah = meleset(r.extracted, harap);
    if (!salah.length) benar++;
    // (G) = dijawab cadangan Gemini karena rantai Groq penuh.
    const lewat = r.source === "gemini_text" ? "(G)" : "";
    hasil.push(salah.length ? `✗${lewat} ${salah.join(" ")}` : `✓${lewat}`);
  }
  console.log(`[${label}] ${teks}\n   ${hasil.join("  ")}`);
}
console.log(`\nBenar ${benar}/${dihitung}${gagalAi ? ` · ${gagalAi} panggilan AI gagal (tidak dihitung)` : ""}`);
