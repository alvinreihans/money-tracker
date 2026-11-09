import type { SupabaseClient } from "@supabase/supabase-js";
import { ambilKantong, type Kantong } from "@/lib/kantong";
import { namaKategori, type Kategori } from "@/lib/kategori";
import { namaDariMetadata } from "@/lib/nama-rekening";
import { cariKejanggalan, bacaRef, namaBankRef, periksaSaldo, riwayatImpor, ringkasPencarian, type KantongPeriksa, type TxPeriksa } from "@/lib/periksa";
import { kantongUang, statusCicilan, type Cicilan } from "@/lib/pinjaman";
import { ambilDeposito, NAMA_PERPANJANGAN } from "@/lib/simpanan";
import { bersihkanArgCari, bersihkanArgPeriksa, idDariArgumen, jenisKejanggalanDari, type KonteksTanya } from "@/lib/tanya";

/**
 * Alat baca asisten (SPEC-asisten-agen §2): cari, detail, periksa_saldo,
 * cari_kejanggalan. Semua lewat sesi user (RLS, view transactions yang
 * `security_barrier` + auth.uid()), hanya membaca, tanpa SQL bebas: argumen
 * AI dibersihkan dulu di src/lib/tanya.ts. Perhitungannya fungsi murni di
 * src/lib/periksa.ts.
 */

// Batas baris yang dimuat per pemanggilan (perlindungan, sama dengan MAKS_BARIS Tanya AI).
export const MAKS_BARIS = 5000;

const KOLOM_TX =
  "id, amount, type, status, source, merchant, description, category, kantong_id, kantong_tujuan_id, transaction_date, waktu, created_at, updated_at, ref_bank, ref_bank_tujuan, induk_id, cicilan_id, pecahan_dari, perlu_dilengkapi";

/**
 * Per 1.000 baris (batas PostgREST) sampai MAKS_BARIS; `ambil` mengurutkan terbaru dulu
 * (urutTerbaru). `terpotong` = masih ada sisanya.
 */
