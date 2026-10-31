"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Keadaan = "memuat" | "tidak-didukung" | "diblokir" | "mati" | "nyala";

const KET: Record<Keadaan, string> = {
  memuat: "Memeriksa…",
  "tidak-didukung": "Browser ini belum mendukung notifikasi",
  diblokir: "Izin diblokir — buka izin situs di pengaturan browser",
  mati: "Jatuh tempo & belum nyatat, tiap jam 19.00",
  nyala: "Jatuh tempo & belum nyatat, tiap jam 19.00",
};

/** Kunci VAPID publik (base64url) → bentuk yang diminta PushManager. */
const kunciVapid = () =>
  Uint8Array.from(atob(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const didukung = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// Service worker yang sama dengan AppShell; mendaftar ulang tidak apa-apa dan
// tidak menggantung seperti `serviceWorker.ready` kalau belum terdaftar.
const pendaftaran = () => navigator.serviceWorker.register("/sw.js");

/**
 * Sakelar push notifikasi per perangkat (SPEC-notifikasi.md). Langganannya
 * disimpan di push_langganan; begitu nyala, server mengirim notifikasi
 * konfirmasi lewat jalur yang sama dengan cron harian.
 */
export default function SakelarNotifikasi() {
  const [keadaan, setKeadaan] = useState<Keadaan>("memuat");
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Dukungan & izin notifikasi hanya bisa dibaca di browser, setelah hidrasi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!didukung()) return setKeadaan("tidak-didukung");
    if (Notification.permission === "denied") return setKeadaan("diblokir");
    pendaftaran()
      .then((r) => r.pushManager.getSubscription())
      .then((sub) => setKeadaan(sub && Notification.permission === "granted" ? "nyala" : "mati"))
      .catch(() => setKeadaan("tidak-didukung"));
  }, []);

  async function nyalakan() {
    if ((await Notification.requestPermission()) !== "granted") {
      return setKeadaan(Notification.permission === "denied" ? "diblokir" : "mati");
    }
    const reg = await pendaftaran();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciVapid() }));
    const { endpoint, keys } = sub.toJSON();
    const { error: err } = await createSupabaseBrowserClient()
      .from("push_langganan")
      .upsert({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth }, { onConflict: "user_id,endpoint", ignoreDuplicates: true });
    if (err) throw new Error(err.message);
    setKeadaan("nyala");
    const r = await fetch("/api/notifikasi/uji", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) });
    if (!r.ok) throw new Error("Notifikasi percobaan tidak terkirim. Coba matikan lalu nyalakan lagi.");
  }

  async function matikan() {
    const sub = await (await pendaftaran()).pushManager.getSubscription();
    if (sub) {
      await createSupabaseBrowserClient().from("push_langganan").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setKeadaan("mati");
  }

  async function ubah(nyala: boolean) {
    setSibuk(true);
    setError(null);
    try {
      await (nyala ? nyalakan() : matikan());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah notifikasi.");
    }
    setSibuk(false);
  }

  const bisa = keadaan === "mati" || keadaan === "nyala";
  return (
    <label className={s.baris} style={{ cursor: bisa ? "pointer" : "default" }}>
      <span className={s.barisIkon} style={{ background: "color-mix(in srgb, #ff6b6b 18%, transparent)", color: "#ff6b6b" }} aria-hidden>
        <Bell size={20} />
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul}>Pengingat harian</span>
        <span className={`${s.redup} ${error ? s.bahaya : ""}`} style={{ whiteSpace: "normal" }}>
          {error ?? KET[keadaan]}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className={s.sakelar}
        checked={keadaan === "nyala"}
        disabled={!bisa || sibuk}
        onChange={(e) => void ubah(e.target.checked)}
      />
    </label>
  );
}
