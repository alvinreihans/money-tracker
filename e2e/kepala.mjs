// Kepala bersama uji end-to-end: Edge/Chrome headless lewat Chrome DevTools
// Protocol, tanpa pustaka tambahan. Diimpor setiap suite di folder ini; begitu
// diimpor, browser sudah terbuka di lebar HP (360 px, atau env LEBAR).
//
// Pemakaian: npm run e2e [suite ...]          (dev server harus jalan)
//            node --env-file=.env.local e2e/<suite>.mjs [base-url] [folder-hasil]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export { fs };
export const base = process.argv[2] ?? process.env.E2E_BASE ?? "http://localhost:3000";
const suite = path.basename(process.argv[1] ?? "e2e", ".mjs");
/** Folder tangkapan layar (gitignored). */
export const out = process.argv[3] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "hasil", suite);
fs.mkdirSync(out, { recursive: true });

// Browser: E2E_BROWSER, atau Edge/Chrome di lokasi umum.
const BROWSER = [
  process.env.E2E_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && fs.existsSync(p));
if (!BROWSER) throw new Error("Browser tidak ditemukan; atur E2E_BROWSER ke Edge/Chrome.");

export const PORT = 9333 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "cdp-"));
export const edge = spawn(BROWSER, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "about:blank"], { stdio: "ignore" });
export const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await tidur(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page");
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const tunggu = new Map();
/** Galat & exception dari halaman selama suite berjalan. */
export const masalah = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) {
    tunggu.get(m.id)(m.result);
    tunggu.delete(m.id);
  }
  if (m.method === "Runtime.exceptionThrown") masalah.push("EXCEPTION " + m.params.exceptionDetails.exception?.description?.slice(0, 300));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") masalah.push("ERROR " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
});
export const cdp = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    tunggu.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
export const jalankan = async (js) => {
  const r = await cdp("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true });
  return r?.result?.value ?? r?.exceptionDetails?.exception?.description ?? r?.exceptionDetails?.text;
};
export const buka = async (url, ms = 5000) => {
  await cdp("Page.navigate", { url });
  await tidur(ms);
};
export const foto = async (nama) => fs.writeFileSync(path.join(out, nama), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));

// Bantuan di dalam halaman untuk `langkah`.
const UTIL = `
const t=ms=>new Promise(r=>setTimeout(r,ms));
const sampai=async(cek,n=40)=>{for(let i=0;i<n;i++){try{if(cek())return true}catch{} await t(500)} return false};
const tombol=(teks,akar=document)=>[...akar.querySelectorAll('button')].find(e=>e.textContent.replace(/\\s+/g,' ').trim().startsWith(teks));
const dialog=()=>[...document.querySelectorAll('dialog[open]')].at(-1);
const isi=(el,v)=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}))};
const kolom=(ph)=>dialog().querySelector('input[placeholder="'+ph+'"], textarea[placeholder="'+ph+'"]');
const teksHalaman=()=>document.body.innerText.replace(/\\s+/g,' ');
const sesi=()=>{const c=document.cookie.split('; ').filter(x=>x.startsWith('sb-')&&x.includes('auth-token')).sort().map(x=>decodeURIComponent(x.split('=').slice(1).join('='))); return JSON.parse(atob(c.join('').replace(/^base64-/,'')))};
const rest=async(p,opsi={})=>{const s=sesi(); const r=await fetch('${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/'+p,{...opsi,headers:{apikey:'${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}',authorization:'Bearer '+s.access_token,'content-type':'application/json',prefer:'return=representation',...(opsi.headers||{})}}); return r.status===204?[]:r.json()};
`;
/** Jalankan `js` di halaman (dengan bantuan UTIL), cetak & kembalikan hasilnya. */
export const langkah = async (nama, js) => {
  const hasil = await jalankan(`(async()=>{${UTIL} try{ ${js} }catch(e){ return 'GAGAL: '+e.message } })()`);
  console.log(`${nama}: ${hasil}`);
  return hasil;
};

await cdp("Runtime.enable");
await cdp("Page.enable");
const LEBAR_LAYAR = Number(process.env.LEBAR ?? 360);
await cdp("Emulation.setDeviceMetricsOverride", { width: LEBAR_LAYAR, height: 860, deviceScaleFactor: 1, mobile: LEBAR_LAYAR < 600 });
