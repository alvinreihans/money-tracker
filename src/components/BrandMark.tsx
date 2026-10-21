import Image from "next/image";
import { Box } from "@/components/ui";

/**
 * Tanda pengenal aplikasi.
 *
 * Dipakai di halaman-halaman yang berdiri sendiri (masuk, password baru) yang
 * kalau tidak, cuma tampil sebagai kotak form tanpa identitas — orang tidak
 * tahu sedang masuk ke aplikasi apa.
 */
export default function BrandMark({ subjudul }: { subjudul?: string }) {
  return (
    <Box textAlign="center" padding={{ top: "xxl" }}>
      {/* Logo di layar pertama; menundanya cuma bikin halaman berkedip. */}
      <Image src="/logo.png" alt="" width={72} height={72} priority />
      <Box variant="h1" padding={{ top: "xs" }}>
        Money Tracker
      </Box>
      {subjudul && <Box color="text-body-secondary">{subjudul}</Box>}
    </Box>
  );
}
