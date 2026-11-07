/**
 * Tombol/gestur kembali menutup lembar paling atas dulu (SPEC-perbaikan-uiux
 * #12, SPEC-navigasi): tiap lembar yang terbuka punya satu entri riwayat di
 * atas entri halamannya, beralamat sama.
 *
 * - Kembali ke entri yang lebih dangkal di halaman yang sama → lembar di
 *   atasnya diminta menutup lewat jalan tutupnya sendiri ("Buang perubahan?"
 *   tetap muncul). Lembar yang menolak tutup mendapat entrinya lagi.
 * - Next.js tidak melihat popstate antarentri halaman yang sama (listener
 *   capture di window + stopImmediatePropagation): halaman tidak dirender ulang.
 * - Lembar ditutup lewat tombol/Esc/ketuk luar: TIDAK memakai history.go —
 *   traversal membatalkan router.push yang sedang berjalan (mis. "Lihat
 *   riwayat" yang menutup lembar lalu pindah halaman). Entri sekarang diberi
 *   kedalaman baru, dan entri di bawahnya yang tidak terpakai lagi ditandai
 *   "mati": kembali/maju ke entri mati langsung dilewati, tanpa ketukan sia-sia.
 */

type Entri = { minta: () => void };
type State = Record<string, unknown>;

const KUNCI = "__lembarKe"; // deretan entri satu halaman
const DALAM = "__lembar"; // jumlah lembar terbuka di entri ini
const ID = "__lembarId";

const tumpukan: Entri[] = [];
/** Entri mati (id): sisa lembar yang sudah ditutup, dilewati saat ditraversal. */
const mati = new Set<string>();
/** Entri hidup deretan sekarang per kedalaman (indeks = kedalaman). */
let ids: string[] = [];
let kunci: string | null = null;
let terjadwal = false;
let terpasang = false;
/** Entri yang sedang aktif menurut catatan sendiri (history.state bisa sudah ditimpa sebelum popstate). */
let skr: { kunci: string | null; id: string | null; dalam: number; indeks: number } = { kunci: null, id: null, dalam: 0, indeks: 0 };
let asliPush: History["pushState"];
let asliReplace: History["replaceState"];

const acak = () => Math.random().toString(36).slice(2, 12);
const obj = (st: unknown): State | null => (st && typeof st === "object" ? (st as State) : null);
const indeks = () => (window as Window & { navigation?: { currentEntry?: { index: number } | null } }).navigation?.currentEntry?.index ?? -1;
const baca = (st: unknown) => {
  const o = obj(st);
  return {
    kunci: typeof o?.[KUNCI] === "string" ? (o[KUNCI] as string) : null,
    id: typeof o?.[ID] === "string" ? (o[ID] as string) : null,
    dalam: typeof o?.[DALAM] === "number" ? (o[DALAM] as number) : 0,
  };
};
const tulis = (st: unknown, k: string, id: string, dalam: number): State => ({ ...(obj(st) ?? {}), [KUNCI]: k, [ID]: id, [DALAM]: dalam });

function jadwal() {
  if (terjadwal) return;
  terjadwal = true;
  queueMicrotask(sinkron);
}

/** Samakan entri riwayat dengan jumlah lembar yang terbuka, tanpa traversal. */
function sinkron() {
  terjadwal = false;
  const n = tumpukan.length;
  // Entri sekarang bukan bagian deretan ini (pindah halaman): entri lembarnya mati, halamannya tetap.
  if (kunci && skr.kunci !== kunci) {
    ids.slice(1).forEach((id) => mati.add(id));
    ids = [];
    kunci = null;
  }
  if (!kunci) {
    if (n === 0) return;
    // Deretan baru: entri halaman sekarang jadi dasarnya.
    kunci = acak();
    const id = acak();
    asliReplace.call(history, tulis(history.state, kunci, id, 0), "");
    ids = [id];
    skr = { kunci, id, dalam: 0, indeks: indeks() };
  }
  if (n === skr.dalam) return;
  if (n > skr.dalam) {
    for (let d = skr.dalam + 1; d <= n; d++) {
      const id = acak();
      asliPush.call(history, tulis(history.state, kunci, id, d), "");
      ids[d] = id;
    }
    skr = { kunci, id: ids[n], dalam: n, indeks: indeks() };
  } else {
    // Lembar ditutup tanpa tombol kembali: entri ini jadi entri kedalaman n, yang di bawahnya mati.
    ids.slice(n, skr.dalam).forEach((id) => id && mati.add(id));
    asliReplace.call(history, tulis(history.state, kunci, skr.id!, n), "");
    ids = [...ids.slice(0, n), skr.id!];
    skr = { ...skr, dalam: n };
  }
}

function onPop(e: PopStateEvent) {
  const tuju = baca(e.state);
  const sebelum = skr;
  const halamanSama = sebelum.kunci !== null && tuju.kunci === sebelum.kunci;
  skr = { ...tuju, indeks: indeks() };
  if (halamanSama) e.stopImmediatePropagation();

  if (tuju.id && mati.has(tuju.id)) {
    // Entri sisa lembar yang sudah ditutup: lewati searah traversal ini.
    const maju = sebelum.indeks >= 0 && skr.indeks > sebelum.indeks;
    history.go(maju ? 1 : -1);
    return;
  }
  if (halamanSama) {
    for (const x of tumpukan.slice(tuju.dalam).reverse()) x.minta();
  }
  // Halaman sama: yang menolak tutup mendapat entrinya lagi. Halaman lain: Next.js yang memulihkannya.
  jadwal();
}

function pasang() {
  if (terpasang || typeof window === "undefined") return;
  terpasang = true;
  asliPush = history.pushState;
  asliReplace = history.replaceState;
  // router.replace/refresh Next.js menimpa state entri sekarang: penanda lembarnya dipertahankan.
  history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
    const o = obj(data);
    const ada = baca(history.state);
    const isi = o && ada.kunci && ada.id && !(KUNCI in o) ? tulis(o, ada.kunci, ada.id, ada.dalam) : data;
    asliReplace.call(history, isi, unused, url);
  };
  // Pindah halaman (router.push): entri baru di luar deretan lembar.
  history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
    asliPush.call(history, data, unused, url);
    skr = { ...baca(history.state), indeks: indeks() };
    jadwal();
  };
  skr = { ...baca(history.state), dalam: 0, indeks: indeks() };
  // Capture di window: berjalan sebelum listener popstate Next.js (non-capture) di target yang sama.
  window.addEventListener("popstate", onPop, true);
}

/**
 * Daftarkan lembar yang sedang terbuka. `minta`: tutup seperti tombol
 * kembali/× lembar itu (boleh menolak, mis. bertanya "Buang perubahan?").
 * Mengembalikan fungsi pelepas, dipanggil saat lembar ditutup.
 */
export function daftarLembar(minta: () => void): () => void {
  pasang();
  const e: Entri = { minta };
  tumpukan.push(e);
  jadwal();
  return () => {
    const i = tumpukan.indexOf(e);
    if (i >= 0) tumpukan.splice(i, 1);
    jadwal();
  };
}
