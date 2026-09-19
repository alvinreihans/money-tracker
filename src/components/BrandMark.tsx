import Image from "next/image";

/**
 * Tanda pengenal aplikasi.
 *
 * Dipakai di halaman-halaman yang berdiri sendiri (masuk, password baru) yang
 * kalau tidak, cuma tampil sebagai kotak form tanpa identitas — orang tidak
 * tahu sedang masuk ke aplikasi apa.
 *
 * Logonya berlatar transparan dan sudah punya bobot visual sendiri, jadi tidak
 * dibungkus kotak berwarna: menumpuk bentuk di atas bentuk cuma bikin ramai.
 */
export default function BrandMark({
  judul = "Money Tracker",
  subjudul,
}: {
  judul?: string;
  subjudul?: string;
}) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <Image
        src="/logo.png"
        alt=""
        width={80}
        height={80}
        // Logo di layar pertama; menundanya cuma bikin halaman berkedip.
        priority
        className="h-20 w-20"
      />

      <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">
        {judul}
      </h1>
      {subjudul && (
        <p className="mt-1 text-sm text-muted-foreground">{subjudul}</p>
      )}
    </div>
  );
}
