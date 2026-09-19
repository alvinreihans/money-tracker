/**
 * Menerjemahkan error Supabase jadi pesan yang enak dibaca.
 *
 * Pendek dan santai. Error dibaca sekilas waktu orang lagi kesel karena
 * kehambat, bukan dipelajari — jadi satu kalimat, pakai kata sehari-hari,
 * tanpa "Anda". Jalan keluarnya ditaruh sebagai tombol di sebelahnya,
 * bukan dijelaskan di dalam kalimatnya.
 */

interface MaybeAuthError {
  code?: string;
  status?: number;
  message?: string;
}

const AUTH_MESSAGES: Record<string, string> = {
  // Supabase sengaja nyamarin "akun nggak ada" dengan "password salah" biar
  // orang luar nggak bisa nebak email mana yang kedaftar — jadi kita
  // sebenarnya juga nggak boleh nyebut yang mana.
  invalid_credentials: "Email atau passwordnya nggak cocok.",
  email_not_confirmed: "Emailnya belum dikonfirmasi. Cek inbox ya.",
  user_already_exists: "Email ini udah kepakai.",
  weak_password: "Passwordnya kependekan, minimal 6 karakter.",
  email_address_invalid: "Emailnya kayaknya salah ketik.",
  over_request_rate_limit: "Kebanyakan nyoba. Tunggu bentar ya.",
  over_email_send_rate_limit: "Kebanyakan kirim email. Tunggu beberapa menit.",
  signup_disabled: "Pendaftaran lagi ditutup.",
  validation_failed: "Ada isian yang belum bener.",
  same_password: "Password barunya harus beda.",
};

export function authErrorMessage(error: unknown): string {
  const e = (error ?? {}) as MaybeAuthError;

  if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code];

  // Supabase versi lama belum ngirim `code`, jadi cocokin dari pesannya.
  const pesan = (e.message ?? "").toLowerCase();
  if (pesan.includes("invalid login credentials")) return AUTH_MESSAGES.invalid_credentials;
  if (pesan.includes("email not confirmed")) return AUTH_MESSAGES.email_not_confirmed;
  if (pesan.includes("already registered")) return AUTH_MESSAGES.user_already_exists;
  if (pesan.includes("password should be")) return AUTH_MESSAGES.weak_password;

  // Nggak ada status HTTP artinya request-nya nggak pernah nyampe server.
  if (e.status === undefined) return "Nggak nyambung ke server. Cek koneksi kamu.";
  if (e.status >= 500) return "Servernya lagi ngadat. Coba lagi nanti.";

  return e.message || "Ada yang error.";
}

interface MaybePostgrestError {
  code?: string;
  message?: string;
}

/**
 * Error database. Kode Postgres lebih bisa diandalkan buat dicocokin daripada
 * teks pesannya, yang berubah-ubah antar versi dan penuh istilah dalaman.
 */
export function dbErrorMessage(error: unknown, konteks?: string): string {
  const e = (error ?? {}) as MaybePostgrestError;

  switch (e.code) {
    case "23505": // unique_violation
      return konteks ? `${konteks} udah ada di daftar.` : "Datanya udah ada.";
    case "23503": // foreign_key_violation
      return "Datanya nggak ketemu. Coba refresh halamannya.";
    case "23514": // check_violation
      return "Nilainya nggak masuk akal.";
    case "23502": // not_null_violation
      return "Ada yang belum diisi.";
    case "42501": // insufficient_privilege
      return "Nggak punya izin. Coba masuk ulang.";
    case "PGRST301": // JWT kedaluwarsa
      return "Sesi kamu udah abis. Masuk lagi ya.";
    default:
      return e.message || "Gagal nyimpen.";
  }
}
