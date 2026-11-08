import { gabungNama, rapikanNama } from "@/lib/arah";
import type { HasilBaca } from "@/lib/rekening/jenis";

/**
 * Nama user di rekening/dompetnya (user_metadata.nama_rekening): dibaca dari Auth,
 * diisi jawaban "kirim atau terima?" (SPEC-catat-tuntas) dan nama pemilik rekening
 * koran (SPEC-kantong-sendiri B-1). Fungsi murni — diuji di scripts/uji-pindah.mts.
 */

/** nama_rekening dari user_metadata (daftar nama user di rekening/dompetnya). */
export function namaDariMetadata(meta: Record<string, unknown> | undefined): string[] {
  const n = meta?.nama_rekening;
  return Array.isArray(n) ? n.filter((x): x is string => typeof x === "string") : [];
}

/** Nama pemilik yang tersamar ("BUDX SAXXXXX", "REI***") tidak disimpan (B-1). */
export const namaTersamar = (nama: string) => /\*|X{2,}/.test(nama);

/**
 * Nama pemilik dari rekening koran → nama_rekening user (SPEC-kantong-sendiri B-1):
 * digabung (gabungNama, maks 5), yang tersamar dilewati. Null bila tidak ada yang baru.
 */
export function namaRekeningBaru(lama: string[], bacaan: HasilBaca[]): string[] | null {
  const baru = [...new Set(bacaan.map((h) => h.pemilik?.trim()).filter((n): n is string => Boolean(n) && !namaTersamar(n!)))].map((n) => rapikanNama(n)!);
  const hasil = gabungNama(lama, baru);
  return hasil.length === lama.length && hasil.every((n, i) => n === lama[i]) ? null : hasil;
}
