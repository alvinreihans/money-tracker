"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { ChevronLeft, CircleCheck, CircleX, EllipsisVertical, Info, TriangleAlert } from "lucide-react";
import s from "@/components/ui.module.css";

/**
 * Komponen dasar One UI. Samsung tidak merilis pustaka web untuk One UI,
 * jadi ini dibangun sendiri mengikuti panduannya
 * (https://developer.samsung.com/one-ui).
 */

/**
 * App bar extended: judul besar di tengah area tampilan (atas), lalu mengecil
 * ke bilah atas begitu di-scroll. Area tampilan sengaja tanpa tombol —
 * kontrol tempatnya di area interaksi di bawahnya, dalam jangkauan jempol.
 */
export function AppBar({
  judul,
  sub,
  judulKecil,
  kembali,
  aksi,
  ikon,
}: {
  judul: React.ReactNode;
  sub?: React.ReactNode;
  /** Visual di atas judul besar, mis. ikon kategori di halaman detail. */
  ikon?: React.ReactNode;
  /** Judul di bilah atas setelah mengecil; bawaannya sama dengan `judul`. */
  judulKecil?: React.ReactNode;
  kembali?: string;
  aksi?: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [ciut, setCiut] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Mengecil saat judul besarnya tertutup bilah atas (tinggi 56px).
    const io = new IntersectionObserver(([e]) => setCiut(!e.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div className={s.barAtas} data-ciut={ciut}>
        {kembali && (
          <NextLink href={kembali} className={s.ikonTombol} aria-label="Kembali">
            <ChevronLeft size={24} />
          </NextLink>
        )}
        <span className={s.barJudul} aria-hidden={!ciut}>
          {judulKecil ?? judul}
        </span>
        {aksi}
      </div>
      <header ref={ref} className={s.viewing}>
        {ikon}
        <h1 className={s.judulBesar}>{judul}</h1>
        {sub && <p className={s.judulSub}>{sub}</p>}
      </header>
    </>
  );
}

/**
 * Dialog. One UI menaruh dialog pilihan dan konfirmasi di bawah layar (dalam
 * jangkauan jempol), dialog informasi di tengah.
 *
 * Memakai <dialog> bawaan: fokus terkunci di dalam, Esc menutup, dan halaman
 * di belakangnya tidak bisa diklik — tanpa ditulis ulang. Dipasang hanya saat
 * dibuka; pemanggil melepasnya lewat onClose.
 */
export function Lembar({
  judul,
  sub,
  posisi = "bawah",
  daftar = false,
  tombol,
  onClose,
  children,
}: {
  judul?: React.ReactNode;
  sub?: React.ReactNode;
  posisi?: "bawah" | "tengah" | "penuh";
  /** Isi berupa daftar baris: tanpa padding samping. */
  daftar?: boolean;
  tombol?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tutup = useRef(onClose);
  useEffect(() => {
    tutup.current = onClose;
  });

  // useLayoutEffect, bukan useEffect: berjalan masih di dalam ketukan yang
  // membuka dialog. Browser HP hanya memunculkan keyboard untuk fokus yang
  // terjadi selama aksi user, jadi kolom bertanda data-autofocus langsung
  // siap diketik tanpa perlu diketuk lagi.
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    d.showModal();
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const batal = (e: Event) => {
      e.preventDefault(); // biar React yang melepas dialognya, bukan browser
      tutup.current();
    };
    d.addEventListener("cancel", batal);
    return () => d.removeEventListener("cancel", batal);
  }, []);

  const kelas = [s.dialog, posisi === "tengah" && s.dialogTengah, posisi === "penuh" && s.dialogPenuh]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={ref}
      className={kelas}
      aria-label={typeof judul === "string" ? judul : undefined}
      // Ketuk di luar kotak (area backdrop) menutup dialog.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {judul && <h2 className={s.dialogJudul}>{judul}</h2>}
      {sub && <p className={s.dialogSub}>{sub}</p>}
      <div className={daftar ? s.dialogBadanDaftar : s.dialogBadan}>{children}</div>
      {tombol && <div className={s.dialogTombol}>{tombol}</div>}
    </dialog>
  );
}

/**
 * Menu "lainnya" (⋮) di ujung kanan app bar — tempat One UI menaruh aksi dan
 * pengaturan tambahan. Memakai Popover API bawaan: buka/tutup, Esc, dan
 * ketuk di luar ditangani browser.
 */
export function MenuLainnya({ children }: { children: React.ReactNode }) {
  const id = useId();
  return (
    <>
      <button type="button" className={s.ikonTombol} popoverTarget={id} aria-label="Lainnya">
        <EllipsisVertical size={22} />
      </button>
      <div id={id} popover="auto" className={s.popover}>
        {children}
      </div>
    </>
  );
}

/** Label + isian + keterangan/galat. Label membungkus isian, jadi otomatis terhubung. */
export function Field({
  label,
  keterangan,
  galat,
  children,
}: {
  label: string;
  keterangan?: React.ReactNode;
  galat?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className={s.field}>
      <span className={s.label}>{label}</span>
      {children}
      {galat ? (
        <span className={s.galat} role="alert">
          {galat}
        </span>
      ) : (
        keterangan && <span className={s.keterangan}>{keterangan}</span>
      )}
    </label>
  );
}

export function Segmen<T extends string>({
  label,
  pilihan,
  nilai,
  onChange,
}: {
  label: string;
  pilihan: { id: T; label: string }[];
  nilai: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className={s.segmen} role="group" aria-label={label}>
      {pilihan.map((p) => (
        <button key={p.id} type="button" aria-pressed={nilai === p.id} onClick={() => onChange(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

const IKON_PESAN = { info: Info, sukses: CircleCheck, peringatan: TriangleAlert, bahaya: CircleX };
const WARNA_PESAN = { info: "var(--primer)", sukses: "var(--sukses)", peringatan: "var(--peringatan)", bahaya: "var(--bahaya)" };

/** Pesan di dalam alur halaman (bukan sekilas seperti snackbar). */
export function Pesan({
  jenis,
  judul,
  children,
  aksi,
}: {
  jenis: keyof typeof IKON_PESAN;
  judul?: string;
  children?: React.ReactNode;
  aksi?: React.ReactNode;
}) {
  const Ikon = IKON_PESAN[jenis];
  return (
    <div className={s.pesan} role={jenis === "bahaya" ? "alert" : "status"}>
      <Ikon size={20} color={WARNA_PESAN[jenis]} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        {judul && <strong>{judul}</strong>}
        {children && <span className={judul ? s.redup : undefined}>{children}</span>}
        {aksi && <div style={{ marginTop: 8 }}>{aksi}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className={s.spinner} aria-hidden />
      {label && <span className={s.redup}>{label}</span>}
    </span>
  );
}

export function Kosong({ ikon: Ikon, judul, children }: { ikon: React.ElementType; judul: string; children?: React.ReactNode }) {
  return (
    <div className={s.kosong}>
      <Ikon size={32} aria-hidden />
      <strong style={{ color: "var(--teks)" }}>{judul}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}
