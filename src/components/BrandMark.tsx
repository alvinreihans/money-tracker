import Image from "next/image";
import { Heading } from "@primer/react";
import s from "@/components/ui.module.css";

/**
 * Logo dan judul halaman yang berdiri sendiri (masuk, password baru), seperti
 * halaman masuk GitHub. Tanpa ini, halaman cuma tampil sebagai kotak form
 * tanpa identitas — orang tidak tahu sedang masuk ke aplikasi apa.
 */
export default function BrandMark({ judul }: { judul: string }) {
  return (
    <div className={s.tengah} style={{ marginBottom: "var(--base-size-16)" }}>
      {/* Logo di layar pertama; menundanya cuma bikin halaman berkedip. */}
      <Image src="/logo.png" alt="" width={48} height={48} priority />
      <Heading as="h1" variant="medium" style={{ marginTop: "var(--base-size-16)" }}>
        {judul}
      </Heading>
    </div>
  );
}
