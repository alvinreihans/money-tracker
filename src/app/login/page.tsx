"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Banner, Button, FormControl, Link, Stack, TextInput } from "@primer/react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/errors";
import { passwordValid } from "@/lib/password";
import PasswordField from "@/components/PasswordField";
import BrandMark from "@/components/BrandMark";
import s from "@/components/ui.module.css";

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

const JUDUL: Record<Mode, { judul: string; tombol: string }> = {
  signin: { judul: "Masuk ke Money Tracker", tombol: "Masuk" },
  signup: { judul: "Bikin akun Money Tracker", tombol: "Daftar" },
  lupa: { judul: "Lupa password", tombol: "Kirim tautan reset" },
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
    setError(null);
    setMessage(null);

    if (mode === "signup" && !passwordValid(password)) {
      return setError("Passwordnya belum memenuhi semua syarat di bawah kolom.");
    }
    if (mode === "signup" && password !== ulangi) {
      return setError("Password dan ulangannya belum sama.");
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    if (mode === "lupa") {
      // Sengaja flow implicit, bukan PKCE bawaan @supabase/ssr: tautan PKCE butuh
      // cookie code-verifier dari browser yang meminta, jadi "kedaluwarsa" kalau
      // dibuka di app email atau perangkat lain. Implicit membawa token di hash
      // URL, lalu /reset-password memasangnya sendiri. (Mengganti template email
      // ke token_hash butuh SMTP sendiri di Supabase.)
      const implicit = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { flowType: "implicit", persistSession: false } },
      );
      const { error: err } = await implicit.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
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
        // Error dari trigger handle_new_user disamarkan Supabase jadi pesan umum
        // ini. Satu-satunya yang bisa gagal di sana: profiles.phone unique, yaitu
        // nomornya sudah dipakai akun lain.
        setError(
          signUpError.message === "Database error saving new user"
            ? "Nomor HP ini udah dipakai akun lain."
            : authErrorMessage(signUpError),
        );
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

  // Yang bisa diklik cuma kata kerjanya; kalimat pengantarnya teks biasa.
  const ajakan =
    mode === "signin"
      ? { teks: "Belum punya akun?", aksi: "Daftar", ke: "signup" as Mode }
      : { teks: mode === "lupa" ? "Inget passwordnya?" : "Udah punya akun?", aksi: "Masuk", ke: "signin" as Mode };

  return (
    <main className={s.sempit}>
      <BrandMark judul={JUDUL[mode].judul} />

      <Stack gap="normal">
        {error && <Banner variant="critical" title="Gagal" hideTitle description={error} />}
        {message && <Banner variant="success" title="Terkirim" hideTitle description={message} />}

        <div className={`${s.kotak} ${s.kotakIsi}`} style={{ background: "var(--bgColor-muted)" }}>
          <form onSubmit={handleSubmit}>
            <Stack gap="normal">
              <FormControl required>
                <FormControl.Label>Email</FormControl.Label>
                <TextInput
                  block
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kamu@email.com"
                />
              </FormControl>

              {mode !== "lupa" && (
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  syarat={mode === "signup"}
                  caption={
                    mode === "signin" && (
                      <Link as="button" type="button" onClick={() => pindahMode("lupa")}>
                        Lupa password?
                      </Link>
                    )
                  }
                />
              )}

              {mode === "signup" && (
                <PasswordField
                  label="Ulangi password"
                  value={ulangi}
                  onChange={setUlangi}
                  autoComplete="new-password"
                />
              )}

              {mode === "signup" && (
                <FormControl required>
                  <FormControl.Label>Nomor HP (buat bot Telegram)</FormControl.Label>
                  <TextInput
                    block
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                  />
                  <FormControl.Caption>Samain sama nomor Telegram kamu.</FormControl.Caption>
                </FormControl>
              )}

              <Button type="submit" variant="primary" block loading={loading} disabled={!siap}>
                {JUDUL[mode].tombol}
              </Button>
            </Stack>
          </form>
        </div>

        <div className={`${s.kotak} ${s.kotakIsi} ${s.tengah}`}>
          {ajakan.teks}{" "}
          <Link as="button" type="button" onClick={() => pindahMode(ajakan.ke)}>
            {ajakan.aksi}
          </Link>
        </div>
      </Stack>
    </main>
  );
}
