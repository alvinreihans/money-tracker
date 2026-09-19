import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExternalId, type ParsedStatement } from "@/lib/statement";
import { walletNames } from "@/lib/accounts";
import type { StatementLine, UserAccount } from "@/types/transaction";

/**
 * Menyimpan hasil parsing rekening koran ke database dengan dua lapis
 * deduplikasi. Tanpa ini, satu transaksi bisa tercatat dua kali dan laporan
 * pengeluaran jadi lebih besar dari kenyataan.
 */

export interface ImportResult {
  parsed: number;
  inserted: number;
  /** Baris yang sudah pernah diimpor dari file yang sama. */
  skippedReimport: number;
  /** Baris yang sudah terwakili oleh bukti pembayaran yang lebih lengkap. */
  skippedSuperseded: number;
  account: string;
  notes: string[];
}

/** Toleransi selisih tanggal saat mencocokkan baris statement dgn bukti bayar. */
const DEDUPE_DAY_WINDOW = 2;

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(
    new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime(),
  );
  return ms / 86_400_000;
}

/**
 * Apakah baris ini sekadar "jalur pembayaran" tanpa identitas merchant?
 *
 * Baris semacam "ShopeePay Pembayaran" di rekening bank adalah sisi bank dari
 * transaksi bayar-instan: merchant-nya tidak tertulis. Kalau user juga mengirim
 * screenshot buktinya, transaksi yang SAMA akan masuk dua kali — dan bukti
 * pembayaranlah yang layak menang karena memuat nama merchant serta kategori.
 *
 * Baris dengan merchant jelas (mis. "Telkomsel") tetap diperiksa juga, karena
 * kasus itu pun bisa punya bukti pembayaran tersendiri.
 */
function isDedupeCandidate(line: StatementLine, wallets: string[]): boolean {
  if (line.type !== "expense") return false;

  const teks = `${line.counterparty ?? ""} ${line.description}`.toLowerCase();
  const lewatDompet = wallets.some((w) => teks.includes(w.toLowerCase()));
  const kataBayar = /(pembayaran|payment|purchase|qris|debit)/.test(teks);

  return lewatDompet || kataBayar;
}

/**
 * Simpan transaksi dari gambar (struk/bukti bayar) sambil menyingkirkan baris
 * rekening koran yang ternyata mewakili transaksi yang sama.
 *
 * Dedup di importStatement() hanya bekerja satu arah: statement diimpor SETELAH
 * buktinya ada. Urutan sebaliknya juga lumrah — statement bulanan diunggah
 * duluan, buktinya menyusul — dan tanpa fungsi ini transaksi itu tercatat dua
 * kali. Bukti bayar yang menang karena memuat nama merchant dan kategori,
 * sementara baris statement cuma tertulis "Pembayaran".
 */
