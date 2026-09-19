/**
 * Syarat password untuk akun baru dan penggantian password.
 *
 * Sengaja TIDAK dipakai saat masuk: akun yang dibuat sebelum aturan ini ada
 * tetap harus bisa login. Memaksakan aturan baru di halaman masuk cuma
 * mengunci orang dari akunnya sendiri tanpa memberi jalan keluar.
 */

export interface Syarat {
  id: string;
  label: string;
  penuhi: (pw: string) => boolean;
}

export const SYARAT: Syarat[] = [
  { id: "panjang", label: "Minimal 8 karakter", penuhi: (p) => p.length >= 8 },
  { id: "besar", label: "Ada huruf besar", penuhi: (p) => /[A-Z]/.test(p) },
  { id: "kecil", label: "Ada huruf kecil", penuhi: (p) => /[a-z]/.test(p) },
  { id: "angka", label: "Ada angka", penuhi: (p) => /\d/.test(p) },
  {
    id: "simbol",
    label: "Ada simbol (!, @, #, dst.)",
    // Apa pun di luar huruf dan angka dihitung simbol — termasuk spasi dan
    // karakter non-Latin, biar frasa sandi tidak ikut tertolak.
    penuhi: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

export function cekPassword(pw: string) {
  return SYARAT.map((s) => ({ ...s, ok: s.penuhi(pw) }));
}

export function passwordValid(pw: string): boolean {
  return SYARAT.every((s) => s.penuhi(pw));
}
