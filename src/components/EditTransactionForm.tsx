"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, PencilLine } from "lucide-react";
import { useCatat, useKategori } from "@/components/Catat";
import { GalatForm, Lembar, Pesan, Spinner, useGalat } from "@/components/oneui";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import { useTawaranSerupa } from "@/components/TawaranSerupa";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { barisIkutan, validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Menyunting rincian transaksi di halaman penuh ala form Kontak Samsung.
 *
 * Ini yang menutup lingkaran untuk draft: tanpa ini, struk yang gagal dibaca
 * tersimpan bertanda "Perlu dibenerin" tapi tidak ada cara membenerinnya.
 * Untuk draft pemicunya tombol berwarna (aksi utama halaman itu), selain itu
 * cukup baris daftar.
 */
export default function EditTransactionForm({
  tx,
  ikutan,
  terpecah = false,
  terbuka = false,
  ubahSaja = false,
  onTutup,
  onTersimpan,
}: {
  tx: Transaction;
  /** Biaya admin / cashback yang menempel ke transaksi ini, kalau ada. */
  ikutan?: { id: string; amount: number } | null;
  /** Transaksi yang dipecah: nominal, kategori, kelompok, keterangan diatur per bagian. */
  terpecah?: boolean;
  /** Langsung terbuka tanpa tombol pemicu (Ubah dari kartu "Periksa dulu"); ditutup lewat onTutup. */
  terbuka?: boolean;
  /** Draft yang tinggal dicek: pemicunya tombol sekunder "Ubah" di samping Simpan. */
  ubahSaja?: boolean;
  onTutup?: () => void;
  onTersimpan?: (tx: Transaction) => void;
}) {
  const router = useRouter();
  const draft = tx.status === "needs_review";
  const { kantong } = useCatat();
  const kategori = useKategori();
  const [bukaSendiri, setBukaSendiri] = useState(false);
  const buka = terbuka || bukaSendiri;
  const setBuka = (b: boolean) => (terbuka ? !b && onTutup?.() : setBukaSendiri(b));
  const [loading, setLoading] = useState(false);
  const [nilai, setNilai] = useState(() => nilaiAwal(tx, undefined, ikutan?.amount));
  const { galat, gagal, bersihkan } = useGalat(nilai);
  const serupa = useTawaranSerupa();

  function bukaForm() {
    setNilai(nilaiAwal(tx, undefined, ikutan?.amount));
    bersihkan();
    setBuka(true);
  }

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    bersihkan();

    const cek = validasiTransaksi({ ...nilai }, { wajibKantong: kantong.length > 0, kategori });
    if (!cek.ok) return gagal(cek.error, cek.kolom);

    setLoading(true);
    const db = createSupabaseBrowserClient();
    const { biaya_admin, cashback, ...kolom } = cek.data;
    const baru = {
      ...kolom,
      // Begitu dibetulkan manual, nominalnya sudah bisa dipercaya — jadi
      // ikut dihitung di laporan dan penanda merahnya dilepas. Draft tetap draft
      // dulu: disimpan lewat logika Simpan bersama di bawah (SPEC-periksa-dulu §1).
      status: draft ? "needs_review" : "confirmed",
      // Bukti transfer yang belum dijawab: arahnya kini dipilih di form; dugaan dobel sudah dilihat user.
      ...(draft ? { bukti_transfer: null, duplikat_dari: null } : { raw_ocr_text: null, bukti_transfer: null }),
      // Dari rekening koran: sudah dilihat & dilengkapi user (SPEC-impor-rekening).
      perlu_dilengkapi: false,
    };
    const { error: err } = await db.from("transactions").update(baru).eq("id", tx.id);
    if (err) {
      setLoading(false);
      return gagal(dbErrorMessage(err));
    }

    // Samakan transaksi ikutan dengan isian: ubah, tambah, atau hapus.
    const tujuan = kantong.find((k) => k.id === kolom.kantong_tujuan_id)?.name;
    const harus = barisIkutan({ ...tx, ...baru }, { biaya_admin, cashback }, tujuan);
    // Kantong induk tidak berubah: kantong ikutan dibiarkan — cashback bisa ada di
    // kantong e-wallet perantaranya, mis. ShopeePay (SPEC-lengkapi K2).
    const ubahIkutan = harus && tx.kantong_id === kolom.kantong_id ? Object.fromEntries(Object.entries(harus).filter(([k]) => k !== "kantong_id" && k !== "payment_method")) : harus;
    const { error: errIkutan } = harus
      ? ikutan
        ? await db.from("transactions").update(ubahIkutan!).eq("id", ikutan.id)
        : await db.from("transactions").insert(harus)
      : ikutan
        ? await db.from("transactions").delete().eq("id", ikutan.id)
        : { error: null };
    if (errIkutan) {
      setLoading(false);
      return gagal(dbErrorMessage(errIkutan));
    }

    // Menyimpan form = Simpan (SPEC-periksa-dulu §1): ikutan, nomor cicilan, dan "Cara dicatat".
    let tersimpan = { ...tx, ...baru } as Transaction;
    if (draft) {
      const r = await fetch(`/api/draft/${tx.id}/simpan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form: true }) }).catch(() => null);
      const d = (await r?.json().catch(() => null)) as { transaction?: Transaction; error?: string } | null;
      if (!r?.ok || !d?.transaction) {
        setLoading(false);
        return gagal(d?.error ?? "Gagal menyimpan. Coba lagi.");
      }
      tersimpan = d.transaction;
    }
    setLoading(false);

    setBuka(false);
    router.refresh();
    onTersimpan?.(tersimpan);

    // Kategori dibetulkan: tawarkan ikut membetulkan transaksi lain dari
    // merchant yang sama (SPEC-ingat-kategori).
    const merchant = kolom.merchant?.trim();
    if (!terpecah && merchant && kolom.category !== tx.category && (kolom.type === "expense" || kolom.type === "income")) {
      const nama = kategori.find((k) => k.type === kolom.type && k.slug === kolom.category)?.name ?? kolom.category;
      void serupa.tawarkan({ merchant, type: kolom.type, kategori: { slug: kolom.category, name: nama }, kelompok: kolom.kelompok ?? null, kecuali: tx.id });
    }
  }

  return (
    <>
      {terbuka ? null : draft ? (
        <button type="button" className={ubahSaja ? `${s.tombol} ${s.tombolSekunder} ${s.tombolPenuh}` : s.tombol} onClick={bukaForm}>
          {ubahSaja ? "Ubah" : "Betulkan sekarang"}
        </button>
      ) : (
        <button type="button" className={`${s.blok} ${s.baris}`} onClick={bukaForm}>
          <span className={s.barisIkon} aria-hidden>
            <PencilLine size={20} />
          </span>
          <span className={s.barisTeks}>
            <span className={s.barisJudul}>Edit transaksi</span>
            <span className={s.redup}>Ada yang kebaca salah?</span>
          </span>
          <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
        </button>
      )}

      {buka && (
        <Lembar
          judul={draft ? "Betulkan transaksi" : "Edit transaksi"}
          sub={draft ? "Begitu disimpan, transaksinya ikut dihitung di laporan." : undefined}
          posisi="penuh"
          isian={nilai}
          onClose={() => !loading && setBuka(false)}
          pil={[
            { label: "Batal", batal: true, disabled: loading },
            { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
          ]}
        >
          <form onSubmit={simpan} className={s.form}>
            <GalatForm value={galat}>
              <TransactionFields nilai={nilai} terpecah={terpecah} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
            </GalatForm>
            {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}
            <button type="submit" hidden />
          </form>
        </Lembar>
      )}
      {serupa.elemen}
    </>
  );
}
