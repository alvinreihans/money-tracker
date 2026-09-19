"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/errors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tautan reset sudah ditukar jadi session oleh /auth/callback. Kalau tidak
  // ada session, berarti halaman ini dibuka langsung tanpa lewat email.
  const [punyaSesi, setPunyaSesi] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => setPunyaSesi(!!data.user));
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.updateUser({ password });

    if (err) {
      setError(authErrorMessage(err));
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">Password baru</h1>

        {punyaSesi === false ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Tautannya udah nggak berlaku. Tautan reset cuma bisa dipakai sekali
              dan ada masa berlakunya.
            </p>
            <Link
              href="/login"
              className="mt-5 block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Minta tautan baru
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Bikin password baru, terus langsung masuk.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="password-baru"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Password baru
                </label>
                <input
                  id="password-baru"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-[var(--ring)] focus:ring-1 focus:ring-[var(--ring)]"
                  placeholder="Minimal 6 karakter"
                />
              </div>

              {error && (
                <p className="rounded-md bg-[rgba(192,57,43,0.10)] px-3 py-2 text-sm text-[var(--danger)]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || punyaSesi === null}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Bentar ya..." : "Simpan & masuk"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
