import type { SupabaseClient } from "@supabase/supabase-js";
import { bacaRekening } from "@/lib/rekening/baca";
import { GalatRekening, type HasilBaca } from "@/lib/rekening/jenis";
import { GalatPdf, teksPdf } from "@/lib/rekening/pdf";
import { rencanakan, type DepositoRencana, type IsianJadikan, type KantongRencana, type PeriodeRencana, type Pilihan, type Rencana, type TransaksiLama } from "@/lib/rekening/rencana";
import { geserHari } from "@/lib/format";

/**
 * Jalur server impor rekening koran: PDF → teks (pdfjs) → parser → rencana,
 * dengan data user dari database. Dipakai /api/rekening/pratinjau (tanpa
 * menulis apa pun) dan /api/rekening/impor (menulis lewat RPC impor_rekening).
 */

/** Batas unggah: satu permintaan serverless Vercel maksimal ±4,5 MB. */
export const MAKS_BERKAS = 10;
export const MAKS_UKURAN = 4 * 1024 * 1024;

export interface GalatBerkas {
  nama: string;
  pesan: string;
}

/** Berkas PDF dari FormData → hasil baca, atau daftar galat per berkas. */
export async function bacaBerkas(berkas: File[]): Promise<{ bacaan: HasilBaca[]; galat: GalatBerkas[] }> {
  const bacaan: HasilBaca[] = [];
  const galat: GalatBerkas[] = [];
  for (const f of berkas) {
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      if (!isPdf(data)) throw new GalatPdf("Yang bisa dibaca cuma PDF rekening koran.");
      bacaan.push(bacaRekening(await teksPdf(data)));
    } catch (e) {
      if (e instanceof GalatRekening || e instanceof GalatPdf) galat.push({ nama: f.name, pesan: e.message });
      else throw e;
    }
  }
  return { bacaan, galat };
}

/** Tanda tangan berkas PDF ("%PDF-"), bukan ekstensi nama berkasnya. */
export const isPdf = (d: Uint8Array) => d.length > 5 && d[0] === 0x25 && d[1] === 0x50 && d[2] === 0x44 && d[3] === 0x46 && d[4] === 0x2d;

const KOLOM_TX = "id, amount, type, category, merchant, description, kantong_id, kantong_tujuan_id, transaction_date, waktu, ref_bank, ref_bank_tujuan, induk_id, created_at";

