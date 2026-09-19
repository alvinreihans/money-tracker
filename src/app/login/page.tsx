"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/errors";

type Mode = "signin" | "signup";

const ERROR_TAUTAN: Record<string, string> = {
  "tautan-kedaluwarsa": "Tautannya udah lewat masa berlaku. Minta yang baru ya.",
  "tautan-tidak-valid": "Tautannya nggak lengkap. Coba minta yang baru.",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [kirimReset, setKirimReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ditandai terpisah supaya bisa menawarkan reset password di kotak errornya.
  const [passwordMungkinSalah, setPasswordMungkinSalah] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Pesan dari /auth/callback saat tautan email gagal ditukar jadi session.
  useEffect(() => {
    const kode = new URLSearchParams(window.location.search).get("error");
    if (kode && ERROR_TAUTAN[kode]) setError(ERROR_TAUTAN[kode]);
  }, []);

  function reset() {
    setError(null);
    setMessage(null);
    setPasswordMungkinSalah(false);
  }

  function pindahMode(target: Mode) {
    setMode(target);
    reset();
  }

  async function lupaPassword() {
    reset();
    if (!email.trim()) {
      setError("Isi emailnya dulu ya, biar tahu mau dikirim ke mana.");
      return;
    }

    setKirimReset(true);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (err) setError(authErrorMessage(err));
    else setMessage("Udah dikirim. Cek email buat bikin password baru.");
    setKirimReset(false);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    reset();

    const supabase = createSupabaseBrowserClient();

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { phone } }, // disimpan ke profiles via trigger DB
      });

      if (signUpError) {
        setError(authErrorMessage(signUpError));
      } else if (data.user && data.user.identities?.length === 0) {
        // Supabase membalas "sukses" untuk email yang sudah terdaftar biar orang
        // luar nggak bisa nebak email mana yang ada. Penandanya identities kosong.
        setError("Email ini udah kepakai. Masuk aja.");
        setMode("signin");
      } else if (data.session) {
        // Konfirmasi email nonaktif: langsung masuk, nggak usah disuruh login lagi.
        router.push("/");
        router.refresh();
        return;
      } else {
        setMessage("Akunnya jadi. Cek email buat konfirmasi.");
        setMode("signin");
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(authErrorMessage(signInError));
        const kode = (signInError as { code?: string }).code;
        setPasswordMungkinSalah(
          kode === "invalid_credentials" ||
            signInError.message.toLowerCase().includes("invalid login credentials"),
        );
      } else {
        router.push("/");
        router.refresh(); // biar Server Component baca ulang session-nya
        return;
      }
    }

    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {mode === "signin" ? "Masuk" : "Daftar"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "signin"
            ? "Lanjut ke catatan keuanganmu."
            : "Bikin akun dulu, bentar aja."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              placeholder="kamu@email.com"
            />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => void lupaPassword()}
                  disabled={kirimReset}
                  className="text-xs text-slate-400 transition hover:text-slate-900 disabled:opacity-50"
                >
                  {kirimReset ? "Ngirim..." : "Lupa password?"}
                </button>
              )}
            </div>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              placeholder="Minimal 6 karakter"
            />
          </div>

          {mode === "signup" && (
            <div>
              <label
                htmlFor="phone"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Nomor HP (buat bot Telegram)
              </label>
              <input
                id="phone"
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                placeholder="08xxxxxxxxxx"
              />
              <p className="mt-1 text-xs text-slate-400">
                Samain sama nomor Telegram kamu.
              </p>
            </div>
          )}

          {error && (
            <div className="flex flex-wrap items-baseline gap-x-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <span>{error}</span>
              {passwordMungkinSalah && (
                <button
                  type="button"
                  onClick={() => void lupaPassword()}
                  disabled={kirimReset}
                  className="font-medium underline underline-offset-2 transition hover:text-red-900 disabled:opacity-50"
                >
                  {kirimReset ? "Ngirim..." : "Reset password"}
                </button>
              )}
            </div>
          )}

          {message && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Bentar ya..." : mode === "signin" ? "Masuk" : "Daftar"}
          </button>
        </form>

        <button
          onClick={() => pindahMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-900"
        >
          {mode === "signin" ? "Belum punya akun? Daftar" : "Udah punya akun? Masuk"}
        </button>
      </div>
    </main>
  );
}
