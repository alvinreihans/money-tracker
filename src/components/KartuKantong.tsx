import NextLink from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import s from "@/components/ui.module.css";
import { fmtIDR } from "@/lib/format";
import { emojiKantong, type Kantong } from "@/lib/kantong";

/** Total aset dan saldo per kantong, ala kartu "My wallet" di Samsung Wallet. */
export default function KartuKantong({ data }: { data: (Pick<Kantong, "id" | "name" | "kind" | "emoji"> & { saldo: number })[] }) {
  if (data.length === 0) {
    return (
      <NextLink href="/profil/kantong" className={`${s.blok} ${s.baris} ${s.tekan}`}>
        <span className={s.barisIkon} style={{ background: "color-mix(in srgb, #bf7af0 18%, transparent)", color: "#bf7af0" }} aria-hidden>
          <Wallet size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>Tambah kantong</span>
          <span className={s.redup}>Rekening, e-wallet, tunai — biar saldonya kelihatan.</span>
        </span>
        <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
      </NextLink>
    );
  }

  const total = data.reduce((t, k) => t + k.saldo, 0);
  return (
    <section className={s.blok}>
      <div className={s.blokIsi} style={{ paddingBottom: 4 }}>
        <h2 className={s.blokJudul}>Total aset</h2>
        <div className={`${s.nominal} ${total < 0 ? s.bahaya : ""}`} style={{ fontSize: 28, marginTop: 8 }}>
          {fmtIDR(total)}
        </div>
      </div>

      {data.map((k) => {
        return (
          <div key={k.id} className={s.baris}>
            <span className={s.barisEmoji} aria-hidden>
              {emojiKantong(k)}
            </span>
            <span className={s.barisTeks}>
              <span className={s.barisJudul}>{k.name}</span>
            </span>
            <span className={`${s.nominal} ${k.saldo < 0 ? s.bahaya : ""}`}>{fmtIDR(k.saldo)}</span>
          </div>
        );
      })}

      <NextLink href="/profil/kantong" className={s.blokKaki}>
        Atur kantong
      </NextLink>
    </section>
  );
}
