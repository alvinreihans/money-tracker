/**
 * Coba ekstraksi teks ketikan lewat KODE PRODUKSI (processReceiptText) —
 * untuk mengecek perubahan prompt. Memanggil Groq sungguhan, dengan konteks
 * contoh (orang, kartu kredit, rencana cicilan) seperti milik user.
 *
 * Pemakaian: npm run test:teks -- "kopi 25rb gopay" "minjemin budi 200rb dari bca"
 */
import { KATEGORI_BAWAAN } from "@/lib/kategori";
import { processReceiptText } from "@/lib/receipt";

const konteks = {
  kategori: KATEGORI_BAWAAN,
  pihak: ["Budi", "Ibu", "Kartu kredit BCA"],
  cicilan: [{ nama: "HP Samsung", penyedia: "Shopee PayLater" }],
};

for (const teks of process.argv.slice(2)) {
  const r = await processReceiptText(teks, konteks);
  const e = r.extracted;
  const pinjam = e?.pinjaman ? ` · pinjaman=${e.pinjaman.arah}:${e.pinjaman.pihak}` : "";
  const cicil = e?.cicilan ? ` · cicilan=${e.cicilan}` : "";
  console.log(
    `${teks}\n  → ${e?.type} ${e?.amount} · ${e?.category} · merchant=${e?.merchant} · dari=${e?.payment_method} · ke=${e?.payment_target}${pinjam}${cicil}  [${r.status}; ${r.notes.at(-1)?.slice(0, 50)}]`,
  );
}
