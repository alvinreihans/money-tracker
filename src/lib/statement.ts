import { createHash } from "node:crypto";
import { runGroqChain, isRateLimited, parseRetryAfterMs } from "@/lib/groq";
import { CATEGORIES } from "@/lib/extract";
import { extractPdfText, looksLikeScannedPdf } from "@/lib/pdf";
import { accountNames } from "@/lib/accounts";
import type {
  StatementLine,
  TransactionType,
  UserAccount,
} from "@/types/transaction";

/**
 * Parsing rekening koran PDF menjadi daftar transaksi.
 *
 * Diproses PER HALAMAN, bukan sekaligus, karena dua alasan:
 *  1. Limit Groq 8K token/menit — statement 7 halaman bisa menembusnya.
 *  2. Akurasi: satu halaman sekaligus membuat model lebih jarang melewatkan
 *     baris di tengah daftar panjang.
 *
 * Struktur tabel tiap bank berbeda (SeaBank, BRImo, dan Jago yang bahkan punya
 * konsep "kantong"), jadi pembacaan strukturnya diserahkan ke LLM alih-alih
 * parser bespoke per bank — dengan begitu bank keempat tidak butuh kode baru.
 */

export interface ParsedStatement {
  lines: StatementLine[];
  pagesProcessed: number;
  totalPages: number;
  /** Rekening yang terdeteksi dari isi PDF; null bila tidak yakin. */
  detectedAccount: string | null;
  notes: string[];
}

/**
 * Tebak rekening pemilik statement dari isi PDF, supaya user tidak perlu
 * memilih manual tiap kali unggah. Dicocokkan ke daftar rekening user dulu,
 * baru ke nama bank yang umum.
 */
export function detectAccount(
  pages: string[],
  accounts: UserAccount[],
): string | null {
  // Header rekening koran selalu di halaman pertama.
  const head = pages.slice(0, 2).join(" ").toLowerCase();

  for (const account of accounts) {
    if (accountNames(account).some((k) => head.includes(k.toLowerCase()))) {
      return account.name;
    }
  }

  const bankUmum = ["SeaBank", "BRI", "Jago", "BCA", "Mandiri", "BNI", "Permata"];
  for (const bank of bankUmum) {
    if (head.includes(bank.toLowerCase())) return bank;
  }
  return null;
}

/** Jeda antar halaman supaya konsumsi token tidak menumpuk di satu menit. */
const PAGE_DELAY_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StatementResponse {
  transactions?: Partial<StatementLine>[];
}

function buildStatementPrompt(accounts: UserAccount[], year: number): string {
  const daftarAkun =
    accounts.length > 0
      ? accounts.map((a) => a.name).join(", ")
      : "(belum didaftarkan)";

  return `Anda adalah mesin ekstraksi rekening koran bank Indonesia.
Kembalikan HANYA objek JSON: {"transactions": [ ... ]}

Bentuk tiap elemen:
{
  "transaction_date": "YYYY-MM-DD",
  "description": string,
  "counterparty": string | null,
  "amount": number,
  "type": "income" | "expense" | "transfer",
  "category": string,
  "payment_method": string | null
}

Aturan:
- Ambil HANYA baris transaksi yang sesungguhnya. ABAIKAN: judul kolom, ringkasan
  saldo, "Saldo Awal/Akhir", "Total Pemasukan/Pengeluaran", rincian deposito,
  nama & alamat pemilik, nomor rekening, teks legal, dan nomor halaman.
  Bila halaman ini tidak memuat satu pun baris transaksi, kembalikan array kosong.
- amount SELALU positif. Arah uang dinyatakan lewat "type", bukan lewat tanda minus.
- Menentukan arah uang:
  * Bila ada kolom KELUAR/MASUK atau DEBET/KREDIT yang jelas, ikuti kolom itu.
  * Bila hanya ada satu angka lalu SALDO, bandingkan dengan SALDO baris
    sebelumnya. Saldo berkurang = uang keluar. Saldo bertambah = uang masuk.

- type — ini bagian paling penting, salah di sini merusak laporan:
  Rekening & dompet MILIK USER: ${daftarAkun}

  * "transfer" HANYA bila uang berpindah antar rekening/dompet milik user
    sendiri. Penandanya kata seperti: Top Up, Topup, Isi Saldo, Transfer ke
    rekening sendiri, Pemindahan Dana.
    Contoh: "Top Up Shopee" dari rekening bank = transfer. Saldo ShopeePay
    bertambah, uang user TIDAK berkurang — jadi ini BUKAN pengeluaran.

  * "expense" bila uang benar-benar keluar ke pihak lain, WALAUPUN lawan
    transaksinya tertulis nama dompet milik user.
    Contoh penting: baris "ShopeePay / Pembayaran" di rekening koran bank adalah
    fitur bayar instan — ShopeePay hanya jalurnya, uangnya langsung ditarik dari
    bank untuk membayar merchant. Itu PENGELUARAN, bukan transfer.
    Pembeda: kata "Pembayaran"/"Payment"/"Purchase" = expense;
    kata "Top Up"/"Isi Saldo" = transfer.

  * "income" bila uang masuk dan bukan transfer: bunga tabungan, gaji, refund,
    cashback, transfer masuk dari orang lain.

- category: WAJIB salah satu dari: ${CATEGORIES.join(", ")}.
  Rekening koran jarang menyebut barang yang dibeli, jadi BERSIKAPLAH KONSERVATIF.
  * Bila keterangannya hanya nama jalur pembayaran tanpa nama merchant
    ("Pembayaran", "ShopeePay Pembayaran", "Shopee Pembayaran", "QRIS",
    "Debit Card"), kategorinya WAJIB "other". JANGAN menebak "shopping" hanya
    karena ada kata Shopee — itu nama dompetnya, bukan barang yang dibeli.
  * Pakai kategori spesifik HANYA bila nama merchant atau jenis tagihan benar-
    benar tertulis, mis. "Telkomsel"/"PLN"/"Indihome" = bills,
    "Gojek"/"Grab"/"SPBU" = transport.
  * Biaya admin, biaya bulanan, bunga, dan pajak = bills.
  * Untuk type "transfer", selalu "other".
  Salah menebak kategori lebih merusak daripada menulis "other": baris ini nanti
  akan dilengkapi otomatis oleh bukti pembayaran yang memuat nama merchant.
- transaction_date: bila tahun tidak tertulis pada barisnya, pakai tahun ${year}.
- counterparty: nama lawan transaksi apa adanya dari rekening koran,
  mis. "ShopeePay", "Bunga Tabungan", "Admin Fee".
- payment_method: nama rekening/dompet bila jelas, selain itu null.

Jangan menambahkan teks/penjelasan/markdown di luar JSON.`;
}

