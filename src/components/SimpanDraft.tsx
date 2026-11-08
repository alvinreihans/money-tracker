"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditTransactionForm from "@/components/EditTransactionForm";
import { Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import type { Transaction } from "@/types/transaction";

/**
 * Detail draft yang "Tinggal dicek" (SPEC-periksa-dulu §1): Simpan langsung,
 * atau Ubah dulu lewat form (menyimpan form = Simpan).
 */
export default function SimpanDraft({ tx, ikutan }: { tx: Transaction; ikutan: { id: string; amount: number } | null }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    setSibuk(true);
    setGalat(null);
    const r = await fetch(`/api/draft/${tx.id}/simpan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { error?: string } | null;
    setSibuk(false);
    if (!r?.ok) return setGalat(d?.error ?? "Gagal menyimpan. Coba lagi.");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <button type="button" className={`${s.tombol} ${s.tombolPenuh}`} disabled={sibuk} onClick={() => void simpan()}>
        {sibuk ? <Spinner /> : "Simpan"}
      </button>
      <EditTransactionForm tx={tx} ikutan={ikutan} ubahSaja />
      {galat && <span className={s.galat}>{galat}</span>}
    </div>
  );
}
