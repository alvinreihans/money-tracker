import s from "@/components/ui.module.css";

/**
 * Area tampilan halaman yang berdiri sendiri (masuk, password baru): logo dan
 * judul besar di tengah. Tanpa ini, halaman cuma tampil sebagai kotak form
 * tanpa identitas — orang tidak tahu sedang masuk ke aplikasi apa.
 *
 * Alamat logonya membawa nomor versi: begitu versi naik, browser mengambil
 * berkas baru, bukan logo lama dari cache. Tidak lewat next/image karena
 * hasil optimasinya disimpan per alamat dan ikut menahan logo lama.
 */
export default function BrandMark({ judul, sub }: { judul: string; sub?: string }) {
  return (
    <header className={s.viewing}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/logo.png?v=${process.env.NEXT_PUBLIC_VERSI}`} alt="" width={64} height={64} />
      <h1 className={s.judulBesar}>{judul}</h1>
      {sub && <p className={s.judulSub}>{sub}</p>}
    </header>
  );
}
