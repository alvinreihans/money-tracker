"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Stack } from "@primer/react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/errors";
import { passwordValid } from "@/lib/password";
import PasswordField from "@/components/PasswordField";
import BrandMark from "@/components/BrandMark";
import s from "@/components/ui.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [ulangi, setUlangi] = useState("");
  const [loading, setLoading] = useState(false);
  // Halaman ini di-render server dulu, jadi formnya sudah terlihat siap sebelum
  // JS-nya termuat. Di koneksi lambat, menekan kirim di jeda itu memicu submit
  // bawaan browser: halaman reload dan isian hilang. Penanda ini menutup celahnya.
  const [siap, setSiap] = useState(false);
  useEffect(() => setSiap(true), []);
  const [error, setError] = useState<string | null>(null);
  // Tautan reset (flow implicit, lihat halaman login) membawa token di hash URL.
  // Client @supabase/ssr hanya menerima PKCE, jadi tokennya dipasang manual.
  // Tanpa token dan tanpa session: tautannya kedaluwarsa (Supabase menaruh
  // #error=... di hash) atau halaman ini dibuka langsung tanpa lewat email.
  const [punyaSesi, setPunyaSesi] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");

    const sesi =
      access_token && refresh_token
        ? supabase.auth.setSession({ access_token, refresh_token }).then(({ data }) => {
            // Token jangan tertinggal di address bar / riwayat browser.
            window.history.replaceState(null, "", window.location.pathname);
            return !!data.user;
          })
        : supabase.auth.getUser().then(({ data }) => !!data.user);

    void sesi.then(setPunyaSesi);
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!passwordValid(password)) {
      return setError("Passwordnya belum memenuhi semua syarat di bawah kolom.");
    }
    if (password !== ulangi) {
      return setError("Password dan ulangannya belum sama.");
    }

    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient().auth.updateUser({ password });

    if (err) {
      setError(authErrorMessage(err));
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className={s.sempit}>
      <BrandMark judul="Password baru" />

      {punyaSesi === false ? (
        <Banner
          variant="critical"
          title="Tautannya udah nggak berlaku"
          description="Tautan reset cuma bisa dipakai sekali dan ada masa berlakunya."
          primaryAction={
            <Banner.PrimaryAction onClick={() => router.push("/login")}>Minta tautan baru</Banner.PrimaryAction>
          }
        />
      ) : (
        <Stack gap="normal">
          {error && <Banner variant="critical" title="Gagal" hideTitle description={error} />}

          <div className={`${s.kotak} ${s.kotakIsi}`} style={{ background: "var(--bgColor-muted)" }}>
            <form onSubmit={handleSubmit}>
              <Stack gap="normal">
                <PasswordField
                  label="Password baru"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  syarat
                />
                <PasswordField
                  label="Ulangi password baru"
                  value={ulangi}
                  onChange={setUlangi}
                  autoComplete="new-password"
                />
                <Button
                  type="submit"
                  variant="primary"
                  block
                  loading={loading}
                  disabled={!siap || punyaSesi === null}
                >
                  Simpan &amp; masuk
                </Button>
              </Stack>
            </form>
          </div>
        </Stack>
      )}
    </main>
  );
}
