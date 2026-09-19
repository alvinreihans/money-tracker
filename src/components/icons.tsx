/**
 * Set ikon aplikasi.
 *
 * Ditaruh dalam satu berkas supaya ukuran dan ketebalan garisnya seragam.
 * Ikon yang dibikin satu-satu di tiap komponen pasti melenceng — 20px di sini,
 * 24px di sana, garis 1,5 bercampur 2 — dan hasilnya terasa tidak rapi tanpa
 * orang bisa menunjuk penyebabnya.
 *
 * Semuanya `aria-hidden`: ikon-ikon ini selalu berdampingan dengan teks yang
 * terlihat, jadi membacakannya lagi ke pembaca layar cuma mengulang.
 */

interface Props {
  /** 16 untuk ikon dalam tombol, 22 untuk navigasi. */
  size?: number;
}

function Svg({ size = 16, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export const IconHapus = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Svg>
);

export const IconEdit = (p: Props) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M15 6l3 3" />
  </Svg>
);

export const IconSimpan = (p: Props) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const IconBatal = (p: Props) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconTambah = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMasuk = (p: Props) => (
  <Svg {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 16l4-4-4-4" />
    <path d="M14 12H3" />
  </Svg>
);

export const IconKeluar = (p: Props) => (
  <Svg {...p}>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <path d="M17 16l4-4-4-4" />
    <path d="M21 12H10" />
  </Svg>
);

export const IconDaftar = (p: Props) => (
  <Svg {...p}>
    <path d="M15 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <circle cx="8.5" cy="7" r="3.5" />
    <path d="M19 8v6M22 11h-6" />
  </Svg>
);

export const IconSurat = (p: Props) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="m3 7 9 6 9-6" />
  </Svg>
);

export const IconUnggah = (p: Props) => (
  <Svg {...p}>
    <path d="M12 16V4" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Svg>
);

export const IconProses = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 9 9" />
    <path d="M12 3a9 9 0 0 1 9 9" strokeDasharray="2 3" />
    <path d="m10 9 5 3-5 3V9Z" />
  </Svg>
);

export const IconKamera = (p: Props) => (
  <Svg {...p}>
    <path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.2-2h7.6L17 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const IconGaleri = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m4 17 4.5-4.5 3 3L15 12l5 5" />
  </Svg>
);
