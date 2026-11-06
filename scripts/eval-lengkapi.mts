/**
 * Eval AI untuk Lengkapi (SPEC-lengkapi): gambar BUATAN (HTML yang meniru tata
 * letak screenshot ShopeePay & struk minimarket, digambar Edge headless lewat
 * e2e/kepala.mjs) dibaca AI sungguhan (pipeline yang sama dengan unggah), lalu
 * field barunya dicek: "Kamu Membayar" vs total, sumber dana, e-wallet
 * perantara, cashback, Order SN / nomor bon, rekening tujuan, voucher struk.
 * Bukan data user. Hanya 3 panggilan AI.
 *
 * Pemakaian: npm run eval:lengkapi   (butuh GEMINI_API_KEY di .env.local)
 */
import fs from "node:fs";
import path from "node:path";
import { cdp, edge, out, tidur } from "../e2e/kepala.mjs";
import { processReceiptImage } from "../src/lib/receipt.ts";
import { KATEGORI_BAWAAN } from "../src/lib/kategori.ts";
import type { ExtractedReceipt } from "../src/types/transaction.ts";

const gaya = `body{margin:0;font-family:Roboto,Arial,sans-serif;background:#f2f2f2;width:400px;color:#222}
.atas{background:#ee4d2d;color:#fff;padding:18px 16px 60px;font-size:22px;font-weight:600}
.kartu{background:#fff;margin:-44px 14px 0;border-radius:12px;padding:20px;text-align:center}
.besar{font-size:30px}.ok{color:#26aa99;font-size:16px;margin-top:6px}
.isi{background:#fff;margin:10px 14px;border-radius:12px;padding:12px 16px;font-size:15px}
.r{display:flex;justify-content:space-between;gap:12px;padding:9px 0}.r span:first-child{color:#777}.r span:last-child{text-align:right}
.coret{text-decoration:line-through;color:#999}.merah{color:#ee4d2d}`;
const baris = (k: string, v: string) => `<div class="r"><span>${k}</span><span>${v}</span></div>`;