export async function insertFromImage(
  supabase: SupabaseClient,
  userId: string,
  row: Record<string, unknown>,
): Promise<{ supersededStatement: boolean; transaction: unknown }> {
  const amount = Number(row.amount);
  const date = String(row.transaction_date);
  const tunai = String(row.payment_method ?? "").toLowerCase() === "tunai";

  let supersededStatement = false;

  // Transaksi tunai tidak pernah muncul di rekening koran, jadi tidak ada yang
  // perlu disingkirkan — dan mencarinya hanya berisiko menghapus baris yang sah.
  if (amount > 0 && !tunai) {
    const { data: kandidat } = await supabase
      .from("transactions")
      .select("id, transaction_date")
      .eq("user_id", userId)
      .eq("source", "statement")
      .eq("amount", amount)
      .gte("transaction_date", shiftDate(date, -DEDUPE_DAY_WINDOW))
      .lte("transaction_date", shiftDate(date, DEDUPE_DAY_WINDOW))
      .limit(1);

    const cocok = (kandidat ?? [])[0] as { id: string } | undefined;
    if (cocok) {
      const { error } = await supabase.from("transactions").delete().eq("id", cocok.id);
      if (!error) supersededStatement = true;
    }
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return { supersededStatement, transaction: data };
}

export async function importStatement(
  supabase: SupabaseClient,
  userId: string,
  parsed: ParsedStatement,
  accounts: UserAccount[],
  accountOverride?: string,
): Promise<ImportResult> {
  const notes = [...parsed.notes];
  const account = accountOverride ?? parsed.detectedAccount ?? "(tidak dikenal)";

  if (parsed.lines.length === 0) {
    return {
      parsed: 0,
      inserted: 0,
      skippedReimport: 0,
      skippedSuperseded: 0,
      account,
      notes: [...notes, "Tidak ada transaksi yang terbaca dari PDF ini."],
    };
  }

  const dates = parsed.lines.map((l) => l.transaction_date).sort();
  const from = shiftDate(dates[0], -DEDUPE_DAY_WINDOW);
  const to = shiftDate(dates[dates.length - 1], DEDUPE_DAY_WINDOW);

  // --- Lapis 1: baris yang sudah pernah diimpor dari file yang sama ---
  const withIds = parsed.lines.map((line, i) => ({
    line,
    externalId: buildExternalId(account, line, i),
  }));

  const { data: existing } = await supabase
    .from("transactions")
    .select("external_id")
    .eq("user_id", userId)
    .in("external_id", withIds.map((w) => w.externalId));

  const sudahAda = new Set(
    (existing ?? []).map((r) => (r as { external_id: string }).external_id),
  );

  // --- Lapis 2: bukti pembayaran yang sudah mewakili transaksi yang sama ---
  // Satu query untuk seluruh rentang tanggal, lalu dicocokkan di memori —
  // jauh lebih hemat daripada satu query per baris.
  const { data: proofs } = await supabase
    .from("transactions")
    .select("amount, transaction_date, payment_method")
    .eq("user_id", userId)
    .in("source", ["payment_proof", "receipt"])
    .gte("transaction_date", from)
    .lte("transaction_date", to);

  const buktiTersedia = (proofs ?? [])
    .map((p) => p as { amount: number; transaction_date: string; payment_method: string | null })
    // Struk yang dibayar tunai tidak pernah muncul di rekening koran, jadi
    // mencocokkannya hanya berisiko membuang baris statement yang sah.
    .filter((p) => (p.payment_method ?? "").toLowerCase() !== "tunai")
    .map((p) => ({ amount: Number(p.amount), date: p.transaction_date }));

  const wallets = walletNames(accounts);

  let skippedReimport = 0;
  let skippedSuperseded = 0;
  const rows: Record<string, unknown>[] = [];

  for (const { line, externalId } of withIds) {
    if (sudahAda.has(externalId)) {
      skippedReimport++;
      continue;
    }

    if (isDedupeCandidate(line, wallets)) {
      const cocok = buktiTersedia.findIndex(
        (p) =>
          p.amount === line.amount &&
          daysApart(p.date, line.transaction_date) <= DEDUPE_DAY_WINDOW,
      );
      if (cocok !== -1) {
        // Dikonsumsi agar satu bukti tidak menutupi dua baris statement
        // yang kebetulan bernominal sama.
        buktiTersedia.splice(cocok, 1);
        skippedSuperseded++;
        continue;
      }
    }

    rows.push({
      user_id: userId,
      amount: line.amount,
      type: line.type,
      category: line.category,
      merchant: line.counterparty,
      description: line.description,
      payment_method: line.payment_method,
      transaction_date: line.transaction_date,
      status: "confirmed",
      raw_ocr_text: null,
      account,
      counterparty: line.counterparty,
      source: "statement",
      external_id: externalId,
    });
  }

  let inserted = 0;
  if (rows.length > 0) {
    const { error, count } = await supabase
      .from("transactions")
      .insert(rows, { count: "exact" });

    if (error) {
      throw new Error(`Gagal menyimpan transaksi: ${error.message}`);
    }
    inserted = count ?? rows.length;
  }

  notes.push(
    `Rekening: ${account}`,
    `${parsed.lines.length} baris terbaca, ${inserted} disimpan`,
    `${skippedReimport} dilewati (sudah pernah diimpor)`,
    `${skippedSuperseded} dilewati (sudah ada bukti pembayarannya)`,
  );

  return {
    parsed: parsed.lines.length,
    inserted,
    skippedReimport,
    skippedSuperseded,
    account,
    notes,
  };
}
