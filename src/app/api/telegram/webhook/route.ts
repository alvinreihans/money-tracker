import { NextRequest, NextResponse, after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processReceiptImage, processReceiptText, toTransactionRow } from "@/lib/receipt";
import { insertFromImage } from "@/lib/statement-import";
import type { ProcessedReceipt } from "@/lib/receipt";
import {
  sendMessage,
  getFileUrl,
  downloadAsBuffer,
  normalizePhone,
  requestContactKeyboard,
  escapeHtml,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pekerjaan di dalam after() tetap dihitung sebagai durasi fungsi.
export const maxDuration = 60;

// --- Tipe minimal Telegram Update (hanya yang kita pakai) ---
interface TgUser {
  id: number;
}
interface TgPhotoSize {
  file_id: string;
  file_size?: number;
}
interface TgContact {
  phone_number: string;
  user_id?: number;
}
interface TgMessage {
  chat: { id: number };
  from?: TgUser;
  text?: string;
  photo?: TgPhotoSize[];
  contact?: TgContact;
}
interface TgUpdate {
  update_id?: number;
  message?: TgMessage;
}

// Telegram akan retry kalau kita balas non-200; selalu balas 200.
const ok = () => NextResponse.json({ ok: true });

function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export async function POST(req: NextRequest) {
  // 1. Verifikasi secret token (diset saat mendaftarkan webhook).
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return ok();
  }

  const msg = update.message;
  if (!msg) return ok();

  const chatId = msg.chat.id;
  const admin = createSupabaseAdminClient();

  // 2. Dedupe. Telegram mengirim ulang update bila webhook lambat membalas, dan
  //    pipeline OCR memang lambat — tanpa ini satu struk bisa tersimpan dua kali.
  if (typeof update.update_id === "number") {
    const { error } = await admin
      .from("telegram_updates")
      .insert({ update_id: update.update_id, chat_id: chatId });

    // 23505 = unique_violation => update ini sudah pernah diproses.
    if (error?.code === "23505") return ok();
    // Error lain sengaja dibiarkan lewat: kehilangan struk user lebih buruk
    // daripada risiko duplikat sesekali saat database sedang bermasalah.
  }

  try {
    // 3. Cari apakah chat ini sudah terhubung ke akun.
    const { data: link, error: linkError } = await admin
      .from("telegram_links")
      .select("user_id")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (linkError) {
      throw new Error(`Gagal membaca telegram_links: ${linkError.message}`);
    }

    // 4. User membagikan kontak => proses linking (cepat, tidak perlu after()).
    if (msg.contact) {
      // Hanya boleh membagikan kontak milik sendiri.
      if (msg.from && msg.contact.user_id && msg.contact.user_id !== msg.from.id) {
        await sendMessage(chatId, "Bagiin <b>kontak kamu sendiri</b> ya.");
        return ok();
      }

      const phone = normalizePhone(msg.contact.phone_number);
      if (!phone) {
        await sendMessage(chatId, "Nomornya nggak kebaca. Coba lagi.");
        return ok();
      }

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("user_id")
        .eq("phone", phone)
        .maybeSingle();

      if (profileError) {
        throw new Error(`Gagal mencari profil: ${profileError.message}`);
      }

      if (!profile) {
        await sendMessage(
          chatId,
          `Nomor <b>${escapeHtml(phone)}</b> belum kedaftar. Daftar dulu di web pakai nomor ini, terus bagiin kontak lagi.`,
        );
        return ok();
      }

      const { error: linkSaveError } = await admin
        .from("telegram_links")
        .upsert({ chat_id: chatId, user_id: profile.user_id });

      if (linkSaveError) {
        throw new Error(`Gagal menyimpan tautan: ${linkSaveError.message}`);
      }

      await sendMessage(
        chatId,
        "✅ <b>Akun terhubung!</b>\nKirim foto struk, atau ketik pengeluaran kayak gini:\n<i>kopi 25rb gopay</i>",
      );
      return ok();
    }

    // 5. Belum terhubung => minta bagikan kontak.
    if (!link) {
      await sendMessage(
        chatId,
        "Halo! 👋 Hubungin akunmu dulu ya — bagiin nomor HP kamu (harus sama sama yang dipakai waktu daftar).",
        requestContactKeyboard,
      );
      return ok();
    }

    const userId = link.user_id as string;
    const hasPhoto = Boolean(msg.photo?.length);
    const hasText = Boolean(msg.text && !msg.text.startsWith("/"));

    if (!hasPhoto && !hasText) {
      await sendMessage(
        chatId,
        "Kirim <b>foto struk</b> atau ketik pengeluaranmu, contoh:\n<i>beli gorengan 10k via sopipay</i>",
      );
      return ok();
    }

    // 6. Pipeline berat dijalankan SETELAH respons dikirim. Telegram langsung
    //    menerima 200 sehingga tidak menggantung dan tidak memicu retry.
    after(async () => {
      try {
        let result: ProcessedReceipt;

        if (hasPhoto) {
          await sendMessage(chatId, "🧾 Lagi baca struknya...");
          const photos = msg.photo!;
          const largest = photos[photos.length - 1]; // resolusi tertinggi
          const fileUrl = await getFileUrl(largest.file_id);
          const { buffer, mimeType } = await downloadAsBuffer(fileUrl);
          result = await processReceiptImage(buffer, mimeType);
        } else {
          await sendMessage(chatId, "✍️ Lagi nyatet...");
          result = await processReceiptText(msg.text!);
        }

        // Menyingkirkan baris rekening koran yang mewakili transaksi sama.
        try {
          await insertFromImage(
            admin,
            userId,
            toTransactionRow(result, userId) as unknown as Record<string, unknown>,
          );
        } catch (dbError) {
          const pesan = dbError instanceof Error ? dbError.message : "Unknown error";
          await sendMessage(chatId, `❌ Gagal nyimpen: ${escapeHtml(pesan)}`);
          return;
        }

        await sendMessage(chatId, buildReply(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await sendMessage(chatId, `❌ Ada error: ${escapeHtml(message)}`);
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await sendMessage(chatId, `❌ Ada error: ${escapeHtml(message)}`);
  }

  return ok();
}

/** Susun balasan: ringkasan bila berhasil, ajakan koreksi bila jadi draft. */
function buildReply(result: ProcessedReceipt): string {
  const e = result.extracted;

  if (result.status === "confirmed" && e) {
    return (
      `✅ <b>Tersimpan</b>\n` +
      `${escapeHtml(e.merchant ?? "Tanpa nama")} — ${e.category}\n` +
      `${formatIDR(e.amount)}` +
      (e.payment_method ? ` via ${escapeHtml(e.payment_method)}` : "") +
      `\n${e.transaction_date}`
    );
  }

  // Draft: tampilkan potongan teks OCR supaya user bisa mengetik ulang
  // nominalnya tanpa perlu memfoto struk sekali lagi.
  const cuplikan = result.rawOcrText?.slice(0, 300).trim();

  // Jejak tiap tahap ikut dikirim. Tanpa ini, kegagalan di sini tidak bisa
  // dibedakan satu sama lain: OCR yang melempar dan OCR yang berhasil tapi
  // mengembalikan nol karakter sama-sama muncul sebagai draft kosong. Hanya
  // ditampilkan saat gagal, jadi tidak mengganggu pemakaian normal.
  const jejak = result.notes.length
    ? `\nJejaknya:\n<pre>${escapeHtml(result.notes.join("\n"))}</pre>\n`
    : "";

  return (
    `⚠️ <b>Struknya nggak kebaca</b>\n` +
    `Udah disimpan jadi draft buat dibenerin manual.\n` +
    (cuplikan
      ? `\nYang sempat kebaca:\n<pre>${escapeHtml(cuplikan)}</pre>\n`
      : "") +
    jejak +
    `\nKetik ulang manual aja, contoh: <i>indomaret 52rb qris</i>`
  );
}
