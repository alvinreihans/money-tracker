/**
 * Tanda pengenal aplikasi: struk bertepi sobek, dalam Liquid Lava.
 *
 * Dipakai di halaman-halaman yang berdiri sendiri (masuk, password baru) yang
 * kalau tidak, cuma tampil sebagai kotak form tanpa identitas — orang tidak
 * tahu sedang masuk ke aplikasi apa.
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
      <span
        className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)]"
        style={{ background: "var(--primary)" }}
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 3h14v16.5l-2.3-1.4-2.3 1.4-2.4-1.4-2.3 1.4-2.4-1.4L5 19.5Z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
        </svg>
      </span>

      <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">
        {judul}
      </h1>
      {subjudul && (
        <p className="mt-1 text-sm text-muted-foreground">{subjudul}</p>
      )}
    </div>
  );
}
