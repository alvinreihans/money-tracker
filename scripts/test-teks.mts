/**
 * Coba ekstraksi teks ketikan lewat KODE PRODUKSI (processReceiptText) —
 * untuk mengecek perubahan prompt. Memanggil Groq sungguhan.
 *
 * Pemakaian: npm run test:teks -- "kopi 25rb gopay" "dikasih ibu 500k ke bri"
 */
import { processReceiptText } from "@/lib/receipt";

for (const teks of process.argv.slice(2)) {
  const r = await processReceiptText(teks);
  const e = r.extracted;
  console.log(
    `${teks}\n  → ${e?.type} ${e?.amount} · ${e?.category} · merchant=${e?.merchant} · dari=${e?.payment_method} · ke=${e?.payment_target}  [${r.status}; ${r.notes.at(-1)}]`,
  );
}
