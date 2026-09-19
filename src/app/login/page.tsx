"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/errors";
import PasswordField from "@/components/PasswordField";
import BrandMark from "@/components/BrandMark";

/**
 * "lupa" sengaja jadi mode tersendiri, bukan tombol yang langsung mengirim.
 * Versi sebelumnya menembakkan email begitu diklik — user tidak sempat tahu
 * alamat tujuannya, dan tidak bisa membetulkan kalau kolom emailnya salah isi.
 */
type Mode = "signin" | "signup" | "lupa";

const ERROR_TAUTAN: Record<string, string> = {
  "tautan-kedaluwarsa": "Tautannya udah lewat masa berlaku. Minta yang baru ya.",
  "tautan-tidak-valid": "Tautannya nggak lengkap. Coba minta yang baru.",
};

const JUDUL: Record<Mode, { judul: string; sub: string }> = {
  signin: { judul: "Masuk", sub: "Lanjut ke catatan keuanganmu." },
  signup: { judul: "Daftar", sub: "Bikin akun dulu, bentar aja." },
  lupa: {
    judul: "Lupa password",
    sub: "Masukin emailmu, nanti kami kirim tautan buat bikin password baru.",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ulangi, setUlangi] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Halaman ini di-render server dulu, jadi formnya sudah terlihat siap sebelum
  // JS-nya termuat. Di koneksi lambat, menekan kirim di jeda itu memicu submit
  // bawaan browser: halaman reload dan isian hilang. Penanda ini menutup celahnya.
  const [siap, setSiap] = useState(false);
  useEffect(() => setSiap(true), []);

  // Pesan dari /auth/callback saat tautan email gagal ditukar jadi session.
  useEffect(() => {
    const kode = new URLSearchParams(window.location.search).get("error");
    if (kode && ERROR_TAUTAN[kode]) setError(ERROR_TAUTAN[kode]);
  }, []);

  function pindahMode(target: Mode) {
    setMode(target);
    setUlangi("");
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signup" && password !== ulangi) {
      setError("Password dan ulangannya belum sama.");
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();

    if (mode === "lupa") {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (err) setError(authErrorMessage(err));
      else setMessage(`Tautan dikirim ke ${email}. Cek inbox dan folder spam ya.`);
    } else if (mode === "signup") {
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
      } else {
        router.push("/");
        router.refresh(); // biar Server Component baca ulang session-nya
        return;
      }
    }

    setLoading(false);
  }

  const teksTombol = loading
    ? "Bentar ya..."
    : mode === "lupa"
      ? "Kirim tautan"
      : mode === "signup"
        ? "Daftar"
        : "Masuk";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <BrandMark subjudul="Foto struk, sisanya otomatis." />

      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">{JUDUL[mode].judul}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{JUDUL[mode].sub}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-foreground"
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
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="kamu@email.com"
            />
          </div>

          {mode !== "lupa" && (
            <div>
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
              {mode === "signup" && (
                <div className="mt-4">
                  <PasswordField
                    label="Ulangi password"
                    value={ulangi}
                    onChange={setUlangi}
                    autoComplete="new-password"
                    placeholder="Ketik ulang passwordnya"
                  />
                </div>
              )}
              {mode === "signin" && (
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => pindahMode("lupa")}
                    className="text-xs font-semibold text-[var(--accent)] transition hover:opacity-80"
                  >
                    Lupa password?
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label
                htmlFor="phone"
                className="mb-1 block text-sm font-medium text-foreground"
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
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="08xxxxxxxxxx"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Samain sama nomor Telegram kamu.
              </p>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-md border border-[rgba(255,107,91,0.45)] bg-[rgba(255,107,91,0.14)] px-3 py-2 text-sm text-[var(--danger)]"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              className="rounded-md border border-[rgba(74,222,128,0.45)] bg-[rgba(74,222,128,0.14)] px-3 py-2 text-sm text-[var(--success)]"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !siap}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {teksTombol}
          </button>
        </form>

        {/* Yang bisa diklik cuma kata kerjanya; kalimat pengantarnya teks biasa. */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "lupa" ? (
            <>
              Inget passwordnya?{" "}
              <button
                type="button"
                onClick={() => pindahMode("signin")}
                className="font-bold text-[var(--accent)] transition hover:opacity-80"
              >
                Masuk
              </button>
            </>
          ) : mode === "signin" ? (
            <>
              Belum punya akun?{" "}
              <button
                type="button"
                onClick={() => pindahMode("signup")}
                className="font-bold text-[var(--accent)] transition hover:opacity-80"
              >
                Daftar
              </button>
            </>
          ) : (
            <>
              Udah punya akun?{" "}
              <button
                type="button"
                onClick={() => pindahMode("signin")}
                className="font-bold text-[var(--accent)] transition hover:opacity-80"
              >
                Masuk
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
