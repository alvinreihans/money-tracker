// Helper tipis untuk Telegram Bot API (tanpa dependency tambahan).

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Env TELEGRAM_BOT_TOKEN belum di-set.");
  return token;
}

const apiBase = () => `https://api.telegram.org/bot${botToken()}`;

/** Keyboard sekali-pakai untuk meminta user membagikan nomor telepon. */
export const requestContactKeyboard = {
  keyboard: [[{ text: "📱 Bagikan Nomor Saya", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
} as const;

type ReplyMarkup = typeof requestContactKeyboard;

/** Kirim pesan teks ke chat. */
export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<void> {
  await fetch(`${apiBase()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

interface TelegramFileResponse {
  ok: boolean;
  result?: { file_path?: string };
}

/** Ambil URL unduh file dari file_id. */
export async function getFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`${apiBase()}/getFile?file_id=${fileId}`);
  const data = (await res.json()) as TelegramFileResponse;
  const path = data.result?.file_path;
  if (!data.ok || !path) {
    throw new Error("Gagal mengambil file dari Telegram.");
  }
  return `https://api.telegram.org/file/bot${botToken()}/${path}`;
}

/** Unduh file gambar sebagai Buffer + mime (bentuk yang dipakai pipeline). */
export async function downloadAsBuffer(
  fileUrl: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(fileUrl);
  const arrayBuffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

/** Unduh file gambar dan kembalikan base64 + mime. */
export async function downloadAsBase64(
  fileUrl: string,
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(fileUrl);
  const arrayBuffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  return { base64: Buffer.from(arrayBuffer).toString("base64"), mimeType };
}

/**
 * Normalisasi nomor telepon (samakan dgn fungsi SQL normalize_phone).
 * "08123..." / "+62812..." / "8123..." / "62812..." => "62812..."
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

/**
 * Escape karakter yang punya arti khusus di parse_mode HTML Telegram.
 * WAJIB dipakai untuk teks yang berasal dari OCR / nama merchant / pesan error,
 * karena satu karakter `<` saja membuat Telegram menolak seluruh pesan.
 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
