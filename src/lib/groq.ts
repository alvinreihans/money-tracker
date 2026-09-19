import Groq from "groq-sdk";

/**
 * Client Groq (server-only).
 * Lazy singleton: dibuat sekali per cold-start lalu di-reuse.
 */
let cached: Groq | null = null;

export function getGroqClient(): Groq {
  if (cached) return cached;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Env GROQ_API_KEY belum di-set.");
  }

  cached = new Groq({
    apiKey,
    // Retry diurus sendiri oleh rantai fallback di extract.ts, bukan oleh SDK.
    // Retry otomatis SDK akan menabrak model yang sama saat kena 429 — percuma,
    // karena kuota Groq dihitung per model.
    maxRetries: 0,
    timeout: 20_000,
  });
  return cached;
}

/**
 * Rantai model, diurut dari yang dicoba lebih dulu.
 * Tiap model punya jatah kuota sendiri, jadi berpindah model = kuota segar.
 * Itu sebabnya rantai ini efektif, bukan sekadar redundansi.
 *
 * Verifikasi nama model di dashboard Groq bila ada yang berubah — model yang
 * tidak dikenal akan menghasilkan 404 dan otomatis dilewati oleh rantai.
 */
export const GROQ_MODEL_CHAIN = [
  "openai/gpt-oss-20b", // cepat, cukup untuk parsing terstruktur
  "qwen/qwen3.8-27b", // kuota terpisah
  "openai/gpt-oss-120b", // paling kuat, dipakai terakhir
] as const;

/** Klasifikasi error Groq menjadi keputusan yang bisa ditindaklanjuti. */
export type GroqFailure =
  | "rate_limited" // 429: kuota model habis -> pindah model, jangan tunggu
  | "transient" // 5xx / timeout -> backoff singkat lalu pindah
  | "fatal"; // 4xx lain: payload kita yang salah -> diulang tetap gagal

/**
 * Groq membalas 400 `json_validate_failed` ketika model gagal memproduksi JSON
 * yang sah — itu kegagalan OUTPUT model, bukan payload kita yang salah. Tanpa
 * pengecualian ini, error tersebut jatuh ke kategori "fatal" dan menghentikan
 * seluruh rantai padahal model berikutnya kemungkinan besar berhasil.
 */
export function isJsonValidationFailure(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;

  const code = (err as { error?: { code?: unknown } }).error?.code;
  if (code === "json_validate_failed") return true;

  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && message.includes("json_validate_failed");
}

export function classifyGroqError(err: unknown): GroqFailure {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: unknown }).status)
      : undefined;

  if (status === 429) return "rate_limited";
  if (status !== undefined && status >= 500) return "transient";
  if (status !== undefined && status >= 400) return "fatal";

  // Tanpa status: kemungkinan besar timeout atau gangguan jaringan.
  return "transient";
}

/**
 * Groq menyertakan saran tunggu di pesan 429, mis. "try again in 6.172s".
 * Memakai angka itu jauh lebih tepat daripada backoff tebakan: menunggu terlalu
 * sebentar langsung kena 429 lagi, menunggu terlalu lama membuang waktu user.
 */
export function parseRetryAfterMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = /try again in ([\d.]+)s/i.exec(message);
  if (!match) return null;
  const detik = Number(match[1]);
  return Number.isFinite(detik) ? Math.ceil(detik * 1000) + 500 : null;
}

/** Apakah kegagalan ini karena batas kuota per menit, bukan kesalahan kita? */
export function isRateLimited(err: unknown): boolean {
  return classifyGroqError(err) === "rate_limited";
}

/** Sebagian model tetap membungkus JSON dalam pagar kode meski diminta tidak. */
export function parseJsonLoose<T>(raw: string): T {
  const fence = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(raw);
  return JSON.parse(fence ? fence[1] : raw.trim()) as T;
}

const STRICT_REMINDER =
  "\n\nPERHATIAN: balasan sebelumnya bukan JSON valid. Balas HANYA objek JSON, tanpa markdown, tanpa penjelasan.";

/**
 * Jalankan satu permintaan JSON melalui rantai model (lihat FALLBACK.md).
 *
 * Aturan:
 *  - 429          -> pindah model, JANGAN retry (kuota model itu memang habis)
 *  - 5xx/timeout  -> backoff singkat lalu pindah model
 *  - JSON invalid -> retry 1x ke model sama dengan prompt lebih ketat
 *  - 4xx lain     -> hentikan rantai, payload kita yang salah
 *
 * Dipakai bersama oleh ekstraksi struk dan rekening koran supaya logika
 * fallback-nya hanya ada di satu tempat.
 */
export async function runGroqChain<T>(
  system: string,
  user: string,
  validate?: (value: T) => boolean,
): Promise<{ value: T; model: string }> {
  let lastError: unknown = new Error("Rantai model Groq kosong.");

  for (const model of GROQ_MODEL_CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const completion = await getGroqClient()
          .chat.completions.create({
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: attempt > 0 ? user + STRICT_REMINDER : user },
            ],
          })
          .catch((err: unknown) => {
            // Kegagalan OUTPUT model, bukan payload kita yang salah: naikkan
            // ke SyntaxError agar rantai lanjut ke model berikutnya.
            if (isJsonValidationFailure(err)) {
              throw new SyntaxError(`Model ${model} gagal memproduksi JSON yang sah.`);
            }
            throw err;
          });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) throw new SyntaxError("Groq mengembalikan balasan kosong.");

        const value = parseJsonLoose<T>(raw);
        if (validate && !validate(value)) {
          throw new SyntaxError("Bentuk JSON tidak sesuai yang diharapkan.");
        }
        return { value, model };
      } catch (err) {
        lastError = err;

        if (err instanceof SyntaxError) {
          if (attempt === 0) continue; // coba sekali lagi, prompt diperketat
          break; // sudah retry -> pindah model
        }

        const kind = classifyGroqError(err);
        if (kind === "fatal") throw err;
        if (kind === "transient") await new Promise((r) => setTimeout(r, 1000));
        break; // rate_limited / transient -> pindah model
      }
    }
  }

  throw lastError;
}
