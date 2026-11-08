"use client";

import { useEffect, useMemo, useState } from "react";
import s from "@/components/ui.module.css";
import { fmtWaktu } from "@/lib/format";
import { gelembungJejak, jejakRekening, type Gelembung, type IsiJejak } from "@/lib/jejak";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types/transaction";

/**
 * "Cara dicatat" di detail transaksi (docs/specs/SPEC-periksa-dulu.md §4): bagian
 * terlipat berisi gelembung percakapan ringkas yang hanya-baca — asal, hasil baca
 * AI, tanya-jawab, koreksi, waktu Simpan, dan thumbnail gambarnya. Transaksi
 * rekening koran: bank & uraian barisnya (dari kolom yang sudah ada). Tidak
 * tampil bila tidak ada jejaknya (mis. dicatat manual atau sebelum fitur ini).
 */
export default function CaraDicatat({ t }: { t: Pick<Transaction, "id" | "source" | "ref_bank" | "description"> }) {
  const db = useMemo(() => createSupabaseBrowserClient(), []);
  const [gelembung, setGelembung] = useState<Gelembung[] | null>(null);
  const rekening = jejakRekening(t);

  useEffect(() => {
    let batal = false;
    void db.rpc("jejak_catat", { p_id: t.id }).then(({ data }) => {
      if (batal) return;
      const baris = ((data ?? []) as { id: number; isi: IsiJejak; ada_foto: boolean }[]).map((b) => ({ ...b, id: Number(b.id) }));
      setGelembung(gelembungJejak(baris, fmtWaktu));
    });
    return () => {
      batal = true;
    };
    // Keterangan berubah (dilengkapi/dikoreksi): jejaknya mungkin bertambah.
  }, [db, t.id, t.description]);

  const isi = [...(rekening ?? []), ...(gelembung ?? [])];
  if (!isi.length) return null;

  return (
    <details className={`${s.blok} ${s.lipatan}`}>
      <summary>Cara dicatat</summary>
      <div className={`${s.obrolan} ${s.lipatanIsi}`} aria-label="Jejak pencatatan">
        {isi.map((g, i) =>
          g.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={`/api/jejak/${g.foto}/foto`} alt="Gambar yang dibaca" className={s.fotoJejak} loading="lazy" />
          ) : g.dari === "info" ? (
            <div key={i} className={s.bubInfo}>
              {g.teks}
            </div>
          ) : (
            <div key={i} className={`${s.bub} ${g.dari === "saya" ? s.bubSaya : s.bubApp}`}>
              {g.teks}
            </div>
          ),
        )}
      </div>
    </details>
  );
}