/** Rencana impor untuk user yang sedang masuk (RLS membatasi ke datanya sendiri). */
export async function susunRencana(supabase: SupabaseClient, bacaan: HasilBaca[], pilihan: Pilihan): Promise<{ rencana: Rencana; kantong: KantongRencana[] }> {
  const [{ data: akun }, { data: kategori }, { data: deposito }, { data: periode }] = await Promise.all([
    supabase.from("user_accounts").select("id, name, kind, nomor_akhir, induk_id, macam_simpanan, aliases, saldo_awal, saldo_per, saldo_sejak, emoji").order("created_at"),
    supabase.from("categories").select("type, slug"),
    supabase.from("deposito").select("kantong_id, bunga_persen, tenor, satuan_tenor, pajak_persen, pajak_otomatis, perpanjangan, selesai"),
    supabase.from("deposito_periode").select("id, deposito_id, ke, mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih, bunga_diterima, dicairkan_awal, transaksi_tutup").order("ke"),
  ]);
  // Deposito yang sudah selesai tidak ikut, kecuali yang jatuh tempo terakhirnya
  // di rentang rekening koran ini (pencairannya ditautkan, SPEC-deposito-jatuh-tempo).
  const dari = bacaan.flatMap((h) => h.rekening.map((r) => r.dari)).sort()[0];
  const periodeDari = (id: string) => ((periode ?? []) as (PeriodeRencana & { deposito_id: string })[]).filter((p) => p.deposito_id === id);
  const baru = (id: string) => Boolean(dari) && periodeDari(id).some((p) => p.jatuh_tempo >= geserHari(dari, -3));
  const selesai = new Set((deposito ?? []).filter((d) => d.selesai && !baru(d.kantong_id)).map((d) => d.kantong_id as string));
  const semuaAkun = (akun ?? []) as KantongRencana[];
  const kantong = semuaAkun.filter((k) => !selesai.has(k.id));
  const daftarDeposito: DepositoRencana[] = ((deposito ?? []) as Omit<DepositoRencana, "name" | "induk_id" | "periode">[])
    .filter((d) => !selesai.has(d.kantong_id))
    .flatMap((d) => {
      const k = semuaAkun.find((x) => x.id === d.kantong_id);
      return k ? [{ ...d, name: k.name, induk_id: k.induk_id ?? null, periode: periodeDari(d.kantong_id) }] : [];
    });

  // Pengenal baris yang sudah tersimpan.
  const semuaRef = [...new Set(bacaan.flatMap((h) => h.rekening.flatMap((r) => r.baris.map((b) => b.ref))))];
  const bulan = [...new Set(bacaan.flatMap((h) => h.rekening.flatMap((r) => r.baris.map((b) => `${h.bank}:${r.nomorAkhir}:bunga:${b.tanggal.slice(0, 7)}`))))];
  const sudahAda = new Set<string>();
  for (let i = 0; i < semuaRef.length + bulan.length; i += 500) {
    const { data, error } = await supabase.rpc("ref_bank_ada", { p_ref: [...semuaRef, ...bulan].slice(i, i + 500) });
    if (error) throw new Error(`ref_bank_ada: ${error.message}`);
    for (const r of (data ?? []) as string[]) sudahAda.add(r);
  }

  // Transaksi tercatat di kantong uang sejak sehari sebelum periode paling awal
  // (pencocokan ±1 hari & saldo akhir periode), per 1.000 baris (batas PostgREST).
  const transaksi: TransaksiLama[] = [];
  if (dari) {
    for (let i = 0; ; i += 1000) {
      const { data, error } = await supabase
        .from("transactions")
        .select(KOLOM_TX)
        .eq("status", "confirmed")
        .gte("transaction_date", geserHari(dari, -1))
        .order("id")
        .range(i, i + 999);
      if (error) throw new Error(`transactions: ${error.message}`);
      transaksi.push(...((data ?? []) as TransaksiLama[]));
      if (!data || data.length < 1000) break;
    }
  }
  // Penempatan deposito SeaBank yang dulu terimpor sebagai pengeluaran (bulan
  // penempatan diimpor sebelum ada depositonya), di tanggal berapa pun.
  if (bacaan.some((h) => h.bank === "seabank")) {
    const { data, error } = await supabase
      .from("transactions")
      .select(KOLOM_TX)
      .eq("status", "confirmed")
      .eq("type", "expense")
      .eq("source", "statement")
      .eq("merchant", "Fund Placement")
      .limit(200);
    if (error) throw new Error(`penempatan deposito: ${error.message}`);
    for (const t of (data ?? []) as TransaksiLama[]) if (!transaksi.some((x) => x.id === t.id)) transaksi.push(t);
  }
  // Hasil evaluasi deposito yang mungkin bertanggal di luar rentang di atas.
  const hasilTutup = [...new Set(daftarDeposito.flatMap((d) => d.periode.flatMap((p) => p.transaksi_tutup ?? [])))].filter((id) => !transaksi.some((t) => t.id === id));
  for (let i = 0; i < hasilTutup.length; i += 200) {
    const { data, error } = await supabase.from("transactions").select(KOLOM_TX).in("id", hasilTutup.slice(i, i + 200));
    if (error) throw new Error(`hasil evaluasi deposito: ${error.message}`);
    transaksi.push(...((data ?? []) as TransaksiLama[]));
  }
  const rencana = rencanakan({ bacaan, kantong, transaksi, kategori: (kategori ?? []) as { type: string; slug: string }[], sudahAda, pilihan, deposito: daftarDeposito });
  return { rencana, kantong };
}

/** Pilihan dari FormData (JSON), dibersihkan. */
export function bacaPilihan(teks: unknown): Pilihan {
  if (typeof teks !== "string" || !teks) return {};
  try {
    const p = JSON.parse(teks) as Record<string, unknown>;
    const peta = (v: unknown) =>
      v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string").slice(0, 2000)) as Record<string, string> : undefined;
    const daftar = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : undefined);
    // Isian "Jadikan deposito?" (SPEC-deposito-jatuh-tempo K2); nilainya diperiksa di rencanakan.
    const jadikan =
      p.jadikan && typeof p.jadikan === "object"
        ? Object.fromEntries(
            Object.entries(p.jadikan as Record<string, unknown>)
              .slice(0, 20)
              .flatMap(([k, v]): [string, IsianJadikan][] => {
                if (!v || typeof v !== "object") return [];
                const x = v as Record<string, unknown>;
                return [[k, { tenor: Number(x.tenor), satuan_tenor: x.satuan_tenor === "hari" ? "hari" : "bulan", bunga_persen: Number(x.bunga_persen), perpanjangan: String(x.perpanjangan) as IsianJadikan["perpanjangan"], mulai: typeof x.mulai === "string" ? x.mulai.slice(0, 10) : undefined }]];
              }),
          )
        : undefined;
    return { peta: peta(p.peta), ragu: peta(p.ragu), deposito: daftar(p.deposito), samakan: daftar(p.samakan), jadikan };
  } catch {
    return {};
  }
}

/** Berkas dari FormData, dengan batas jumlah & ukuran. */
export function ambilBerkas(form: FormData): { berkas: File[]; galat: string | null } {
  const berkas = form.getAll("berkas").filter((f): f is File => f instanceof File && f.size > 0);
  if (!berkas.length) return { berkas, galat: "Belum ada PDF rekening koran." };
  if (berkas.length > MAKS_BERKAS) return { berkas, galat: `Maksimal ${MAKS_BERKAS} PDF sekaligus.` };
  if (berkas.reduce((n, f) => n + f.size, 0) > MAKS_UKURAN) return { berkas, galat: "PDF-nya kebesaran untuk sekali kirim (maks. 4 MB). Kirim sebagian dulu." };
  return { berkas, galat: null };
}
