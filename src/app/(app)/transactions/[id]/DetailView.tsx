"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCatat, useKategori } from "@/components/Catat";
import DeleteTransactionButton from "@/components/DeleteTransactionButton";
import EditTransactionForm from "@/components/EditTransactionForm";
import { tandaTransaksi } from "@/components/kategori";
import { LAYAR_LEBAR } from "@/components/navigasi";
import { AppBar, Pesan } from "@/components/oneui";
import PecahTransaksi, { bacaUsulan } from "@/components/PecahTransaksi";
import BayarDariTujuan from "@/components/BayarDariTujuan";
import s from "@/components/ui.module.css";
import { bacaBukti, rapikanNama } from "@/lib/arah";
import { alasanDraft } from "@/lib/kantong";
import { namaKategori } from "@/lib/kategori";
import { NAMA_KELOMPOK, type Kelompok } from "@/lib/metode";
import { fmtIDR, fmtTanggal, fmtWaktu, JENIS, labelSumber } from "@/lib/format";
import { fmtJam } from "@/lib/waktu";
import type { Transaction } from "@/types/transaction";

export default function DetailView({
  t,
  ikutan,
  bagian = [],
  kembali,
  halaman = false,
}: {
  t: Transaction;
  ikutan: { id: string; amount: number } | null;
  /** Bagian lain kalau transaksi ini dipecah (SPEC-metode-budget). */
  bagian?: Transaction[];
  /** Halaman asal (Beranda / Riwayat dengan filternya), tujuan kembali & setelah hapus. */
  kembali: string;
  /** Dibuka sebagai halaman /transactions/[id], bukan di panel Riwayat. */
  halaman?: boolean;
}) {
  const router = useRouter();
  // Halaman detail di layar lebar (tautan notifikasi, snackbar "Lihat", Fold
  // dibuka): pindah ke dua panel Riwayat, seperti membuka dari daftarnya.
  useEffect(() => {
    if (!halaman) return;
    const lebar = window.matchMedia(LAYAR_LEBAR);
    const pindah = () => lebar.matches && router.replace(`/riwayat?id=${t.id}`);
    pindah();
    lebar.addEventListener("change", pindah);
    return () => lebar.removeEventListener("change", pindah);
  }, [halaman, router, t.id]);
  const draft = t.status === "needs_review";
  const alasan = alasanDraft(t);
  const bukti = bacaBukti(t.bukti_transfer);
  const pihak = bukti && [bukti.pengirim.nama, bukti.penerima.nama].map(rapikanNama).filter(Boolean).join(" dan ");
  const nama = t.merchant ?? "Tanpa nama";
  const kategori = useKategori();
  const { ikon: Ikon, warna } = tandaTransaksi(t, kategori);
  const { kantong } = useCatat();
  const pindah = t.type === "transfer";
  // Dipecah: tampil sebagai satu transaksi dengan total semua bagiannya.
  const terpecah = bagian.length > 0;
  const total = Number(t.amount) + bagian.reduce((n, b) => n + Number(b.amount), 0);
  const usulan = bacaUsulan(t);
  const namaKelompok = (x: Transaction) => NAMA_KELOMPOK[(x.kelompok_efektif as Kelompok) ?? "keinginan"];

  // Baris kosong dilewati: label tanpa isi cuma bikin rincian terlihat bolong.
  const rincian = [
    ["Jenis", JENIS[t.type]],
    ["Kategori", pindah || terpecah ? null : namaKategori(kategori, t.category, t.type)],
    ["Kelompok", t.type === "expense" && !terpecah ? `${namaKelompok(t)}${t.kelompok ? " (diubah)" : ""}` : null],
    // Tanpa kantong tertaut, teksnya cuma metode bayar yang disebut, belum tentu kantong.
    [t.kantong_id ? (pindah ? "Dari kantong" : "Kantong") : "Metode bayar", t.payment_method],
    ["Ke kantong", pindah ? kantong.find((k) => k.id === t.kantong_tujuan_id)?.name : null],
    [pindah ? "Biaya admin" : "Cashback", ikutan ? fmtIDR(ikutan.amount) : null],
    ["Keterangan", terpecah ? null : t.description],
    ["Masuk lewat", labelSumber(t.source)],
    ["Dicatat", fmtWaktu(t.created_at)],
  ].filter(([, v]) => v);

  return (
    <>
      <AppBar
        kembali={kembali}
        judul={`${t.type === "income" ? "+" : ""}${fmtIDR(total)}`}
        judulKecil={nama}
        sub={[nama, fmtTanggal(t.transaction_date), fmtJam(t.waktu)].filter(Boolean).join(" · ")}
        aksi={<DeleteTransactionButton id={t.id} kembali={kembali} draft={draft} />}
        ikon={
          <span
            className={s.ikonBesar}
            style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }}
            aria-hidden
          >
            <Ikon size={30} />
          </span>
        }
      />

      <div className={s.isi}>
        {draft && (
          <Pesan
            jenis="peringatan"
            judul="Belum selesai"
            aksi={<EditTransactionForm tx={t} ikutan={ikutan} />}
          >
            {alasan === "arah"
              ? `Ini bukti transfer${pihak ? ` antara ${pihak}` : ""}. Kamu yang kirim atau yang terima? Jawab di Catat (titik di tombol +), atau betulkan di sini.`
              : alasan === "kantong"
                ? t.payment_method
                  ? `Nggak ada kantong yang cocok dengan “${t.payment_method}”. Pilih kantongnya dulu; sampai itu transaksi ini belum ikut dihitung.`
                  : "Kantongnya nggak disebut. Pilih kantongnya dulu; sampai itu transaksi ini belum ikut dihitung."
                : "Struk atau teksnya nggak berhasil dibaca, jadi nominalnya belum benar dan belum ikut dihitung di laporan."}
          </Pesan>
        )}

        {/* Struk campuran: tawaran pecah di atas supaya terlihat (SPEC-tawar-pecah). */}
        {!draft && !terpecah && t.type === "expense" && usulan && <PecahTransaksi tx={t} bagian={bagian} usulan={usulan} />}

        <dl className={s.blok} style={{ margin: 0 }}>
          {rincian.map(([k, v]) => (
            <div key={k} className={s.statBaris}>
              <dt className={s.redup}>{k}</dt>
              <dd style={{ margin: 0, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{v}</dd>
            </div>
          ))}
        </dl>

        {draft && (alasan === "baca" || t.raw_ocr_text) && (
          <>
            <h2 className={s.subheader}>{alasan === "kantong" ? "Teks aslinya" : "Teks yang sempat kebaca"}</h2>
            <div className={`${s.blok} ${s.blokIsi}`}>
              {t.raw_ocr_text ? (
                <pre className={s.pre}>{t.raw_ocr_text}</pre>
              ) : (
                <span className={s.redup}>Nggak ada teks yang kebaca sama sekali.</span>
              )}
            </div>
          </>
        )}

        {terpecah && (
          <>
            <h2 className={s.subheader}>Rincian</h2>
            <div className={s.blok}>
              {[t, ...bagian].map((b) => (
                <div key={b.id} className={s.baris}>
                  <span className={s.barisTeks}>
                    <span className={s.barisJudul}>{b.description ?? namaKategori(kategori, b.category, b.type)}</span>
                    <span className={s.redup}>
                      {namaKelompok(b)} · {namaKategori(kategori, b.category, b.type)}
                    </span>
                  </span>
                  <span className={s.nominal}>{fmtIDR(Number(b.amount))}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {!draft && <EditTransactionForm tx={t} ikutan={ikutan} terpecah={terpecah} />}
        {!draft && t.type === "expense" && <PecahTransaksi tx={t} bagian={bagian} />}
        {!draft && t.type === "expense" && <BayarDariTujuan tx={t} total={total} />}
      </div>
    </>
  );
}
