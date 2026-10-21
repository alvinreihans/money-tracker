import NextLink from "next/link";
import BrandMark from "@/components/BrandMark";
import s from "@/components/ui.module.css";

/** 404 untuk alamat yang tidak ada, menggantikan halaman bawaan Next/Vercel. */
export default function NotFound() {
  return (
    <main className={s.app} style={{ paddingBottom: 32 }}>
      <BrandMark judul="Halaman nggak ada" sub="Mungkin tautannya salah ketik, atau transaksinya sudah dihapus." />
      <div className={s.isi}>
        <NextLink href="/" className={`${s.tombol} ${s.tombolPenuh}`}>
          Ke Beranda
        </NextLink>
        <p className={s.versi}>Error 404</p>
      </div>
    </main>
  );
}
