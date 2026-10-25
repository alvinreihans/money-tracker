"use client";

import { createContext, Fragment, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import NextLink from "next/link";
import { Check, ChevronDown, ChevronLeft, ChevronUp, CircleCheck, CircleX, EllipsisVertical, Info, TriangleAlert, X } from "lucide-react";
import { LAYAR_LEBAR } from "@/components/navigasi";
import s from "@/components/ui.module.css";
import { angkaMentah, angkaRibuan } from "@/lib/format";

/**
 * Komponen dasar One UI. Samsung tidak merilis pustaka web untuk One UI,
 * jadi ini dibangun sendiri mengikuti panduannya
 * (https://developer.samsung.com/one-ui).
 */

/** Apakah layar sedang lebar (dua panel). Di server selalu false. */
export function useLayarLebar() {
  return useSyncExternalStore(
    (ubah) => {
      const m = window.matchMedia(LAYAR_LEBAR);
      m.addEventListener("change", ubah);
      return () => m.removeEventListener("change", ubah);
    },
    () => window.matchMedia(LAYAR_LEBAR).matches,
    () => false,
  );
}

const DiPanelDetail = createContext(false);

/**
 * Panel kanan dua panel (Riwayat, Profil). Selama ia berisi, panel daftar di
 * layar sempit disembunyikan (CSS `:empty`); `kosong` tampil sebagai petunjuk
 * di layar lebar. App bar di dalamnya tahu ia bukan judul utama halaman.
 */
export function PanelDetail({ kosong, children }: { kosong: string; children: React.ReactNode }) {
  return (
    <div className={s.panelDetail} data-kosong={kosong}>
      <DiPanelDetail.Provider value>{children}</DiPanelDetail.Provider>
    </div>
  );
}

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
  // Satu h1 per halaman: di dua panel, judul panel detail jadi h2 (judul
  // daftarnya yang h1). Di layar sempit hanya satu panel yang tampil → h1.
  const diPanel = useContext(DiPanelDetail);
  const lebar = useLayarLebar();
  const Judul = diPanel && lebar ? "h2" : "h1";

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
        <Judul className={s.judulBesar}>{judul}</Judul>
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
 *
 * Mulai 600px, lembar jadi pop-up di tengah (panduan layar lebar Samsung:
 * tugas singkat di pop-up, bukan layar penuh). `samping`: di layar lebar
 * menempel di kanan sebagai panel non-modal — halaman di sebelahnya tetap
 * bisa dilihat dan digulir (Tanya AI di samping grafik Analitik).
 *
 * `isian`: nilai form di dalamnya. Kalau sudah diubah sejak lembar dibuka,
 * menutup lewat jalan mana pun (kembali/×, Esc, ketuk di luar, Batal)
 * bertanya dulu "Buang perubahan?" — ketikan tidak hilang tanpa sengaja.
 */
export function Lembar({
  judul,
  sub,
  posisi = "bawah",
  daftar = false,
  tombol,
  pil,
  label,
  isian,
  onClose,
  children,
}: {
  judul?: React.ReactNode;
  /** Nama dialog untuk pembaca layar, bila judulnya tidak ditampilkan. */
  label?: string;
  sub?: React.ReactNode;
  posisi?: "bawah" | "tengah" | "penuh" | "samping";
  /** Isi berupa daftar baris: tanpa padding samping. */
  daftar?: boolean;
  tombol?: React.ReactNode;
  /**
   * Tombol sebagai kapsul melayang di tengah bawah ("Batal | Simpan"), pola
   * form Kontak Samsung. Untuk form halaman penuh, sebagai ganti `tombol`.
   */
  pil?: ({ label: React.ReactNode; disabled?: boolean } & ({ onClick: () => void } | { batal: true }))[];
  /** Nilai form; dibandingkan dengan nilainya saat lembar dibuka. */
  isian?: unknown;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const isianAwal = useRef(JSON.stringify(isian));
  const berubah = isian !== undefined && JSON.stringify(isian) !== isianAwal.current;
  const [tanyaBuang, setTanyaBuang] = useState(false);
  const cobaTutup = () => (berubah ? setTanyaBuang(true) : onClose());
  const tutup = useRef(cobaTutup);
  useEffect(() => {
    tutup.current = cobaTutup;
  });

  // useLayoutEffect, bukan useEffect: berjalan masih di dalam ketukan yang
  // membuka dialog. Browser HP hanya memunculkan keyboard untuk fokus yang
  // terjadi selama aksi user, jadi kolom bertanda data-autofocus langsung
  // siap diketik tanpa perlu diketuk lagi.
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    // Panel samping: non-modal di layar lebar, modal di bawahnya. Saat lebar
    // berubah (Fold dibuka/dilipat, jendela diubah), dialog cukup dibuka ulang
    // dengan mode lain — isinya tidak dipasang ulang, ketikan tidak hilang.
    const lebar = posisi === "samping" ? window.matchMedia(LAYAR_LEBAR) : null;
    const buka = () => {
      const fokus = document.activeElement;
      if (d.open) d.close();
      if (lebar?.matches) d.show();
      else d.showModal();
      if (fokus instanceof HTMLElement && d.contains(fokus)) fokus.focus();
    };
    buka();
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const batal = (e: Event) => {
      e.preventDefault(); // biar React yang melepas dialognya, bukan browser
      tutup.current();
    };
    // Dialog non-modal tidak ditutup Esc oleh browser.
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !d.matches(":modal") && tutup.current();
    d.addEventListener("cancel", batal);
    d.addEventListener("keydown", esc);
    lebar?.addEventListener("change", buka);
    return () => {
      d.removeEventListener("cancel", batal);
      d.removeEventListener("keydown", esc);
      lebar?.removeEventListener("change", buka);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kelas = [
    s.dialog,
    posisi === "tengah" && s.dialogTengah,
    (posisi === "penuh" || posisi === "samping") && s.dialogPenuh,
    posisi === "samping" && s.dialogSamping,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={ref}
      className={kelas}
      aria-label={label ?? (typeof judul === "string" ? judul : undefined)}
      // Ketuk di luar kotak (area backdrop) menutup dialog.
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.matches(":modal") && cobaTutup()}
    >
      {posisi === "penuh" || posisi === "samping" ? (
        // Halaman penuh: tombol kembali lalu judul dalam satu baris, seperti
        // "‹ Add boarding passes" di Samsung Wallet. Begitu jadi pop-up atau
        // panel samping (layar lebar), ia tidak lagi "halaman": tombolnya ×.
        <div className={s.dialogKepala}>
          <button type="button" className={s.ikonTombol} aria-label={posisi === "samping" ? "Tutup" : "Kembali"} onClick={cobaTutup}>
            <ChevronLeft size={26} className={s.hanyaSempit} />
            <X size={24} className={s.hanyaLebar} />
          </button>
          {judul && <h2 className={s.dialogJudul}>{judul}</h2>}
        </div>
      ) : (
        judul && <h2 className={s.dialogJudul}>{judul}</h2>
      )}
      {sub && <p className={s.dialogSub}>{sub}</p>}
      <div className={`${daftar ? s.dialogBadanDaftar : s.dialogBadan} ${pil ? s.dialogBadanPil : ""}`}>{children}</div>
      {tombol && <div className={s.dialogTombol}>{tombol}</div>}
      {pil && (
        <div className={s.pil}>
          {pil.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && <span className={s.pilPemisah} aria-hidden />}
              <button type="button" onClick={"batal" in p ? cobaTutup : p.onClick} disabled={p.disabled}>
                {p.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
      {tanyaBuang && (
        <Konfirmasi tanya="Buang perubahan?" ya="Buang" onBatal={() => setTanyaBuang(false)} onYa={onClose}>
          Yang sudah diisi di sini belum disimpan.
        </Konfirmasi>
      )}
    </dialog>
  );
}

/**
 * Konfirmasi ala One UI (seperti "Move 1 file to the Trash?" di My Files):
 * dialog di bawah layar berisi pertanyaan, lalu "Batal | <aksi>" berupa tombol
 * flat yang dipisah garis tegak. Panduan: dialog pilihan & konfirmasi di bawah
 * layar, berbentuk pertanyaan, tombol flat.
 */
export function Konfirmasi({
  tanya,
  ya,
  loading = false,
  error,
  onBatal,
  onYa,
  children,
}: {
  tanya: string;
  /** Label tombol aksi, kata kerja yang jelas ("Hapus"), bukan "Ya". */
  ya: string;
  loading?: boolean;
  error?: string | null;
  onBatal: () => void;
  onYa: () => void;
  /** Akibatnya, kalau perlu dijelaskan. */
  children?: React.ReactNode;
}) {
  return (
    <Lembar
      label={tanya}
      onClose={() => !loading && onBatal()}
      tombol={
        <>
          <button type="button" className={`${s.flat} ${s.flatNetral}`} disabled={loading} onClick={onBatal}>
            Batal
          </button>
          <span className={s.pilPemisah} aria-hidden />
          <button type="button" className={`${s.flat} ${s.flatNetral}`} disabled={loading} onClick={onYa}>
            {loading ? <Spinner /> : ya}
          </button>
        </>
      }
    >
      <p className={s.konfirmasiTanya}>{tanya}</p>
      {children && <p className={s.konfirmasiKet}>{children}</p>}
      {error && (
        <div style={{ marginTop: 12 }}>
          <Pesan jenis="bahaya">{error}</Pesan>
        </div>
      )}
    </Lembar>
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
 * Galat validasi form. `kolom`: isian yang salah — pesannya tampil di bawah
 * isian itu (Field dengan `kolom` yang sama). Tanpa `kolom`: galat umum
 * (jaringan, server), tampil di bawah form.
 */
export type Galat = { pesan: string; kolom?: string } | null;
const GalatContext = createContext<Galat>(null);
/** Bungkus isian form: tiap Field ber-`kolom` mengambil galatnya dari sini. */
export const GalatForm = GalatContext.Provider;

/** Setelah simpan gagal: fokus (dan gulir) ke isian yang salah, di dialog teratas. */
export function fokusGalat(g: Galat) {
  if (!g?.kolom) return;
  requestAnimationFrame(() => {
    const akar = [...document.querySelectorAll("dialog[open]")].at(-1) ?? document;
    const el = akar.querySelector<HTMLElement>(`[data-kolom="${g.kolom}"] :is(input, textarea, select, button)`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center" });
  });
}

/**
 * Status galat satu form: `gagal(pesan, kolom?)` menampilkan pesannya (di
 * bawah isian `kolom`, atau di bawah form) dan memfokus isian itu. `nilai`:
 * isian form dengan kunci = nama kolom; begitu nilai kolom yang salah
 * berubah, galatnya hilang.
 */
export function useGalat(nilai?: object | null) {
  const [galat, setGalat] = useState<Galat>(null);
  const sebelum = useRef(nilai);
  useEffect(() => {
    const lama = sebelum.current;
    sebelum.current = nilai;
    const k = galat?.kolom;
    if (k && lama && nilai && !Object.is((lama as Record<string, unknown>)[k], (nilai as Record<string, unknown>)[k])) setGalat(null);
  });
  return {
    galat,
    gagal: (pesan: string, kolom?: string) => {
      const g = { pesan, kolom };
      setGalat(g);
      fokusGalat(g);
    },
    bersihkan: () => setGalat(null),
  };
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
  kolom,
  children,
}: {
  label: string;
  ikon?: React.ElementType;
  /** Di ujung kanan isian: chevron pilihan, tombol intip, dll. */
  kanan?: React.ReactNode;
  keterangan?: React.ReactNode;
  galat?: string | null;
  /** Nama isian untuk galat dari GalatForm (mis. "amount"). */
  kolom?: string;
  children: React.ReactNode;
}) {
  const dariForm = useContext(GalatContext);
  const pesan = galat ?? (kolom && dariForm?.kolom === kolom ? dariForm.pesan : null);
  const idBawah = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Isiannya bisa <input>, InputNominal, atau tombol Pilih: penanda galat
  // dipasang langsung ke elemennya. Keterangan & galat ada di luar <label>,
  // jadi dibacakan sebagai keterangan isian, bukan bagian namanya.
  useEffect(() => {
    const isian = ref.current?.querySelector(":is(input, textarea, select, button)");
    if (!isian) return;
    if (pesan || keterangan) isian.setAttribute("aria-describedby", idBawah);
    else isian.removeAttribute("aria-describedby");
    if (pesan) isian.setAttribute("aria-invalid", "true");
    else isian.removeAttribute("aria-invalid");
  });

  return (
    <div ref={ref} className={`${s.fieldBaris} ${pesan ? s.fieldGalat : ""}`} data-kolom={kolom}>
      {Ikon && (
        <span className={s.fieldIkon} aria-hidden>
          <Ikon size={22} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <label className={s.fieldKolom}>
          <span className={s.fieldLabel}>{label}</span>
          {children}
          {kanan && <span className={s.fieldKanan}>{kanan}</span>}
        </label>
        {(pesan || keterangan) && (
          <span id={idBawah} className={s.fieldBawah} style={{ display: "block" }}>
            {/* Galat di atas keterangannya; keterangan tetap tampil karena
                sering justru menjelaskan cara membetulkannya (syarat password). */}
            {pesan && (
              <span className={s.galat} role="alert" style={{ display: "block" }}>
                {pesan}
              </span>
            )}
            {keterangan && (
              <span className={s.keterangan} style={{ display: "block" }}>
                {keterangan}
              </span>
            )}
          </span>
        )}
      </span>
    </div>
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
  kosong,
  kolom,
  onChange,
}: {
  label: string;
  ikon?: React.ElementType;
  /** Lihat Field. */
  kolom?: string;
  nilai: T;
  /** Teks saat belum ada yang dipilih; bawaannya "Pilih <label>". */
  kosong?: string;
  pilihan: { id: T; label: string; ikon?: React.ElementType; warna?: string; emoji?: string }[];
  onChange: (id: T) => void;
}) {
  const [buka, setBuka] = useState(false);

  return (
    <>
      <Field label={label} ikon={ikon} kolom={kolom} kanan={<ChevronDown size={22} />}>
        <button type="button" aria-haspopup="dialog" onClick={() => setBuka(true)}>
          {pilihan.find((p) => p.id === nilai)?.label ?? <span style={{ color: "var(--teks-2)" }}>{kosong ?? `Pilih ${label.toLowerCase()}`}</span>}
        </button>
      </Field>

      {buka && (
        <Lembar judul={label} daftar onClose={() => setBuka(false)}>
          <div role="radiogroup" aria-label={label}>
            {pilihan.map(({ id, label: teks, ikon: Ikon, warna = "var(--teks-2)", emoji }) => (
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
                {emoji ? (
                  <span className={s.barisEmoji} aria-hidden>
                    {emoji}
                  </span>
                ) : (
                  Ikon && (
                    <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
                      <Ikon size={20} />
                    </span>
                  )
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

/**
 * Isian nominal rupiah dengan pemisah ribuan saat diketik ("1.500.000").
 * `value`/`onChange` memakai angka mentah ("1500000"), jadi validasi dan
 * penyimpanan tidak berubah. Posisi kursor dijaga saat titik ditambah/dibuang.
 */
export function InputNominal({
  value,
  onChange,
  bolehMinus = false,
  ...lain
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (mentah: string) => void;
  bolehMinus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      {...lain}
      ref={ref}
      type="text"
      // Keyboard angka di HP; minus (saldo awal paylater) butuh keyboard biasa.
      inputMode={bolehMinus ? "text" : "numeric"}
      autoComplete="off"
      value={angkaRibuan(value)}
      onChange={(e) => {
        const el = e.target;
        const digitSebelumKursor = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
        const mentah = angkaMentah(el.value, bolehMinus);
        onChange(mentah);
        // Setelah diformat ulang, taruh kursor sesudah digit yang sama.
        requestAnimationFrame(() => {
          const teks = angkaRibuan(mentah);
          let pos = teks.startsWith("-") ? 1 : 0;
          for (let n = 0; pos < teks.length && n < digitSebelumKursor; pos++) if (/\d/.test(teks[pos])) n++;
          ref.current?.setSelectionRange(pos, pos);
        });
      }}
    />
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

/** Baris pilihan (lembar filter, metode budget): bulatan centang di kanan, pola daftar pilihan One UI. */
export function BarisPilih({
  dipilih,
  peran,
  onClick,
  children,
}: {
  dipilih: boolean;
  peran: "checkbox" | "radio";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" role={peran} aria-checked={dipilih} className={`${s.baris} ${s.tekan} ${s.barisPilih}`} onClick={onClick}>
      {children}
      <span className={s.centang} data-aktif={dipilih} aria-hidden>
        {dipilih && <Check size={16} strokeWidth={3} />}
      </span>
    </button>
  );
}
