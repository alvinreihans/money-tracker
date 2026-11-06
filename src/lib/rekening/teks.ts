import type { BarisPdf, Potongan } from "@/lib/rekening/jenis";

/**
 * Potongan teks PDF → baris (y sama, urut atas → bawah per halaman, kiri →
 * kanan di dalam baris). Dipakai pembaca PDF di server dan uji.
 */
export function susunBaris(halaman: { items: { x: number; y: number; s: string }[] }[]): BarisPdf[] {
  const hasil: BarisPdf[] = [];
  halaman.forEach((h, i) => {
    const perY = new Map<number, Potongan[]>();
    for (const it of h.items) {
      if (!it.s || !it.s.trim()) continue;
      const y = Math.round(it.y);
      const daftar = perY.get(y) ?? [];
      daftar.push({ x: Math.round(it.x), s: it.s });
      perY.set(y, daftar);
    }
    for (const [y, items] of [...perY].sort((a, b) => b[0] - a[0])) {
      items.sort((a, b) => a.x - b.x);
      hasil.push({ halaman: i + 1, y, items, teks: rapikan(items.map((p) => p.s).join(" ")) });
    }
  });
  return hasil;
}

export const rapikan = (s: string) => s.replace(/\s+/g, " ").trim();

/** "1.234.567" / "1.234.567,89" / "+7.813.240,00" / "-60.000" (format Indonesia) → angka. */
export function angkaID(s: string): number {
  const t = s.replace(/\s/g, "");
  const tanda = t.startsWith("-") ? -1 : 1;
  const [bulat, desimal = "0"] = t.replace(/^[+-]/, "").split(",");
  return tanda * (Number(bulat.replace(/\./g, "")) + Number(`0.${desimal}`));
}

/** "6,143,500.00" (format AS) → angka. */
export const angkaUS = (s: string) => Number(s.replace(/,/g, ""));

/** Dibulatkan ke sen, supaya jumlah desimal tidak meleset (0.1 + 0.2). */
export const sen = (n: number) => Math.round(n * 100) / 100;

const BULAN: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agt: 8, agu: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11, nopember: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

/** Nomor bulan dari nama/singkatan Indonesia atau Inggris ("Agt", "OCT", "Mei"); null bila bukan. */
export const nomorBulan = (s: string): number | null => BULAN[s.toLowerCase()] ?? null;

const dua = (n: number) => String(n).padStart(2, "0");
export const isoTanggal = (t: number, b: number, h: number) => `${t}-${dua(b)}-${dua(h)}`;

/** "02 Sep 2026" / "04 Mei 2022" / "01 SEP 2026" → "YYYY-MM-DD"; null bila bukan tanggal. */
export function tanggalTeks(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2}) ([A-Za-z]{3,9}) (\d{4})$/);
  const b = m && nomorBulan(m[2]);
  return m && b ? isoTanggal(Number(m[3]), b, Number(m[1])) : null;
}

/** Hari terakhir bulan. */
export const akhirBulanIso = (iso: string) => {
  const [t, b] = iso.split("-").map(Number);
  return new Date(Date.UTC(t, b, 0)).toISOString().slice(0, 10);
};

/** Selisih hari antara dua tanggal ISO (b − a). */
export const selisihHari = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** 4 digit akhir dari nomor rekening/HP ("901000001234" → "1234"). */
export const empatAkhir = (nomor: string | null | undefined) => {
  const d = (nomor ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
};
