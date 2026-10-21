import Image from "next/image";
import s from "@/components/ui.module.css";

/**
 * Area tampilan halaman yang berdiri sendiri (masuk, password baru): logo dan
 * judul besar di tengah. Tanpa ini, halaman cuma tampil sebagai kotak form
 * tanpa identitas — orang tidak tahu sedang masuk ke aplikasi apa.
 */
export default function BrandMark({ judul, sub }: { judul: string; sub?: string }) {
  return (
    <header className={s.viewing}>
      {/* Logo di layar pertama; menundanya cuma bikin halaman berkedip. */}
      <Image src="/logo.png" alt="" width={64} height={64} priority />
      <h1 className={s.judulBesar}>{judul}</h1>
      {sub && <p className={s.judulSub}>{sub}</p>}
    </header>
  );
}
