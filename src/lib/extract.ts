import { SchemaType, type GenerationConfig } from "@google/generative-ai";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";
import { runGroqChain, parseJsonLoose } from "@/lib/groq";
import { KATEGORI_KELUAR, KATEGORI_MASUK, kategoriUntuk } from "@/lib/format";
import type { ExtractedReceipt, TransactionType } from "@/types/transaction";

// Kategori yang diizinkan — sumbernya sama dengan UI (lib/format.ts).
const KAT_KELUAR = Object.keys(KATEGORI_KELUAR).join(", ");
const KAT_MASUK = Object.keys(KATEGORI_MASUK).join(", ");

/** Nominal pelengkap dari model (biaya admin, cashback): angka > 0 atau null. */
const nominalAtauNull = (v: unknown) => (Number(v) > 0 ? Math.round(Number(v)) : null);

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Prompt bersama (dipakai Groq maupun Gemini agar hasilnya konsisten)
// ---------------------------------------------------------------------------

function buildSystemPrompt(todayISO: string): string {
  return `Anda adalah mesin ekstraksi data transaksi keuangan berbahasa Indonesia.
Kembalikan HANYA objek JSON valid sesuai skema.

Skema:
{
  "amount": number,
  "type": "income" | "expense" | "transfer",
  "merchant": string | null,
  "category": string,
  "transaction_date": "YYYY-MM-DD",
  "description": string | null,
  "payment_method": string | null,
  "payment_target": string | null,
  "fee": number | null,
  "cashback": number | null,
  "document_type": "receipt" | "payment_proof"
}

Aturan:
- amount: nilai KEWAJIBAN transaksi, dalam angka murni Rupiah tanpa simbol
  maupun pemisah ribuan.
  Pahami singkatan: "10k"/"10rb"/"10ribu" = 10000, "1,5jt"/"1.5juta" = 1500000.

  Pada struk belanja, ambil baris TOTAL / TOTAL BELANJA / GRAND TOTAL / JUMLAH.
  JANGAN mengambil:
    * TUNAI / CASH / BAYAR / TENDER  -> itu uang yang diserahkan pembeli
    * KEMBALI / KEMBALIAN / CHANGE   -> itu uang kembalian
    * SUBTOTAL, harga satuan, PPN, atau diskon
  Bila baris TOTAL terbaca, SELALU pakai angka itu apa adanya. Jangan pernah
  menghitung ulang dari TUNAI dikurangi KEMBALI: kedua baris itu justru lebih
  sering salah baca, dan hasil hitungnya akan menimpa angka yang sudah benar.
  Contoh: "TOTAL 37.000 / TUNAI 50.000 / KEMBALI 19.000" -> amount = 37000,
  meskipun 50.000 - 19.000 tidak sama dengan 37.000.
  Hanya bila TOTAL benar-benar tidak ada, pakai TUNAI - KEMBALI sebagai dugaan.

  Pada bukti pembayaran digital (ShopeePay/GoPay/OVO/DANA/QRIS), ambil nominal
  utama transaksi yang biasanya tercetak paling besar di bagian atas. JANGAN
  mengambil angka promo/cashback ("Cashback up to ..."), sisa saldo, nomor
  kartu, PAN, RRN, atau ID transaksi.
- type: arah uang dari sudut pandang PEMILIK catatan.
  "income" bila uang MASUK ke pemilik: gaji/gajian, THR, bonus, cashback,
  refund, bunga, hasil jual barang, atau uang yang dikasih/dikirim/ditransfer
  orang lain ("dikasih ibu", "dapet dari teman", "terima transferan", "dibayar klien").
  "expense" bila uang KELUAR untuk membeli, membayar, atau memberi ke orang lain (default).
  "transfer" HANYA untuk memindahkan uang antar rekening/dompet milik sendiri:
  topup e-wallet ("topup gopay 100rb dari bca"), tarik tunai, atau "pindahin
  500rb dari bca ke seabank". Transfer ke orang lain atau bayar tagihan tetap
  "expense".
- category: tergantung type.
  Untuk "expense" WAJIB salah satu dari: ${KAT_KELUAR}.
    Petunjuk: makan/jajan/kopi/gorengan=food; belanja bulanan/indomaret/supermarket=groceries;
    gojek/grab/bensin/parkir/tol=transport; baju/elektronik/tokopedia/shopee=shopping;
    obat/dokter/rumah sakit=health; nonton/game/langganan=entertainment;
    listrik/pln/air/pulsa/internet/wifi=bills; biaya admin/biaya transfer=fees; sisanya=other.
  Untuk "income" WAJIB salah satu dari: ${KAT_MASUK}.
    Petunjuk: gaji/gajian=salary; bonus/THR/insentif=bonus; jualan/usaha/omzet=business;
    freelance/proyek/dibayar klien=freelance; dikasih/hadiah/angpao/kiriman ortu=gift;
    cashback/refund/pengembalian dana=refund; bunga/dividen/hasil investasi=investment; sisanya=other.
  Untuk "transfer" selalu "other".
- merchant: nama toko/tempat/lokasi bila ada, jika tidak null. Untuk
  "income": sumber uangnya bila disebut ("Ibu", "Kantor"). Nama bank/dompet
  BUKAN merchant — itu payment_method.
- transaction_date: format "YYYY-MM-DD". Jika tidak disebut, gunakan hari ini: ${todayISO}.
- description: ringkasan singkat isi transaksi, boleh null.
- payment_method: metode bayar bila disebut, normalkan istilah gaul/singkatan:
  "sopipay"/"spay"/"shopee pay"=ShopeePay; "gopay"=GoPay; "ovo"=OVO; "dana"=DANA;
  "qris"=QRIS; "cash"/"tunai"/"cod"=Tunai; "transfer"/"tf"/"m-banking"=Transfer;
  "kartu"/"debit"/"kredit"/"visa"=Kartu. Jika tidak disebut null.
  Kalau nama bank/dompet disebut, pakai NAMA itu, bukan "Transfer"/"Kartu":
  "tf mandiri" -> Mandiri; "masuk seabank" -> SeaBank; "debit bca" -> BCA.
  Untuk "income", ini rekening/dompet tempat uang MASUK ("masuk bca", "ke bri" -> BRI).
  Untuk "transfer", ini rekening/dompet ASAL uangnya ("tarik tunai dari bca" -> BCA).
- payment_target: HANYA untuk "transfer", rekening/dompet TUJUAN dengan
  normalisasi yang sama ("topup gopay dari bca" -> GoPay; tarik tunai -> Tunai).
  Selain transfer null.
- fee: HANYA untuk "transfer": biaya admin yang disebut ("admin 1000", "biaya 2,5rb"
  -> 2500). Selain itu null.
- cashback: HANYA untuk "expense": cashback yang BENAR-BENAR didapat dari belanja
  itu ("cashback 5rb", "dapet koin 2rb"). BUKAN promo "Cashback up to ...". Selain itu null.
  Cashback tanpa belanja ("dapet cashback 5rb") adalah "income" kategori refund.
- document_type: "payment_proof" bila ini tangkapan layar bukti bayar dari
  aplikasi (ShopeePay/GoPay/OVO/DANA/QRIS/m-banking), "receipt" bila ini struk
  kertas dari mesin kasir. Dipakai untuk mencegah transaksi tercatat dua kali
  saat rekening koran diimpor.

Contoh teks ketikan (field lain mengikuti aturan di atas):
- "dikasih duit ibu 500k ke bri" -> type "income", amount 500000, merchant "Ibu", payment_method "BRI", payment_target null
- "gajian 8jt masuk bca" -> type "income", amount 8000000, merchant null, payment_method "BCA"
- "topup gopay 100rb dari bca" -> type "transfer", payment_method "BCA", payment_target "GoPay"
- "transfer ke budi 50rb pake bca" -> type "expense", merchant "Budi", payment_method "BCA"
- "kopi 25rb gopay" -> type "expense", category "food", payment_method "GoPay"
- "beli pulsa 50rb shopeepay cashback 5rb" -> type "expense", category "bills", payment_method "ShopeePay", cashback 5000
- "topup gopay 100rb dari bca admin 1000" -> type "transfer", payment_method "BCA", payment_target "GoPay", fee 1000

Jangan menambahkan teks/penjelasan/markdown di luar JSON.`;
}

