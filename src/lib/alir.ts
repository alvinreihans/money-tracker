/**
 * Aliran jawaban Tanya AI (SPEC-asisten-agen §5): /api/tanya mengirim NDJSON
 * (satu objek JSON per baris) bila browser meminta `Accept:
 * application/x-ndjson`. Tanpa header itu, balasannya JSON biasa seperti dulu
 * (skrip eval & tiruan e2e lama tetap jalan). Fungsi murni — diuji di
 * scripts/uji-agen.mts.
 *
 * Urutan peristiwa: nol atau lebih `langkah`, lalu tepat satu `jawaban` atau `galat`.
 */
export const TIPE_ALIR = "application/x-ndjson";

export type PeristiwaAlir<J = unknown> = { t: "langkah"; teks: string } | { t: "jawaban"; isi: J } | { t: "galat"; error: string };

export const barisAlir = (p: PeristiwaAlir) => `${JSON.stringify(p)}\n`;

/**
 * Pengurai potongan aliran: potongan teks bisa memotong baris di tengah, jadi
 * sisa baris yang belum lengkap disimpan sampai potongan berikutnya. Baris
 * yang bukan JSON sah dilewati.
 */
export function pengurai<J = unknown>() {
  let sisa = "";
  const urai = (baris: string[]): PeristiwaAlir<J>[] =>
    baris.flatMap((b) => {
      if (!b.trim()) return [];
      try {
        const p = JSON.parse(b) as PeristiwaAlir<J>;
        return p && typeof p === "object" && (p.t === "langkah" || p.t === "jawaban" || p.t === "galat") ? [p] : [];
      } catch {
        return [];
      }
    });
  return {
    /** Tambah potongan; kembalikan peristiwa yang barisnya sudah lengkap. */
    tambah(potongan: string): PeristiwaAlir<J>[] {
      const semua = (sisa + potongan).split("\n");
      sisa = semua.pop() ?? "";
      return urai(semua);
    },
    /** Aliran selesai: baris terakhir tanpa ganti baris. */
    selesai(): PeristiwaAlir<J>[] {
      const akhir = sisa;
      sisa = "";
      return urai([akhir]);
    },
  };
}