const GAMBAR: { nama: string; html: string; cek: (e: ExtractedReceipt) => [string, boolean][] }[] = [
  {
    nama: "rincian-pembayaran",
    html: `<style>${gaya}</style><div class="atas">&lt;&nbsp; Rincian Pembayaran</div>
      <div class="kartu"><div class="besar">-Rp32.500</div><div class="ok">✔ Berhasil</div></div>
      <div class="isi">${baris("Bayar Ke", "TOKO CONTOH SEJAHTERA")}${baris("Waktu Selesai", "03 Sep 2026 08:45")}
      ${baris("Total Pembelian", "Rp52.500")}${baris("Promo ShopeePay", "-Rp20.000")}${baris("Kamu Membayar", "Rp32.500")}
      ${baris("Metode Pembayaran", "SeaBank Bayar Instan - *1234")}${baris("Cashback", "Rp15")}
      ${baris("Order SN", "CONTOHSN12345ABCDE")}</div>
      <div class="isi" style="text-align:center;color:#ee4d2d">Cashback Saldo s.d Rp100.000 untuk transaksi berikutnya!</div>`,
    cek: (e) => [
      ["amount = Kamu Membayar 32.500", e.amount === 32_500],
      ["tanggal & jam", e.transaction_date === "2026-09-03" && e.time === "08:45"],
      ["document_type payment_proof", e.document_type === "payment_proof"],
      ["sumber_dana SeaBank", /^seabank$/i.test(e.sumber_dana ?? "")],
      ["dompet ShopeePay", /^shopee ?pay$/i.test(e.dompet ?? "")],
      ["cashback 15", e.cashback === 15],
      ["ref_bukti Order SN", e.ref_bukti === "CONTOHSN12345ABCDE"],
      ["voucher null (screenshot)", e.voucher == null],
    ],
  },
  {
    nama: "rincian-transfer-bank",
    html: `<style>${gaya}</style><div class="atas">&lt;&nbsp; Rincian Transfer Bank</div>
      <div class="kartu"><div class="besar">-Rp75.000</div><div class="ok">✔ Berhasil</div></div>
      <div class="isi">${baris("Dikirim Dari", "BUDI *******")}${baris("Kirim Ke", "SITI CONTOH<br>BCA 1234567890")}
      ${baris("Waktu Selesai", "13 Sep 2026 14:57")}${baris("Total Pembayaran", "Rp75.000")}
      ${baris("Jumlah Kirim Uang", "Rp75.000")}${baris("Biaya Admin", '<span class="coret">Rp2.500</span> <span class="merah">Gratis</span>')}
      ${baris("Sumber Dana", "SeaBank *1234")}${baris("Order SN", "XYZCONTOH7788QQ")}${baris("No. Referensi", "1111111111")}</div>`,
    cek: (e) => [
      ["amount 75.000", e.amount === 75_000],
      ["tanggal & jam", e.transaction_date === "2026-09-13" && e.time === "14:57"],
      ["sumber_dana SeaBank", /^seabank$/i.test(e.sumber_dana ?? "")],
      ["merchant/penerima Siti", /siti/i.test(e.merchant ?? "") || /siti/i.test(e.bukti_transfer?.penerima.nama ?? "")],
      ["rekening_tujuan BCA …7890", /^BCA\s*…\s*7890$/i.test(e.rekening_tujuan ?? "")],
      ["ref_bukti Order SN (bukan No. Referensi)", e.ref_bukti === "XYZCONTOH7788QQ"],
      ["biaya admin Gratis → tidak ada fee", !e.fee],
    ],
  },
  {
    nama: "struk-voucher",
    html: `<style>body{margin:0;background:#fff;width:400px;font-family:'Courier New',monospace;font-size:15px;color:#222;padding:20px 22px}
      .c{text-align:center}.g{color:#888}.r{display:flex;justify-content:space-between}hr{border:none;border-top:1px dashed #999;margin:10px 0}</style>
      <div class="c" style="font-size:24px;font-weight:bold">TokoMart</div><div class="c g">TOKOMART CONTOH RAYA<br>JL. CONTOH NO. 1</div><hr>
      <div class="r g"><span>Bon ZZ01-234-5678ABCD</span><span>Kasir : ANI</span></div><hr>
      <div class="r"><span>ROTI CONTOH 200G</span><span>1</span><span>12,000</span><span>12,000</span></div>
      <div class="r"><span>&nbsp;Disc</span><span></span><span></span><span>-1,500</span></div>
      <div class="r"><span>SABUN CONTOH 75G</span><span>1</span><span>7,000</span><span>7,000</span></div><hr>
      <div class="r"><span>Total Belanja</span><span>17,500</span></div>
      <div class="r"><span>VOUCHER</span><span>5,500</span></div>
      <div class="r"><span>CPM QRIS SHOPEEPAY</span><span>12,000</span></div>
      <div class="r"><span>Kembalian</span><span>0</span></div><hr>
      <div class="c">Tgl. 21-09-2026 22:15:10 V.2026.3.0</div><hr><div class="c g">TERIMA KASIH</div>`,
    cek: (e) => [
      ["document_type receipt", e.document_type === "receipt"],
      ["voucher 5.500 → amount 12.000 (= baris rekening)", e.voucher === 5_500 && e.amount === 12_000],
      ["tanggal & jam (≥ 22.00)", e.transaction_date === "2026-09-21" && e.time === "22:15"],
      ["sumber_dana null (hanya QRIS)", e.sumber_dana == null],
      ["dompet ShopeePay", /^shopee ?pay$/i.test(e.dompet ?? "")],
      ["ref_bukti nomor bon", e.ref_bukti === "ZZ012345678ABCD"],
    ],
  },
];

let gagal = 0;
try {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 400, height: 900, deviceScaleFactor: 2, mobile: true });
  const konteks = { kategori: KATEGORI_BAWAAN, kantong: ["SeaBank", "ShopeePay", "BCA"] };
  for (const g of GAMBAR) {
    await cdp("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8">${g.html}`)}` });
    await tidur(800);
    const tinggi = Number((await cdp("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true }))?.result?.value ?? 900);
    const png = Buffer.from(
      (await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 400, height: tinggi, scale: 1 } })).data,
      "base64",
    );
    fs.writeFileSync(path.join(out, `${g.nama}.png`), png);
    const r = await processReceiptImage(png, "image/png", konteks);
    const e = r.extracted!;
    console.log(`\n== ${g.nama} (${r.source}, ${r.status})`);
    console.log(JSON.stringify({ amount: e.amount, date: e.transaction_date, time: e.time, merchant: e.merchant, type: e.type, category: e.category, payment_method: e.payment_method, sumber_dana: e.sumber_dana, dompet: e.dompet, cashback: e.cashback, voucher: e.voucher, ref_bukti: e.ref_bukti, rekening_tujuan: e.rekening_tujuan, fee: e.fee, document_type: e.document_type }));
    for (const [nama, ok] of g.cek(e)) {
      console.log(`${ok ? "✓" : "✗"} ${nama}`);
      if (!ok) gagal++;
    }
  }
} catch (err) {
  console.log("GAGAL:", err instanceof Error ? err.message : err);
  gagal++;
} finally {
  edge.kill();
}
console.log(gagal ? `\n${gagal} cek gagal` : "\nsemua cek lulus");
process.exit(0);