// Konteks tambahan khusus teks OCR: model harus tahu inputnya kotor.
const OCR_CONTEXT = `Teks berikut berasal dari OCR struk belanja, jadi mungkin mengandung
salah baca karakter (0/O, 1/l, 8/B), baris terpotong, atau kolom yang tercampur.
Gunakan penalaran untuk memulihkan angka yang masuk akal. Jika nominal total
benar-benar tidak dapat ditentukan, kembalikan amount 0.`;

// ---------------------------------------------------------------------------
// Normalisasi & validasi
// ---------------------------------------------------------------------------

/** Rapikan hasil mentah model menjadi ExtractedReceipt yang konsisten. */
export function normalize(parsed: Partial<ExtractedReceipt>): ExtractedReceipt {
  const type: TransactionType =
    parsed.type === "income" || parsed.type === "transfer" ? parsed.type : "expense";

  const kategori = typeof parsed.category === "string" ? parsed.category.toLowerCase() : "";
  const category = kategori in kategoriUntuk(type) ? kategori : "other";

  return {
    amount: Number(parsed.amount) || 0,
    type,
    category,
    merchant: parsed.merchant?.toString().trim() || null,
    description: parsed.description?.toString().trim() || null,
    payment_method: parsed.payment_method?.toString().trim() || null,
    payment_target: type === "transfer" ? parsed.payment_target?.toString().trim() || null : null,
    fee: type === "transfer" ? nominalAtauNull(parsed.fee) : null,
    cashback: type === "expense" ? nominalAtauNull(parsed.cashback) : null,
    document_type: parsed.document_type === "payment_proof" ? "payment_proof" : "receipt",
    transaction_date:
      typeof parsed.transaction_date === "string" && parsed.transaction_date
        ? parsed.transaction_date
        : toISODate(new Date()),
  };
}