/** Tahun periode statement; dipakai untuk baris bertanggal "01 SEP" tanpa tahun. */
function detectYear(pages: string[]): number {
  const match = pages.join(" ").match(/\b(20\d{2})\b/);
  const year = match ? Number(match[1]) : NaN;
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function normalizeLine(
  raw: Partial<StatementLine>,
  year: number,
): StatementLine | null {
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const date =
    typeof raw.transaction_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(raw.transaction_date)
      ? raw.transaction_date
      : null;
  if (!date) return null;

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Tahun yang meleset jauh dari periode statement hampir pasti salah baca.
  const tahunBaris = parsed.getUTCFullYear();
  if (Math.abs(tahunBaris - year) > 1) return null;

  const type: TransactionType =
    raw.type === "income" || raw.type === "transfer" ? raw.type : "expense";

  const category =
    typeof raw.category === "string" &&
    (CATEGORIES as readonly string[]).includes(raw.category.toLowerCase())
      ? raw.category.toLowerCase()
      : "other";

  return {
    transaction_date: date,
    description: raw.description?.toString().trim() || "(tanpa keterangan)",
    counterparty: raw.counterparty?.toString().trim() || null,
    amount,
    type,
    category: type === "transfer" ? "other" : category,
    payment_method: raw.payment_method?.toString().trim() || null,
  };
}

/**
 * Kunci idempoten sebuah baris rekening koran.
 * Mengimpor ulang file yang sama tidak boleh menggandakan transaksi, sementara
 * dua transaksi berbeda yang kebetulan sama nominal & tanggalnya harus tetap
 * terhitung dua — karena itu urutan baris (`index`) ikut masuk hash.
 */
export function buildExternalId(
  accountName: string,
  line: StatementLine,
  index: number,
): string {
  const raw = [
    accountName,
    line.transaction_date,
    line.amount.toFixed(2),
    line.description.toLowerCase().replace(/\s+/g, " "),
    index,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/** Parse seluruh PDF rekening koran menjadi daftar transaksi. */
export async function parseStatement(
  buffer: Buffer,
  accounts: UserAccount[],
): Promise<ParsedStatement> {
  const notes: string[] = [];
  const pdf = await extractPdfText(buffer);

  if (looksLikeScannedPdf(pdf)) {
    throw new Error(
      "PDF ini tampaknya hasil scan (tidak memuat teks). Unduh ulang rekening koran asli dari aplikasi bank, jangan hasil foto/scan.",
    );
  }

  const year = detectYear(pdf.pages);
  const system = buildStatementPrompt(accounts, year);
  const lines: StatementLine[] = [];
  let pagesProcessed = 0;

  for (const [i, page] of pdf.pages.entries()) {
    // Halaman sampul/legal sering nyaris tanpa angka; melewatinya menghemat
    // kuota dan mengurangi peluang model mengarang baris.
    if (page.replace(/\s/g, "").length < 80) continue;

    const user = `Halaman ${i + 1} dari ${pdf.totalPages}:\n\n---\n${page}`;
    let halaman: StatementLine[] | null = null;
    let lastError: unknown = null;

    // Satu halaman statement bisa ~3.5K token, sedangkan batas Groq 8K per
    // menit per model. Statement panjang pasti menabraknya kalau halaman
    // ditembakkan beruntun — jadi kena 429 berarti menunggu, bukan menyerah.
    for (let percobaan = 0; percobaan < 2; percobaan++) {
      try {
        const { value } = await runGroqChain<StatementResponse>(system, user, (v) =>
          Array.isArray(v?.transactions),
        );
        halaman = (value.transactions ?? [])
          .map((l) => normalizeLine(l, year))
          .filter((l): l is StatementLine => l !== null);
        break;
      } catch (err) {
        lastError = err;
        if (percobaan === 0 && isRateLimited(err)) {
          const tunggu = parseRetryAfterMs(err) ?? 8000;
          notes.push(`Halaman ${i + 1}: kena batas kuota, menunggu ${Math.round(tunggu / 1000)} detik`);
          await sleep(tunggu);
          continue;
        }
        break;
      }
    }

    if (halaman) {
      lines.push(...halaman);
      pagesProcessed++;
      notes.push(`Halaman ${i + 1}: ${halaman.length} transaksi`);
    } else {
      const message = lastError instanceof Error ? lastError.message : "Unknown error";
      notes.push(`Halaman ${i + 1} GAGAL: ${message}`);
    }

    // Jeda antar halaman agar konsumsi token tidak menumpuk dalam satu menit.
    if (i < pdf.pages.length - 1) await sleep(PAGE_DELAY_MS);
  }

  return {
    lines,
    pagesProcessed,
    totalPages: pdf.totalPages,
    detectedAccount: detectAccount(pdf.pages, accounts),
    notes,
  };
}
