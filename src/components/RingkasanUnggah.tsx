"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useCatat } from "@/components/Catat";
import EditTransactionForm from "@/components/EditTransactionForm";
import KartuPeriksa from "@/components/KartuPeriksa";
import { Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import type { ItemStruk } from "@/components/UploadReceiptForm";
import { buangDraft, urungkanBuang, type SalinanDraft } from "@/lib/buang-draft";
import { alasanTidakIkut, LABEL_KURANG, pertanyaanDraft } from "@/lib/draft";
import { fmtIDR, fmtTanggalPendek } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { saldoSejak } from "@/lib/waktu";
import type { Transaction } from "@/types/transaction";

/**
 * Ringkasan unggah banyak gambar (docs/specs/SPEC-lengkapi.md §7): berapa yang
 * melengkapi transaksi yang sudah ada (bisa diurungkan satu per satu, K1),
 * perlu dicek, dan cashback yang menunggu kantong e-wallet-nya (K4).
 *
 * Perlu dicek (SPEC-periksa-dulu §2): tiap gambar yang membuat transaksi baru =
 * satu kartu periksa, dengan "Simpan semua (n)" untuk yang lengkap dan tidak
 * ditandai. Yang masih ada pertanyaannya atau dugaan dobel dibuka di obrolan.
 */

/** "38 struk: 34 melengkapi transaksi, 2 dicatat baru, 2 perlu dicek". */
export function teksRingkasan(items: ItemStruk[]): string {
  const n = (st: ItemStruk["status"][]) => items.filter((i) => st.includes(i.status)).length;
  const bagian = [
    [n(["dilengkapi"]), "melengkapi transaksi"],
    [n(["ok"]), "dicatat baru"],
    [n(["draft", "ragu"]), "perlu dicek"],
    [n(["dipakai"]), "sudah pernah dipakai"],
    [n(["gagal"]), "gagal"],
  ]
    .filter(([x]) => x)
    .map(([x, t]) => `${x} ${t}`);
  return `${items.length} struk: ${bagian.join(", ") || "selesai"}`;
}

const judulTx = (t: Pick<Transaction, "merchant" | "amount" | "transaction_date"> | null | undefined) =>
  t ? `${t.merchant ?? "Tanpa nama"} · ${fmtIDR(Number(t.amount))} · ${fmtTanggalPendek(t.transaction_date)}` : "Transaksi";

type Disimpan = { transaction: Transaction; sebelum: Record<string, unknown> };

export default function RingkasanUnggah({
  items,
  onUbah,
  onCek,
  onBuka,
  onClose,
}: {
  items: ItemStruk[];
  onUbah: (items: ItemStruk[]) => void;
  /** Buka "Belum selesai" untuk yang perlu dicek. */
  onCek: () => void;
  /** Buka satu catatan di obrolan (masih ada pertanyaan / dugaan dobel). */
  onBuka: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { kategori, kantong } = useCatat();
  const db = useMemo(() => createSupabaseBrowserClient(), []);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [cashbackSelesai, setCashbackSelesai] = useState<string | null>(null);
  // Draft hasil unggah ini yang masih menunggu dicek (dibaca ulang dari database).
  const idDraft = useMemo(() => items.flatMap((i) => ((i.status === "draft" || i.status === "ragu") && i.tx ? [i.tx.id] : [])), [items]);
  const [draft, setDraft] = useState<Transaction[] | null>(null);
  // Ringkasan sesudah Simpan semua ("2 tersimpan · 1 perlu dicek"), dengan Urungkan.
  const [semua, setSemua] = useState<{ disimpan: Disimpan[]; sisa: number; diurungkan?: boolean } | null>(null);
  const [dibuang, setDibuang] = useState<SalinanDraft | null>(null);
  const [ubah, setUbah] = useState<{ tx: Transaction; ikutan: { id: string; amount: number } | null } | null>(null);
  const saldoDari = useCallback(
    (id: string) => {
      const k = kantong.find((x) => x.id === id);
      return k?.saldo_per ? saldoSejak({ saldo_per: k.saldo_per, saldo_sejak: k.saldo_sejak }) : undefined;
    },
    [kantong],
  );

  const muat = useCallback(async () => {
    if (!idDraft.length) return setDraft([]);
    const { data } = await db.from("transactions").select("*").in("id", idDraft).eq("status", "needs_review");
    const per = new Map(((data ?? []) as Transaction[]).map((t) => [t.id, t]));
    setDraft(idDraft.flatMap((id) => (per.has(id) ? [per.get(id)!] : [])));
  }, [db, idDraft]);
  useEffect(() => {
    // Memuat sekali saat dibuka; data dari database, bukan state turunan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat]);
  const ikut = (draft ?? []).filter((t) => !alasanTidakIkut(t, saldoDari));

  async function kirim(url: string, body: unknown) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    return { ok: Boolean(r?.ok), data: ((await r?.json().catch(() => null)) ?? {}) as Record<string, unknown> };
  }

  async function simpanSemua() {
    setSibuk("semua");
    setGalat(null);
    const n = draft?.length ?? 0;
    const r = await kirim("/api/draft/simpan", { ids: ikut.map((t) => t.id) });
    setSibuk(null);
    const disimpan = (r.data.disimpan ?? []) as Disimpan[];
    if (!r.ok) return setGalat((r.data.error as string) ?? "Gagal menyimpan. Coba lagi.");
    setSemua({ disimpan, sisa: n - disimpan.length });
    await muat();
    router.refresh();
  }

  async function urungkanSemua() {
    if (!semua) return;
    setSibuk("urung");
    const r = await kirim("/api/draft/urungkan", { items: semua.disimpan.map((d) => ({ id: d.transaction.id, sebelum: d.sebelum })) });
    setSibuk(null);
    if (!r.ok) return setGalat("Gagal mengurungkan. Coba lagi.");
    setSemua({ ...semua, diurungkan: true });
    await muat();
    router.refresh();
  }

  async function simpanSatu(t: Transaction) {
    setSibuk(t.id);
    setGalat(null);
    const r = await kirim(`/api/draft/${t.id}/simpan`, {});
    setSibuk(null);
    if (!r.ok) return setGalat((r.data.error as string) ?? "Gagal menyimpan. Coba lagi.");
    await muat();
    router.refresh();
  }

  async function buang(t: Transaction) {
    setSibuk(t.id);
    const salinan = await buangDraft(db, t.id);
    setSibuk(null);
    if (!salinan) return setGalat("Gagal membuang catatannya.");
    setDibuang(salinan);
    await muat();
    router.refresh();
  }

  async function urungkanBuangDraft() {
    if (!dibuang) return;
    setSibuk("buang");
    const g = await urungkanBuang(db, dibuang);
    setSibuk(null);
    if (g) return setGalat(g);
    setDibuang(null);
    await muat();
    router.refresh();
  }

  async function bukaUbah(t: Transaction) {
    const { data } = await db.from("transactions").select("id, amount").eq("induk_id", t.id).limit(1).maybeSingle();
    setUbah({ tx: t, ikutan: data ? { id: data.id as string, amount: Number(data.amount) } : null });
  }

  const dilengkapi = items.filter((i) => i.status === "dilengkapi");
  const baru = items.filter((i) => i.status === "ok");
  // Tanpa catatan (mis. pasangannya ragu): tetap lewat "Belum selesai".
  const cek = items.filter((i) => (i.status === "draft" || i.status === "ragu") && !i.tx);
  const dipakai = items.filter((i) => i.status === "dipakai");
  const gagal = items.filter((i) => i.status === "gagal");
  const tertunda = dilengkapi.filter((i) => !i.diurungkan && i.lengkapi?.cashback_tertunda);
  const dompet = tertunda[0]?.lengkapi?.cashback_tertunda?.dompet ?? "ShopeePay";

  async function urungkan(i: ItemStruk) {
    if (!i.lengkapi || sibuk) return;
    setSibuk(i.id);
    setGalat(null);
    const r = await fetch("/api/lengkapi/urungkan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: i.lengkapi.transaction.id, sebelum: i.lengkapi.sebelum, ikutan_id: i.lengkapi.ikutan_id, kantong_baru: i.lengkapi.kantong_baru }),
    }).catch(() => null);
    setSibuk(null);
    if (!r?.ok) return setGalat("Gagal mengurungkan. Coba lagi.");
    onUbah(items.map((x) => (x.id === i.id ? { ...x, diurungkan: true } : x)));
    router.refresh();
  }

  async function catatCashback() {
    setSibuk("cashback");
    setGalat(null);
    const r = await fetch("/api/lengkapi/cashback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dompet, items: tertunda.map((i) => ({ id: i.lengkapi!.transaction.id, nominal: i.lengkapi!.cashback_tertunda!.nominal })) }),
    }).catch(() => null);
    const data = (await r?.json().catch(() => null)) as { dicatat?: number; kantong?: string; error?: string } | null;
    setSibuk(null);
    if (!r?.ok || !data) return setGalat(data?.error ?? "Gagal mencatat cashback-nya.");
    setCashbackSelesai(`${data.dicatat} cashback dicatat di kantong ${data.kantong}.`);
    onUbah(items.map((x) => (tertunda.includes(x) && x.lengkapi ? { ...x, lengkapi: { ...x.lengkapi, cashback_tertunda: null } } : x)));
    router.refresh();
  }

  const bagian = (judul: string, isi: React.ReactNode) => (
    <div className={s.blok}>
      <h3 className={s.judulBagian}>{judul}</h3>
      {isi}
    </div>
  );

  return (
    <Lembar judul="Hasil unggah" sub={teksRingkasan(items)} posisi="penuh" onClose={onClose} pil={[{ label: "Tutup", batal: true }]}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {galat && <Pesan jenis="bahaya">{galat}</Pesan>}
        {semua && (
          <Pesan
            jenis={semua.diurungkan ? "info" : "sukses"}
            aksi={
              !semua.diurungkan && semua.disimpan.length > 0 ? (
                <button type="button" className={`${s.flat} ${s.flatRingkas}`} disabled={Boolean(sibuk)} onClick={() => void urungkanSemua()}>
                  {sibuk === "urung" ? <Spinner /> : "Urungkan"}
                </button>
              ) : undefined
            }
          >
            {semua.diurungkan
              ? "Simpan semua diurungkan: kembali jadi “Tinggal dicek”."
              : [`${semua.disimpan.length} tersimpan`, semua.sisa > 0 ? `${semua.sisa} perlu dicek` : null].filter(Boolean).join(" · ")}
          </Pesan>
        )}
        {dibuang && (
          <Pesan
            jenis="info"
            aksi={
              <button type="button" className={`${s.flat} ${s.flatRingkas}`} disabled={Boolean(sibuk)} onClick={() => void urungkanBuangDraft()}>
                {sibuk === "buang" ? <Spinner /> : "Urungkan"}
              </button>
            }
          >
            Catatannya dibuang.
          </Pesan>
        )}
        {draft === null && idDraft.length > 0 && <Spinner label="Memuat…" />}
        {draft !== null &&
          draft.length > 0 &&
          bagian(
            `Perlu dicek (${draft.length})`,
            <div className={`${s.blokIsi} ${s.daftarPeriksa}`}>
              <span className={s.redup}>Belum tersimpan sampai kamu menekan Simpan. Yang masih ditanya atau mungkin dobel dibuka satu per satu.</span>
              {ikut.length > 0 && (
                <button type="button" className={`${s.tombol} ${s.tombolPenuh}`} disabled={Boolean(sibuk)} onClick={() => void simpanSemua()}>
                  {sibuk === "semua" ? <Spinner /> : `Simpan semua (${ikut.length})`}
                </button>
              )}
              {draft.map((t) => {
                const alasan = alasanTidakIkut(t, saldoDari);
                if (alasan === null || alasan === "ragu")
                  return (
                    <KartuPeriksa
                      key={t.id}
                      tx={t}
                      foto={`/api/draft/${t.id}/foto`}
                      kategori={kategori}
                      kantong={kantong}
                      sibuk={Boolean(sibuk)}
                      menyimpan={sibuk === t.id}
                      catatan={alasan === "ragu" ? "Tidak ikut Simpan semua." : null}
                      onSimpan={() => void simpanSatu(t)}
                      onUbah={() => void bukaUbah(t)}
                      onBuang={() => void buang(t)}
                    />
                  );
                return (
                  <button key={t.id} type="button" className={`${s.baris} ${s.tekan}`} style={{ padding: 0 }} onClick={() => onBuka(t.id)}>
                    <span className={s.thumbDraft} aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/draft/${t.id}/foto`} alt="" />
                    </span>
                    <span className={s.barisTeks}>
                      <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>
                        {judulTx(t)}
                      </span>
                      <span className={s.peringatan} style={{ fontSize: 14 }}>
                        {alasan === "dobel" ? LABEL_KURANG.duplikat : LABEL_KURANG[pertanyaanDraft(t, saldoDari) ?? "konfirmasi"]}
                      </span>
                    </span>
                    <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
                  </button>
                );
              })}
            </div>,
          )}
        {cek.length > 0 &&
          bagian(
            `Perlu dicek (${cek.length})`,
            <div className={s.blokIsi} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className={s.redup}>Tidak terbaca, atau cocok dengan beberapa transaksi. Dibuka satu per satu.</span>
              <div className={s.pilihanJawab}>
                <button type="button" onClick={onCek}>
                  Cek sekarang
                </button>
              </div>
            </div>,
          )}
        {tertunda.length > 0 &&
          bagian(
            `Cashback belum dicatat (${tertunda.length})`,
            <div className={s.blokIsi} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className={s.redup}>
                {fmtIDR(tertunda.reduce((n, i) => n + (i.lengkapi?.cashback_tertunda?.nominal ?? 0), 0))} cashback masuk ke saldo {dompet}, tapi belum ada kantong {dompet}.
              </span>
              <div className={s.pilihanJawab}>
                <button type="button" disabled={Boolean(sibuk)} onClick={() => void catatCashback()}>
                  {sibuk === "cashback" ? <Spinner /> : `Buat kantong ${dompet} & catat`}
                </button>
              </div>
            </div>,
          )}
        {cashbackSelesai && <Pesan jenis="info">{cashbackSelesai}</Pesan>}
        {dilengkapi.length > 0 &&
          bagian(
            `Melengkapi transaksi (${dilengkapi.length})`,
            dilengkapi.map((i) => (
              <div key={i.id} className={s.baris}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>{judulTx(i.diurungkan ? { ...i.lengkapi!.transaction, ...i.lengkapi!.sebelum } as Transaction : i.tx)}</span>
                  <span className={s.redup} style={{ whiteSpace: "normal" }}>
                    {i.diurungkan ? "Diurungkan" : i.lengkapi?.perubahan.join(" · ") || "Tanda sudah dilengkapi"}
                  </span>
                </span>
                {!i.diurungkan && (
                  <button type="button" className={`${s.flat} ${s.flatRingkas}`} disabled={Boolean(sibuk)} onClick={() => void urungkan(i)}>
                    {sibuk === i.id ? <Spinner /> : "Urungkan"}
                  </button>
                )}
              </div>
            )),
          )}
        {baru.length > 0 &&
          bagian(
            `Dicatat baru (${baru.length})`,
            baru.map((i) => (
              <div key={i.id} className={s.baris}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>{i.tx ? judulTx(i.tx) : i.file.name}</span>
                </span>
              </div>
            )),
          )}
        {dipakai.length > 0 &&
          bagian(
            `Sudah pernah dipakai (${dipakai.length})`,
            dipakai.map((i) => (
              <div key={i.id} className={s.baris}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul}>{i.dipakai?.label ?? i.file.name}</span>
                  <span className={s.redup}>Tidak diproses lagi</span>
                </span>
              </div>
            )),
          )}
        {gagal.length > 0 &&
          bagian(
            `Gagal (${gagal.length})`,
            gagal.map((i) => (
              <div key={i.id} className={s.baris}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul}>{i.file.name}</span>
                  <span className={s.redup}>Coba kirim lagi</span>
                </span>
              </div>
            )),
          )}
      </div>
      {ubah && (
        <EditTransactionForm
          key={ubah.tx.id}
          tx={ubah.tx}
          ikutan={ubah.ikutan}
          terbuka
          onTutup={() => setUbah(null)}
          onTersimpan={() => {
            setUbah(null);
            void muat();
          }}
        />
      )}
    </Lembar>
  );
}