/**
 * Gerbang validasi terakhir sebelum data masuk database.
 * Hasil yang lolos parsing JSON belum tentu masuk akal: model bisa mengembalikan
 * amount 0 atau tanggal ngawur ketika inputnya tidak terbaca.
 */
export function isValidExtraction(r: ExtractedReceipt): boolean {
  if (!Number.isFinite(r.amount) || r.amount <= 0) return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.transaction_date)) return false;
  const date = new Date(`${r.transaction_date}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;

  // Toleransi 1 hari ke depan untuk selisih zona waktu.
  const besok = new Date(Date.now() + 86_400_000);
  const batasBawah = new Date("2000-01-01T00:00:00Z");
  if (date > besok || date < batasBawah) return false;

  return r.category in kategoriUntuk(r.type);
}

// ---------------------------------------------------------------------------
// Jalur utama: Groq (teks)
// ---------------------------------------------------------------------------

export interface GroqExtraction {
  extracted: ExtractedReceipt;
  model: string;
}

/** Ekstraksi satu struk dari teks OCR, lewat rantai model Groq. */
export async function extractWithGroq(text: string): Promise<GroqExtraction> {
  const { value, model } = await runGroqChain<Partial<ExtractedReceipt>>(
    buildSystemPrompt(toISODate(new Date())),
    `${OCR_CONTEXT}\n\n---\n${text}`,
  );
  return { extracted: normalize(value), model };
}

// ---------------------------------------------------------------------------
// Jaring pengaman: Gemini Vision (gambar asli, melewati OCR sepenuhnya)
// ---------------------------------------------------------------------------

const geminiSchema: GenerationConfig["responseSchema"] = {
  type: SchemaType.OBJECT,
  properties: {
    amount: { type: SchemaType.NUMBER },
    type: { type: SchemaType.STRING, format: "enum", enum: ["income", "expense", "transfer"] },
    merchant: { type: SchemaType.STRING, nullable: true },
    category: { type: SchemaType.STRING },
    transaction_date: { type: SchemaType.STRING },
    description: { type: SchemaType.STRING, nullable: true },
    payment_method: { type: SchemaType.STRING, nullable: true },
    payment_target: { type: SchemaType.STRING, nullable: true },
    fee: { type: SchemaType.NUMBER, nullable: true },
    cashback: { type: SchemaType.NUMBER, nullable: true },
    document_type: { type: SchemaType.STRING, format: "enum", enum: ["receipt", "payment_proof"] },
  },
  required: ["amount", "type", "category", "transaction_date"],
};

/**
 * Pilihan terakhir: baca gambar aslinya langsung dengan model vision.
 * Paling mahal token dan paling terbatas kuotanya, jadi hanya dipakai bila OCR
 * menghasilkan sampah atau seluruh rantai Groq gagal.
 */
export async function extractWithGeminiVision(
  base64Image: string,
  mimeType: string,
): Promise<ExtractedReceipt> {
  const model = getGeminiClient().getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: buildSystemPrompt(toISODate(new Date())),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: geminiSchema,
      temperature: 0,
    },
  });

  // Ini pilihan terakhir — tidak ada jalur lain di belakangnya. Gemini kerap
  // membalas 503 "high demand" yang sifatnya sesaat, jadi menyerah pada
  // percobaan pertama berarti membuang struk yang sebenarnya masih bisa dibaca.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1500 * attempt)); // 1.5s, lalu 3s
    }
    try {
      const result = await model.generateContent([
        { inlineData: { data: base64Image, mimeType } },
        { text: "Ekstrak data dari struk ini." },
      ]);
      return normalize(parseJsonLoose(result.response.text()));
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err)) throw err;
    }
  }

  throw lastError;
}

/** 429/500/503 bersifat sesaat; sisanya (mis. API key salah) diulang pun gagal. */
function isRetryableGeminiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|500|502|503|504)\b/.test(message) || /high demand|overloaded|timeout/i.test(message);
}
