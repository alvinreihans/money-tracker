import { createRequire } from "node:module";
import { base, buka, cdp, edge, foto, fs, langkah, masalah } from "./kepala.mjs";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Bukti transfer sungguhan (antar dua orang) = data pribadi: gambar & nama
// pihaknya di archive/ (gitignored), bukan di repo. Contoh archive/e2e-arah.json:
// { "gambar": "bukti-transfer-arah.png", "pengirim": "Nama Pengirim", "penerima": "Nama Penerima",
//   "nominal": 16000, "bankPenerima": "SeaBank" }
const FIKSTUR = new URL("../archive/e2e-arah.json", import.meta.url);
if (!fs.existsSync(FIKSTUR)) {
  console.log("dilewati: butuh archive/e2e-arah.json beserta gambar bukti transfernya (lihat komentar di e2e/arah.mjs)");
  edge.kill();
  process.exit(0);
}
const F = JSON.parse(fs.readFileSync(FIKSTUR, "utf8"));
const GAMBAR = fs.readFileSync(new URL(`../archive/${F.gambar}`, import.meta.url));
const depan = (nama) => nama.split(" ")[0];
const PENGIRIM = depan(F.pengirim), PENERIMA = depan(F.penerima);
const ref = new URL(U).hostname.split(".")[0];
const akun = [];
let gagal = 0;
const cek = (nama, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

async function buatAkun(email) {
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: "Uji12345#", email_confirm: true, user_metadata: { onboarding_selesai: new Date().toISOString() } });
  if (error) throw error;
  akun.push(u.user.id);
  const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sesi } = await sb.auth.signInWithPassword({ email, password: "Uji12345#" });
  const isi = "base64-" + Buffer.from(JSON.stringify(sesi.session)).toString("base64url");
  const p = [];
  for (let i = 0; i < isi.length; i += 3180) p.push(isi.slice(i, i + 3180));
  const kue = p.length === 1 ? [[`sb-${ref}-auth-token`, isi]] : p.map((x, i) => [`sb-${ref}-auth-token.${i}`, x]);
  return { uid: u.user.id, sb, kue, cookie: kue.map(([n, v]) => `${n}=${v}`).join("; ") };
}
async function pakaiDiBrowser(a) {
  await cdp("Network.clearBrowserCookies");
  for (const [name, value] of a.kue) await cdp("Network.setCookie", { name, value, url: base, path: "/" });
}
// Unggah struk lewat API (seperti Bagikan/foto), dengan sesi akun itu.
async function unggah(a) {
  const fd = new FormData();
  fd.append("file", new File([GAMBAR], "ocbc.png", { type: "image/png" }));
  const res = await fetch(`${base}/api/upload-receipt`, { method: "POST", body: fd, headers: { cookie: a.cookie } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const terbaru = async (a) => (await a.sb.from("transactions").select("*").is("induk_id", null).order("created_at", { ascending: false }).limit(1)).data?.[0];

try {
  // --- A. Kantong SeaBank: bank penerima milik user → langsung masuk.
  const a = await buatAkun("uji-arah-a-sementara@example.com");
  await a.sb.from("user_accounts").insert({ user_id: a.uid, name: F.bankPenerima, kind: "bank", emoji: "🏦", saldo_awal: 0, saldo_sejak: "2026-01-01T00:00:00+07:00" });
  const rA = await unggah(a);
  const tA = await terbaru(a);
  const { data: sea } = await a.sb.from("user_accounts").select("id").eq("name", F.bankPenerima).single();
  cek("A. ada kantong bank penerima → tercatat MASUK ke sana, dari pengirimnya, langsung selesai",
    tA?.type === "income" && tA?.kantong_id === sea.id && new RegExp(F.pengirim, "i").test(tA?.merchant ?? "") && Number(tA?.amount) === F.nominal && tA?.status === "confirmed" && !tA?.bukti_transfer,
    JSON.stringify({ http: rA.status, type: tA?.type, merchant: tA?.merchant, amount: tA?.amount, status: tA?.status, kantong: tA?.payment_method, bukti: tA?.bukti_transfer }));

  // --- B. Tanpa kantong yang cocok: ditanya di Catat → "Aku terima" → masuk, nama dipelajari.
  const b = await buatAkun("uji-arah-b-sementara@example.com");
  await pakaiDiBrowser(b);
  await buka(`${base}/`, 6000);
  const b64 = GAMBAR.toString("base64");
  const tanya = await langkah("tempel bukti transfer di Catat", `
    document.querySelector('button[aria-label="Catat transaksi"]').click(); await sampai(() => dialog()?.querySelector('textarea'));
    const bin = atob('${b64}'); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], 'ocbc.png', { type: 'image/png' }));
    dialog().querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await t(500); dialog().querySelector('button[aria-label="Kirim"]').click();
    await sampai(() => /kirim ke .* atau terima dari/i.test(dialog()?.innerText || ''), 120);
    const teks = dialog().innerText.replace(/\\s+/g, ' ');
    return { tanya: (teks.match(/Ini kamu[^?]*\\?/) || [''])[0], chip: [...dialog().querySelectorAll('[class*=pilihanJawab] button')].map(x => x.textContent) }`);
  cek("B. tanpa kantong cocok → Catat bertanya dengan nama kedua pihak", (tanya?.tanya ?? "") === `Ini kamu yang kirim ke ${PENERIMA}, atau terima dari ${PENGIRIM}?` && tanya?.chip?.includes(`Aku terima dari ${PENGIRIM}`), JSON.stringify(tanya));
  await foto("fase1-arah-tanya.png");
  const jawab = await langkah("jawab Aku terima", `
    [...dialog().querySelectorAll('[class*=pilihanJawab] button')].find(x => x.textContent === ${JSON.stringify(`Aku terima dari ${PENGIRIM}`)}).click();
    await sampai(() => /Pakai kantong apa|kantong/i.test([...dialog().querySelectorAll('[class*=bubApp]')].at(-1)?.innerText || ''), 30);
    const chip = [...dialog().querySelectorAll('[class*=pilihanJawab] button')].map(x => x.textContent).filter(x => /Tunai/.test(x));
    [...dialog().querySelectorAll('[class*=pilihanJawab] button')].find(x => /Tunai/.test(x.textContent)).click();
    await sampai(() => /Tercatat|tercatat/.test(dialog()?.innerText || ''), 30);
    return { chip }`);
  const tB = await terbaru(b);
  const { data: akunB } = await admin.auth.admin.getUserById(b.uid);
  cek("B. setelah 'Aku terima' + pilih kantong → MASUK, selesai, nama tersimpan, bukti dikosongkan",
    tB?.type === "income" && tB?.status === "confirmed" && !tB?.bukti_transfer && new RegExp(PENGIRIM, "i").test(tB?.merchant ?? "") && JSON.stringify(akunB.user.user_metadata.nama_rekening ?? []).includes(F.penerima) && Boolean(akunB.user.user_metadata.onboarding_selesai),
    JSON.stringify({ jawab, type: tB?.type, status: tB?.status, merchant: tB?.merchant, nama: akunB.user.user_metadata.nama_rekening, onboarding: Boolean(akunB.user.user_metadata.onboarding_selesai) }));

  // Unggah kedua: nama sudah dikenal → arah tidak ditanya lagi (masih perlu kantong: SeaBank bukan kantongnya).
  await a.sb.auth.signOut();
  const rB2 = await unggah(b);
  const tB2 = await terbaru(b);
  cek("B. unggah kedua → langsung MASUK tanpa pertanyaan arah",
    tB2?.id !== tB?.id && tB2?.type === "income" && !tB2?.bukti_transfer && rB2.body?.pertanyaan !== "arah",
    JSON.stringify({ http: rB2.status, pertanyaan: rB2.body?.pertanyaan, type: tB2?.type, bukti: tB2?.bukti_transfer, status: tB2?.status }));

  // --- C. Profil → Nama di rekening.
  await buka(`${base}/profil`, 5000);
  const profil = await langkah("Profil nama di rekening", `
    [...document.querySelectorAll('button')].find(x => x.textContent.includes('Nama di rekening')).click();
    await sampai(() => dialog()?.innerText.includes(${JSON.stringify(F.penerima)}), 20);
    const ada = dialog().innerText.includes(${JSON.stringify(F.penerima)});
    isi(dialog().querySelector('input'), ${JSON.stringify(`${PENERIMA} R`)}); await t(200);
    tombol('Tambah', dialog()).click(); await t(1500);
    const tolak1kata = /Nama ini sudah ada|sudah/.test(dialog().innerText) ;
    isi(dialog().querySelector('input'), 'Budi Santoso'); await t(200);
    tombol('Tambah', dialog()).click(); await sampai(() => dialog().innerText.includes('Budi Santoso'), 20);
    dialog().querySelector('button[aria-label="Hapus Budi Santoso"]').click(); await sampai(() => !dialog().innerText.includes('Budi Santoso'), 20);
    return { ada, tolak1kata, akhir: [...dialog().querySelectorAll('[class*=barisJudul]')].map(x => x.textContent) }`);
  const { data: akunB2 } = await admin.auth.admin.getUserById(b.uid);
  cek("C. Profil: nama tampil; tambah & hapus tersimpan; onboarding tetap",
    profil?.ada && JSON.stringify(akunB2.user.user_metadata.nama_rekening) === JSON.stringify([F.penerima]) && Boolean(akunB2.user.user_metadata.onboarding_selesai),
    JSON.stringify({ profil, nama: akunB2.user.user_metadata.nama_rekening }));
  cek("tidak ada error console", masalah.length === 0, JSON.stringify(masalah));
} catch (e) {
  console.log("GAGAL:", e.message);
  gagal++;
} finally {
  for (const id of akun) {
    const { error } = await admin.auth.admin.deleteUser(id);
    console.log(error ? "GAGAL hapus akun uji" : "✓ akun uji dihapus");
  }
  console.log(gagal ? `${gagal} cek gagal` : "semua cek lulus");
  edge.kill();
  process.exit(0);
}
