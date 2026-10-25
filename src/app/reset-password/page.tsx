"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GalatForm, Pesan, Spinner, useGalat } from "@/components/oneui";
import PasswordField from "@/components/PasswordField";
import BrandMark from "@/components/BrandMark";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/errors";
import { passwordValid } from "@/lib/password";

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
  // Tautan reset (flow implicit, lihat halaman login) membawa token di hash URL.
  // Client @supabase/ssr hanya menerima PKCE, jadi tokennya dipasang manual.
  // Tanpa token dan tanpa session: tautannya kedaluwarsa (Supabase menaruh
  // #error=... di hash) atau halaman ini dibuka langsung tanpa lewat email.
  const { galat, gagal, bersihkan } = useGalat({ password, ulangi });
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
    bersihkan();

    if (!passwordValid(password)) {
      return gagal("Passwordnya belum memenuhi semua syarat di bawah.", "password");
    }
    if (password !== ulangi) {
      return gagal("Password dan ulangannya belum sama.", "ulangi");
    }

    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient().auth.updateUser({ password });

    if (err) {
      gagal(authErrorMessage(err));
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className={s.app} style={{ paddingBottom: 32 }}>
      <BrandMark judul="Password baru" sub="Bikin password baru, terus langsung masuk." />

      <div className={s.isi}>
        {punyaSesi === false ? (
          <Pesan
            jenis="bahaya"
            judul="Tautannya udah nggak berlaku"
            aksi={
              <button type="button" className={s.tombol} onClick={() => router.push("/login")}>
                Minta tautan baru
              </button>
            }
          >
            Tautan reset cuma bisa dipakai sekali dan ada masa berlakunya.
          </Pesan>
        ) : (
          <>
            {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}
            <form onSubmit={handleSubmit} className={s.form}>
              <GalatForm value={galat}>
                <div className={`${s.blok} ${s.blokForm}`}>
                  <PasswordField label="Password baru" value={password} onChange={setPassword} autoComplete="new-password" syarat kolom="password" />
                  <PasswordField label="Ulangi password baru" value={ulangi} onChange={setUlangi} autoComplete="new-password" kolom="ulangi" />
                </div>
              </GalatForm>
              <button
                type="submit"
                className={`${s.tombol} ${s.tombolPenuh}`}
                disabled={loading || !siap || punyaSesi === null}
              >
                {loading ? <Spinner /> : "Simpan & masuk"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