async function muatSemua(ambil: (dari: number, sampai: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<{ baris: TxPeriksa[]; terpotong: boolean }> {
  const baris: TxPeriksa[] = [];
  for (let dari = 0; dari < MAKS_BARIS; dari += 1000) {
    const { data, error } = await ambil(dari, dari + 999);
    if (error) throw new Error(`alat: ${error.message}`);
    baris.push(...((data ?? []) as TxPeriksa[]));
    if (!data || data.length < 1000) return { baris, terpotong: false };
  }
  return { baris, terpotong: true };
}

interface Ctx {
  supabase: SupabaseClient;
  konteks: KonteksTanya;
  kategori: Kategori[];
}

export async function jalankanAlatBaca(nama: "cari" | "detail" | "periksa_saldo" | "cari_kejanggalan", args: Record<string, unknown>, ctx: Ctx): Promise<unknown> {
  if (nama === "cari") return cari(args, ctx);
  if (nama === "detail") return detail(args, ctx);
  if (nama === "periksa_saldo") return periksa(args, ctx);
  return kejanggalan(args, ctx);
}

const namaKat = (kategori: Kategori[]) => (slug: string, type: string) => namaKategori(kategori, slug, type as "expense" | "income");

async function cari(args: Record<string, unknown>, { supabase, konteks, kategori }: Ctx): Promise<unknown> {
  const c = bersihkanArgCari(args, konteks);
  const tidakDikenal = c.kantongTakDikenal.length ? { kantong_tidak_dikenal: c.kantongTakDikenal, kantong_yang_ada: konteks.kantong.map((k) => k.name) } : {};
  // Kantong disebut tapi tak satu pun dikenal: jangan diam-diam mencari di semua kantong.
  if (c.kantongTakDikenal.length && !c.kantong.length) return { ...tidakDikenal, jumlah: 0 };

  if (c.sumber === "transaksi") {
    const { baris, terpotong } = await muatSemua((d, s) => {
      let q = supabase.from("transactions").select(KOLOM_TX);
      if (c.status === "tercatat") q = q.eq("status", "confirmed");
      else if (c.status === "draft") q = q.eq("status", "needs_review").is("induk_id", null);
      else if (c.status === "perlu_dilengkapi") q = q.eq("status", "confirmed").eq("perlu_dilengkapi", true);
      if (c.jenis) q = q.eq("type", c.jenis === "keluar" ? "expense" : c.jenis === "masuk" ? "income" : "transfer");
      if (c.dari) q = q.gte("transaction_date", c.dari);
      if (c.sampai) q = q.lte("transaction_date", c.sampai);
      // id kantong & slug sudah divalidasi (milik user); kata dibersihkan seperti kolom cari Riwayat.
      if (c.kantong.length) q = q.or(`kantong_id.in.(${c.kantong.join(",")}),kantong_tujuan_id.in.(${c.kantong.join(",")})`);
      if (c.kategori.length) q = q.in("category", c.kategori).neq("type", "transfer");
      if (c.asal.length) q = q.in("source", c.asal);
      if (c.minimal != null) q = q.gte("amount", c.minimal);
      if (c.maksimal != null) q = q.lte("amount", c.maksimal);
      if (c.refBank === true) q = q.or("ref_bank.not.is.null,ref_bank_tujuan.not.is.null");
      if (c.refBank === false) q = q.is("ref_bank", null).is("ref_bank_tujuan", null);
      if (c.kata) q = q.or(`merchant.ilike.%${c.kata}%,description.ilike.%${c.kata}%,payment_method.ilike.%${c.kata}%`);
      return q.order("transaction_date", { ascending: false }).order("id", { ascending: false }).range(d, s);
    });
    const namaKantong = (id: string | null) => konteks.kantong.find((k) => k.id === id)?.name ?? null;
    return {
      saringan_dipakai: { dari: c.dari, sampai: c.sampai, jenis: c.jenis, status: c.status, kata: c.kata, kantong: c.kantong.map(namaKantong), kategori: c.kategori, asal: c.asal, minimal: c.minimal, maksimal: c.maksimal, ref_bank: c.refBank },
      ...tidakDikenal,
      ...(terpotong ? { catatan: `Hanya ${MAKS_BARIS} transaksi terbaru yang dihitung; persempit tanggal.` } : {}),
      ...ringkasPencarian(baris, { kelompokkan: c.kelompokkan, urutkan: c.urutkan, batas: c.batas, namaKantong, namaKategori: namaKat(kategori) }),
    };
  }

  if (c.sumber === "impor") {
    const { baris } = await muatSemua((d, s) => {
      let q = supabase.from("transactions").select(KOLOM_TX).or("ref_bank.not.is.null,ref_bank_tujuan.not.is.null");
      if (c.dari) q = q.gte("transaction_date", c.dari);
      if (c.sampai) q = q.lte("transaction_date", c.sampai);
      if (c.kantong.length) q = q.or(`kantong_id.in.(${c.kantong.join(",")}),kantong_tujuan_id.in.(${c.kantong.join(",")})`);
      return q.order("transaction_date", { ascending: false }).order("id", { ascending: false }).range(d, s);
    });
    const semua = riwayatImpor(baris, konteks.kantong);
    const pilih = c.kantong.length ? semua.filter((x) => c.kantong.some((id) => konteks.kantong.find((k) => k.id === id)?.name === x.kantong)) : semua;
    return {
      ...tidakDikenal,
      catatan: "Diturunkan dari baris rekening koran yang tersimpan (per kantong & bulan); berkas PDF-nya tidak disimpan.",
      jumlah: pilih.length,
      impor: pilih.slice(0, c.batas),
      ...(pilih.length > c.batas ? { lainnya: pilih.length - c.batas } : {}),
    };
  }

  const [{ kantong, saldo }, { deposito, periode }] = await Promise.all([ambilKantong(supabase), c.sumber === "deposito" ? ambilDeposito(supabase) : Promise.resolve({ deposito: [], periode: [] })]);
  const namaId = (id: string | null | undefined) => kantong.find((k) => k.id === id)?.name ?? null;
  const cocok = (k: Kantong) => (!c.kantong.length || c.kantong.includes(k.id) || c.kantong.includes(k.induk_id ?? "")) && (!c.kata || k.name.toLowerCase().includes(c.kata.toLowerCase()));
  const potong = <T,>(daftar: T[]) => ({ jumlah: daftar.length, data: daftar.slice(0, c.batas), ...(daftar.length > c.batas ? { lainnya: daftar.length - c.batas } : {}) });

  if (c.sumber === "kantong" || c.sumber === "simpanan" || c.sumber === "tujuan" || c.sumber === "pinjaman") {
    const jenis = { kantong: ["bank", "ewallet", "cash", "kredit", "orang"], simpanan: ["simpanan"], tujuan: ["tujuan"], pinjaman: ["orang", "kredit"] }[c.sumber];
    const daftar = kantong.filter((k) => jenis.includes(k.kind) && cocok(k));
    return {
      ...tidakDikenal,
      ...potong(
        daftar.map((k) => {
          const s = saldo.get(k.id) ?? 0;
          const isi = kantong.filter((x) => x.induk_id === k.id);
          return {
            id: k.id,
            nama: k.name,
            jenis: k.kind,
            saldo: s,
            ...(isi.length ? { saldo_gabungan: s + isi.reduce((n, x) => n + (saldo.get(x.id) ?? 0), 0), berisi: isi.map((x) => x.name) } : {}),
            saldo_awal: Number(k.saldo_awal),
            saldo_awal_berlaku_sejak: k.saldo_per,
            ...(k.induk_id ? { di_dalam: namaId(k.induk_id) } : {}),
            ...(k.macam_simpanan ? { macam: k.macam_simpanan } : {}),
            ...(k.aliases?.length ? { alias: k.aliases } : {}),
            ...((k as Kantong & { saldo_sementara?: boolean }).saldo_sementara ? { saldo_belum_diisi_pengguna: true } : {}),
            ...(k.kind === "tujuan" ? { target: Number(k.target ?? 0), tenggat: k.tenggat ?? null } : {}),
            ...(k.kind === "orang" || k.kind === "kredit" ? { arah: s > 0 ? "berutang ke pengguna" : s < 0 ? "pengguna berutang" : "lunas", bunga_persen_per_bulan: k.bunga_persen == null ? null : Number(k.bunga_persen) } : {}),
            ...(kantongUang(k) ? {} : { bukan_aset: true }),
          };
        }),
      ),
    };
  }

  if (c.sumber === "deposito") {
    const daftar = deposito.filter((d) => {
      const k = kantong.find((x) => x.id === d.kantong_id);
      return k && cocok(k);
    });
    return {
      ...tidakDikenal,
      ...potong(
        daftar.map((d) => ({
          id: d.kantong_id,
          nama: namaId(d.kantong_id),
          di_dalam: namaId(kantong.find((x) => x.id === d.kantong_id)?.induk_id),
          saldo: saldo.get(d.kantong_id) ?? 0,
          bunga_persen_per_tahun: Number(d.bunga_persen),
          tenor: `${d.tenor} ${d.satuan_tenor}`,
          saat_jatuh_tempo: NAMA_PERPANJANGAN[d.perpanjangan],
          selesai: d.selesai,
          periode: periode
            .filter((p) => p.deposito_id === d.kantong_id)
            .map((p) => ({
              ke: p.ke,
              mulai: p.mulai,
              jatuh_tempo: p.jatuh_tempo,
              pokok: Number(p.pokok),
              bunga_bersih_perkiraan: Number(p.bunga_bersih),
              bunga_diterima: p.bunga_diterima == null ? null : Number(p.bunga_diterima),
              dicairkan_awal: p.dicairkan_awal,
            })),
        })),
      ),
    };
  }

  // cicilan
  const [{ data: cicilan }, { data: bayar }] = await Promise.all([
    supabase.from("cicilan").select("*"),
    supabase.from("transactions").select("cicilan_id, cicilan_ke").not("cicilan_id", "is", null).eq("status", "confirmed"),
  ]);
  const dibayar: Record<string, number[]> = {};
  for (const b of (bayar ?? []) as { cicilan_id: string; cicilan_ke: number | null }[]) if (b.cicilan_ke) (dibayar[b.cicilan_id] ??= []).push(b.cicilan_ke);
  const daftar = ((cicilan ?? []) as Cicilan[]).filter((x) => !c.kata || `${x.nama} ${x.penyedia ?? ""}`.toLowerCase().includes(c.kata.toLowerCase()));
  return potong(
    daftar.map((x) => {
      const st = statusCicilan(x, dibayar[x.id] ?? [], konteks.hariIni);
      return {
        id: x.id,
        nama: x.nama,
        penyedia: x.penyedia,
        per_cicilan: Number(x.nominal),
        tenor: x.tenor,
        sudah_dibayar: (dibayar[x.id] ?? []).length,
        lunas: st.lunas,
        sisa_kali: st.sisa,
        sisa_nominal: st.sisaNominal,
        berikutnya: st.berikutnya && { ke: st.berikutnya.ke, jatuh_tempo: st.berikutnya.jatuhTempo },
        telat: st.telat,
      };
    }),
  );
}

const ASAL: Record<string, string> = { statement: "rekening koran", text: "ketikan/isian manual", receipt: "foto struk", payment_proof: "screenshot bukti bayar" };

async function detail(args: Record<string, unknown>, { supabase, kategori }: Ctx): Promise<unknown> {
  const id = idDariArgumen(args);
  if (!id) return { error: "id tidak valid; pakai id dari hasil cari." };
  const { data: t } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  const { kantong, saldo } = await ambilKantong(supabase);
  const nama = (k: string | null | undefined) => kantong.find((x) => x.id === k)?.name ?? null;
  if (!t) {
    const k = kantong.find((x) => x.id === id);
    if (!k) return { error: "Tidak ditemukan." };
    return { kantong: { nama: k.name, jenis: k.kind, saldo: saldo.get(k.id) ?? 0, saldo_awal: Number(k.saldo_awal), saldo_awal_berlaku_sejak: k.saldo_per, di_dalam: nama(k.induk_id), alias: k.aliases ?? [], berisi: kantong.filter((x) => x.induk_id === k.id).map((x) => x.name) } };
  }
  const tx = t as TxPeriksa & Record<string, unknown>;
  const [{ data: ikutan }, { data: induk }, { data: pecahan }, { data: cicilan }, { data: jejak }] = await Promise.all([
    supabase.from("transactions").select("id, amount, type, merchant, category, status").eq("induk_id", id),
    tx.induk_id ? supabase.from("transactions").select("id, amount, type, merchant, transaction_date").eq("id", tx.induk_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("transactions").select("id, amount, category, description").eq("pecahan_dari", (tx.pecahan_dari as string | null) ?? id),
    tx.cicilan_id ? supabase.from("cicilan").select("nama, penyedia").eq("id", tx.cicilan_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("jejak_catat", { p_id: id }),
  ]);
  const kat = namaKat(kategori);
  const sisiBank = (ref: string | null | undefined, kantongId: string | null) => {
    if (!ref) return null;
    const r = bacaRef(ref);
    return { kantong: nama(kantongId), bank: namaBankRef(ref.split(":")[0]), ...(r ? { tanggal: r.tanggal, ...(r.jam ? { jam: r.jam } : {}), nominal: Math.abs(r.nominal), saldo_bank_sesudah_baris: r.saldo } : {}) };
  };
  return {
    id,
    tanggal: tx.transaction_date,
    ...(tx.waktu ? { jam: tx.waktu.slice(0, 5) } : {}),
    jenis: tx.type === "expense" ? "keluar" : tx.type === "income" ? "masuk" : "pindah kantong",
    nominal: Number(tx.amount),
    merchant: tx.merchant ?? null,
    keterangan: tx.description ?? null,
    ...(tx.type !== "transfer" ? { kategori: kat(tx.category ?? "other", tx.type) } : {}),
    kantong: nama(tx.kantong_id),
    ...(tx.kantong_tujuan_id ? { ke_kantong: nama(tx.kantong_tujuan_id) } : {}),
    status: tx.status === "needs_review" ? "draft (belum dihitung ke saldo)" : tx.perlu_dilengkapi ? "tercatat, perlu dilengkapi" : "tercatat",
    asal: ASAL[tx.source ?? ""] ?? tx.source,
    baris_rekening_koran: [sisiBank(tx.ref_bank, tx.kantong_id), sisiBank(tx.ref_bank_tujuan, tx.kantong_tujuan_id)].filter(Boolean),
    ...(tx.ref_bukti ? { nomor_bukti: tx.ref_bukti } : {}),
    ...(induk ? { ikutan_dari: { id: induk.id, nominal: Number(induk.amount), merchant: induk.merchant, tanggal: induk.transaction_date } } : {}),
    ikutan: (ikutan ?? []).map((x) => ({ id: x.id, nominal: Number(x.amount), jenis: x.type === "expense" ? "biaya" : "cashback/masuk", merchant: x.merchant })),
    ...((pecahan ?? []).length ? { bagian_pecahan: (pecahan ?? []).map((x) => ({ id: x.id, nominal: Number(x.amount), kategori: kat(x.category, "expense"), keterangan: x.description })) } : {}),
    ...(cicilan ? { cicilan: { nama: cicilan.nama, penyedia: cicilan.penyedia, ke: tx.cicilan_ke ?? null } } : {}),
    ...(tx.duplikat_dari ? { tampak_sama_dengan: tx.duplikat_dari } : {}),
    dibuat: String(tx.created_at ?? "").slice(0, 16),
    diubah: String(tx.updated_at ?? "").slice(0, 16),
    cara_dicatat: ((jejak ?? []) as { isi: Record<string, unknown>; ada_foto: boolean; dibuat: string }[]).map((j) => ({
      dibuat: j.dibuat.slice(0, 16),
      asal: j.isi.asal ?? null,
      ...(typeof j.isi.teks === "string" ? { teks: j.isi.teks.slice(0, 300) } : {}),
      ...(j.isi.bacaan ? { hasil_baca_ai: j.isi.bacaan } : {}),
      ...(Array.isArray(j.isi.langkah) ? { tanya_jawab: (j.isi.langkah as { t: string; teks: string }[]).slice(-12).map((l) => ({ t: l.t, teks: String(l.teks).slice(0, 200) })) } : {}),
      ...(j.isi.cara ? { disimpan_lewat: j.isi.cara } : {}),
      ada_gambar: j.ada_foto,
    })),
  };
}

async function muatPeriksa(supabase: SupabaseClient) {
  const [{ kantong, saldo }, { baris, terpotong }, { data: pengguna }] = await Promise.all([
    ambilKantong(supabase),
    muatSemua((d, s) => supabase.from("transactions").select(KOLOM_TX).order("transaction_date", { ascending: false }).order("id", { ascending: false }).range(d, s)),
    supabase.auth.getUser(),
  ]);
  return { kantong, saldo, baris, terpotong, namaUser: namaDariMetadata(pengguna?.user?.user_metadata) };
}

async function periksa(args: Record<string, unknown>, { supabase, konteks }: Ctx): Promise<unknown> {
  const p = bersihkanArgPeriksa(args, konteks);
  if (!p.kantongId) return { error: `Kantong "${p.nama}" tidak ada.`, kantong_yang_ada: konteks.kantong.map((k) => k.name) };
  const d = await muatPeriksa(supabase);
  const k = d.kantong.find((x) => x.id === p.kantongId);
  if (!k) return { error: "Kantong tidak ditemukan." };
  return {
    ...periksaSaldo({ kantong: k as KantongPeriksa, semuaKantong: d.kantong as KantongPeriksa[], transaksi: d.baris, saldoSekarang: d.saldo.get(k.id) ?? 0, namaUser: d.namaUser, saldoBank: p.saldoBank, sampai: p.sampai }),
    ...(d.terpotong ? { catatan_data: `Hanya ${MAKS_BARIS} transaksi terbaru yang diperiksa.` } : {}),
  };
}

async function kejanggalan(args: Record<string, unknown>, { supabase }: Ctx): Promise<unknown> {
  const d = await muatPeriksa(supabase);
  return { ...cariKejanggalan(d.baris, d.kantong as KantongPeriksa[], jenisKejanggalanDari(args)), ...(d.terpotong ? { catatan_data: `Hanya ${MAKS_BARIS} transaksi terbaru yang diperiksa.` } : {}) };
}
