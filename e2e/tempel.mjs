import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, langkah, masalah, tidur } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "uji-tempel-sementara@example.com", SANDI = "Uji12345#";
let uid, gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
const ukur = async (w, h = 860) => { await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await tidur(700); };
try {
  const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SANDI, email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  uid = u.user.id;
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI });
  const ref = new URL(U).hostname.split(".")[0];
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  await cdp("Network.enable");
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  for (const [name, value] of kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });

  for (const [w, maks] of [[1024, 640], [360, 344]]) {
    await ukur(w);
    await buka(`${base}/`, 6000);
    const r = await langkah(`Catat ${w}`, `document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()); await t(500);
      const ta = dialog().querySelector('textarea'); const lebar = Math.round(dialog().getBoundingClientRect().width);
      const dtTeks = new DataTransfer(); dtTeks.setData('text/plain', 'kopi 25rb');
      const evTeks = new ClipboardEvent('paste', { clipboardData: dtTeks, bubbles: true, cancelable: true }); ta.dispatchEvent(evTeks);
      const teksDibiarkan = !evTeks.defaultPrevented;
      const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'layar.png', { type: 'image/png' }));
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); ta.dispatchEvent(ev);
      await sampai(() => dialog().querySelector('img[alt="Foto yang dilampirkan"]'), 10);
      return { lebar, teksDibiarkan, gambarDicegah: ev.defaultPrevented, lampiran: !!dialog().querySelector('img[alt="Foto yang dilampirkan"]'), placeholder: dialog().querySelector('textarea').placeholder }`);
    cek(`${w}px: Catat selebar ${maks}px`, r.lebar === maks, String(r.lebar));
    cek(`${w}px: tempel teks tetap jadi teks biasa`, r.teksDibiarkan, "");
    cek(`${w}px: tempel gambar → dilampirkan seperti dari galeri`, r.gambarDicegah && r.lampiran && r.placeholder === "Tambah keterangan…", JSON.stringify(r));
    if (w === 1024) await foto("1024-tempel.png");
  }
  cek("tidak ada error console", masalah.length === 0, JSON.stringify(masalah));
} catch (e) {
  console.log("GAGAL:", e.message);
  gagal++;
} finally {
  if (uid) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    console.log(error ? "GAGAL hapus akun uji" : "✓ akun uji dihapus");
  }
  console.log(gagal ? `${gagal} cek gagal` : "semua cek lulus");
  edge.kill();
  process.exit(0);
}
