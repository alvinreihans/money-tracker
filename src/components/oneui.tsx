"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { Check, ChevronDown, ChevronLeft, ChevronUp, CircleCheck, CircleX, EllipsisVertical, Info, TriangleAlert } from "lucide-react";
import s from "@/components/ui.module.css";

/**
 * Komponen dasar One UI. Samsung tidak merilis pustaka web untuk One UI,
 * jadi ini dibangun sendiri mengikuti panduannya
 * (https://developer.samsung.com/one-ui).
 */

/**
 * App bar extended ala One UI 8 (Voice Recorder, Telepon): judul besar di area
 * tampilan, lalu satu baris aksi tepat di bawahnya — dekat isi, dalam
 * jangkauan jempol. Baris itu sticky: saat di-scroll ia menempel di atas, dan
 * kedua grup tombolnya berubah jadi kapsul transparan yang melayang di atas
 * konten, dengan judul kecil di kapsul kiri.
 */
export function AppBar({
  judul,
  sub,
  judulKecil,
  kembali,
  aksiKiri,
  aksi,
  ikon,
}: {
  judul: React.ReactNode;
  sub?: React.ReactNode;
  /** Visual di atas judul besar, mis. ikon kategori di halaman detail. */
  ikon?: React.ReactNode;
  /** Judul di kapsul kiri setelah menempel; bawaannya sama dengan `judul`. */
  judulKecil?: React.ReactNode;
  kembali?: string;
  /** Tombol di kiri baris aksi, mis. ☰ panel filter. */
  aksiKiri?: React.ReactNode;
  /** Tombol di kanan baris aksi, mis. ⋮ atau hapus. */
  aksi?: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [ciut, setCiut] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Judul besar sudah lewat = baris aksi sedang menempel di atas.
    const io = new IntersectionObserver(([e]) => setCiut(!e.isIntersecting), {
      rootMargin: "-8px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <header ref={ref} className={s.viewing}>
        {ikon}
        <h1 className={s.judulBesar}>{judul}</h1>
        {sub && <p className={s.judulSub}>{sub}</p>}
      </header>
      <div className={s.barAksi} data-ciut={ciut}>
        <div className={s.grupAksi}>
          {kembali && (
            <NextLink href={kembali} className={s.ikonTombol} aria-label="Kembali">
              <ChevronLeft size={24} />
            </NextLink>
          )}
          {aksiKiri}
          <span className={s.barJudulKecil} aria-hidden={!ciut}>
            {judulKecil ?? judul}
          </span>
        </div>
        <div className={s.grupAksi}>{aksi}</div>
      </div>
    </>
  );
}

/**
 * Tombol kembali ke atas ala My Files Samsung: muncul begitu halaman digulir
 * cukup jauh, lalu memudar sendiri setelah sebentar diam — tidak menutupi
 * daftar terus-menerus.
 */
export function KembaliKeAtas() {
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    let jeda: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(jeda);
      if (window.scrollY < 600) return setTampil(false);
      setTampil(true);
      jeda = setTimeout(() => setTampil(false), 1500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(jeda);
    };
  }, []);

  return (
    <button
      type="button"
      className={s.keAtas}
      data-tampil={tampil}
      aria-label="Kembali ke atas"
      tabIndex={tampil ? 0 : -1}
      onClick={() => {
        const pelan = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: pelan ? "smooth" : "auto" });
        setTampil(false);
      }}
    >
      <ChevronUp size={24} />
    </button>
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
  pil,
  onClose,
  children,
}: {
  judul?: React.ReactNode;
  sub?: React.ReactNode;
  posisi?: "bawah" | "tengah" | "penuh";
  /** Isi berupa daftar baris: tanpa padding samping. */
  daftar?: boolean;
  tombol?: React.ReactNode;
  /**
   * Tombol sebagai kapsul melayang di tengah bawah ("Batal | Simpan"), pola
   * form Kontak Samsung. Untuk form halaman penuh, sebagai ganti `tombol`.
   */
  pil?: { label: React.ReactNode; onClick: () => void; disabled?: boolean }[];
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

  const kelas = [
    s.dialog,
    posisi === "tengah" && s.dialogTengah,
    posisi === "penuh" && s.dialogPenuh,
  ]
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
      {posisi === "penuh" ? (
        // Halaman penuh: tombol kembali lalu judul dalam satu baris, seperti
        // "‹ Add boarding passes" di Samsung Wallet.
        <div className={s.dialogKepala}>
          <button type="button" className={s.ikonTombol} aria-label="Kembali" onClick={onClose}>
            <ChevronLeft size={26} />
          </button>
          {judul && <h2 className={s.dialogJudul}>{judul}</h2>}
        </div>
      ) : (
        judul && <h2 className={s.dialogJudul}>{judul}</h2>
      )}
      {sub && <p className={s.dialogSub}>{sub}</p>}
      <div className={daftar ? s.dialogBadanDaftar : `${s.dialogBadan} ${pil ? s.dialogBadanPil : ""}`}>{children}</div>
      {tombol && <div className={s.dialogTombol}>{tombol}</div>}
      {pil && (
        <div className={s.pil}>
          {pil.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && <span className={s.pilPemisah} aria-hidden />}
              <button type="button" onClick={p.onClick} disabled={p.disabled}>
                {p.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
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
  const menuRef = useRef<HTMLDivElement>(null);

  // Tombolnya bisa di bawah judul besar atau di kapsul yang menempel di atas,
  // jadi menu dibuka tepat di bawah tombol. Klik berjalan sebelum popover
  // dibuka browser, jadi posisinya sudah benar saat muncul.
  function letakkan(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const m = menuRef.current;
    if (!m) return;
    m.style.top = `${r.bottom + 8}px`;
    m.style.right = `${window.innerWidth - r.right}px`;
  }

  return (
    <>
      <button type="button" className={s.ikonTombol} popoverTarget={id} aria-label="Lainnya" onClick={letakkan}>
        <EllipsisVertical size={22} />
      </button>
      <div ref={menuRef} id={id} popover="auto" className={s.popover}>
        {children}
      </div>
    </>
  );
}

/**
 * Satu baris isian ala Kontak Samsung: ikon di kiri, isian bergaris bawah,
 * label kecil di atasnya yang muncul begitu ada isi. Isian kosong menampilkan
 * nama field sebagai placeholder, jadi `placeholder` sebaiknya diisi sama
 * dengan `label`. Label membungkus isian, jadi keduanya otomatis terhubung.
 */
export function Field({
  label,
  ikon: Ikon,
  kanan,
  keterangan,
  galat,
  children,
}: {
  label: string;
  ikon?: React.ElementType;
  /** Di ujung kanan isian: chevron pilihan, tombol intip, dll. */
  kanan?: React.ReactNode;
  keterangan?: React.ReactNode;
  galat?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className={`${s.fieldBaris} ${galat ? s.fieldGalat : ""}`}>
      {Ikon && (
        <span className={s.fieldIkon} aria-hidden>
          <Ikon size={22} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className={s.fieldKolom}>
          <span className={s.fieldLabel}>{label}</span>
          {children}
          {kanan && <span className={s.fieldKanan}>{kanan}</span>}
        </span>
        {(galat || keterangan) && (
          <span className={s.fieldBawah} style={{ display: "block" }}>
            {galat ? (
              <span className={s.galat} role="alert">
                {galat}
              </span>
            ) : (
              <span className={s.keterangan}>{keterangan}</span>
            )}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * Isian pilihan ala One UI: baris isian yang membuka daftar pilihan di
 * dialog bawah ("Choice and confirmation dialogs appear at the bottom of the
 * screen"). Pengganti <select> bawaan, yang daftarnya tampil beda-beda di
 * tiap browser dan tidak bisa diberi ikon.
 */
export function Pilih<T extends string>({
  label,
  ikon,
  nilai,
  pilihan,
  onChange,
}: {
  label: string;
  ikon?: React.ElementType;
  nilai: T;
  pilihan: { id: T; label: string; ikon?: React.ElementType; warna?: string }[];
  onChange: (id: T) => void;
}) {
  const [buka, setBuka] = useState(false);

  return (
    <>
      <Field label={label} ikon={ikon} kanan={<ChevronDown size={22} />}>
        <button type="button" aria-haspopup="dialog" onClick={() => setBuka(true)}>
          {pilihan.find((p) => p.id === nilai)?.label ?? <span style={{ color: "var(--teks-2)" }}>Pilih {label.toLowerCase()}</span>}
        </button>
      </Field>

      {buka && (
        <Lembar judul={label} daftar onClose={() => setBuka(false)}>
          <div role="radiogroup" aria-label={label}>
            {pilihan.map(({ id, label: teks, ikon: Ikon, warna = "var(--teks-2)" }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === nilai}
                data-autofocus={id === nilai || undefined}
                className={s.baris}
                onClick={() => {
                  onChange(id);
                  setBuka(false);
                }}
              >
                {Ikon && (
                  <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
                    <Ikon size={20} />
                  </span>
                )}
                <span className={s.barisTeks}>
                  <span className={`${s.barisJudul} ${id === nilai ? s.pilihAktif : ""}`}>{teks}</span>
                </span>
                {id === nilai && <Check size={22} color="var(--primer)" aria-hidden />}
              </button>
            ))}
          </div>
        </Lembar>
      )}
    </>
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
