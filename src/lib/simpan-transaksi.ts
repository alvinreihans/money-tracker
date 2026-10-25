import type { SupabaseClient } from "@supabase/supabase-js";
import { isoLokal } from "@/lib/format";
import { isianArah, kantongBank, tentukanArah, type BuktiTransfer } from "@/lib/arah";
import { cocokkanKantong, type Kantong } from "@/lib/kantong";
import {
  arahPindah,
  EMOJI_ORANG,
  kantongUang,
  pilihCicilan,
  rencanaPaylater,
  SALDO_PER_PINJAMAN,
  type Cicilan,
  type InfoPaylater,
} from "@/lib/pinjaman";
import { barisIkutan } from "@/lib/transaksi-input";
import { pertanyaanDraft, type JenisTanya } from "@/lib/draft";
import { jamTransaksi, perluTanyaJam, saldoSejak, type PetunjukJam } from "@/lib/waktu";

/** Toleransi selisih tanggal saat mencocokkan dengan baris rekening koran lama. */
const DEDUPE_DAY_WINDOW = 2;

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Belanja paylater jadi rencana cicilan (SPEC-paylater): tidak ada pengeluaran
 * dan tidak ada saldo yang berubah; tiap cicilan dicatat saat dibayar.
 * `draftId`: draft yang menunggu tenornya — dihapus begitu rencananya ada.
 */
export async function jadikanCicilan(
  supabase: SupabaseClient,
  userId: string,
  belanja: Parameters<typeof rencanaPaylater>[0] & { description?: string | null },
  info: InfoPaylater & { tenor: number },
  draftId?: string,
): Promise<Cicilan> {
  const { data, error } = await supabase
    .from("cicilan")
    .insert({ user_id: userId, ...rencanaPaylater(belanja, info), catatan: belanja.description?.slice(0, 500) || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (draftId) await supabase.from("transactions").delete().eq("id", draftId);
  return data as Cicilan;
}

/** Isian manual tanpa kantong padahal user sudah punya kantong. */
export class KantongKurang extends Error {}

/**
 * Nama user di rekening/dompetnya, dipelajari dari jawaban "kirim atau
 * terima?" (SPEC-catat-tuntas). Dibaca dari Auth, bukan dari token: nama yang
 * baru disimpan belum ada di token sampai token diperbarui.
 */
export async function namaRekening(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.auth.getUser();
  const n = data.user?.user_metadata?.nama_rekening;
  return Array.isArray(n) ? n.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Simpan satu transaksi (dari struk, teks, atau isian manual) sambil
 * menyingkirkan baris rekening koran yang ternyata mewakili transaksi sama.
 *
 * Impor rekening koran sudah dihapus, tapi baris hasil impor lama masih ada.
 * Kalau transaksi yang sama dicatat lagi (mis. diisi manual dengan tanggal
 * mundur), tanpa ini ia tercatat dua kali. Catatan baru yang menang karena
 * memuat merchant dan kategori, sementara baris rekening koran cuma tertulis
 * "Pembayaran".
 */
export async function simpanTransaksi(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>,
): Promise<{ supersededStatement: boolean; transaction: unknown; pertanyaan: JenisTanya | null; cicilan?: Cicilan }> {
  const { payment_target, biaya_admin, cashback, pinjaman, cicilan: sebutanCicilan, jam, petunjuk_jam, info_paylater, bukti_transfer, ...row } = input;
  const dariAi = "payment_target" in input;

  // Belanja pakai paylater: bukan pengeluaran dari kantong mana pun. Tenor
  // diketahui → langsung jadi rencana cicilan; belum → draft yang menanyakannya.
  const paylater = dariAi && row.type === "expense" ? (info_paylater as InfoPaylater | null) : null;
  if (paylater) {
    const belanja = {
      amount: Number(row.amount),
      merchant: (row.merchant as string | null) ?? null,
      category: String(row.category),
      transaction_date: String(row.transaction_date),
      description: (row.description as string | null) ?? null,
    };
    if (paylater.tenor && belanja.amount > 0) {
      const cicilan = await jadikanCicilan(supabase, userId, belanja, { ...paylater, tenor: paylater.tenor });
      return { supersededStatement: false, transaction: null, pertanyaan: null, cicilan };
    }
    const draft = {
      ...row,
      paylater: paylater.penyedia,
      payment_method: paylater.penyedia,
      kantong_id: null,
      kantong_tujuan_id: null,
      status: "needs_review",
    };
    const { data: tersimpan, error } = await supabase.from("transactions").insert(draft).select().single();
    if (error) throw new Error(error.message);
    return { supersededStatement: false, transaction: tersimpan, pertanyaan: pertanyaanDraft(tersimpan) };
  }

  // Tautkan ke kantong. Form mengirim id-nya langsung (dicek memang milik
  // user); teks dan struk membawa nama ("gopay", "BRImo") yang dicocokkan.
  const KOLOM = "id, name, kind, aliases, saldo_per, saldo_sejak";
  const { data } = await supabase.from("user_accounts").select(KOLOM).eq("user_id", userId);
  const daftar = (data ?? []) as Pick<Kantong, "id" | "name" | "kind" | "aliases" | "saldo_per" | "saldo_sejak">[];

  // Bukti transfer antar dua pihak dari AI (SPEC-catat-tuntas): arahnya
  // diputuskan di sini — nama user yang sudah dikenal, lalu kantongnya.
  // Masih ragu → draft yang menanyakan "kirim atau terima?"; kantongnya
  // belum ditautkan, karena belum jelas sisi mana yang milik user.
  let target = payment_target as string | null;
  const bukti = dariAi ? ((bukti_transfer as BuktiTransfer | null) ?? null) : null;
  if (bukti) {
    const uang = daftar.filter((k) => k.kind !== "orang");
    const arah = tentukanArah(bukti, await namaRekening(supabase), uang);
    if (arah) {
      const isi = isianArah(bukti, arah);
      Object.assign(row, { type: isi.type, merchant: isi.merchant, ...("category" in isi ? { category: isi.category } : {}) });
      row.payment_method = kantongBank(isi.payment_method, uang)?.name ?? isi.payment_method;
      target = isi.payment_target ? (kantongBank(isi.payment_target, uang)?.name ?? isi.payment_target) : null;
    } else {
      row.bukti_transfer = JSON.stringify(bukti);
      row.payment_method = null;
      row.status = "needs_review";
    }
  }

  let kantong: (typeof daftar)[number] | null;
  let tujuan: (typeof daftar)[number] | null;
  const p = dariAi ? (pinjaman as { arah: "beri" | "terima_bayar" | "pinjam" | "bayar"; pihak: string } | null) : null;
  if (p && daftar.length > 0) {
    // Lend & Borrow dari AI ("minjemin budi 200rb dari bca"): pindah kantong
    // antara kantong uang dan kantong orang/kartu. Orang yang belum ada
    // dibuatkan kantongnya — pinjaman ke orang baru itu wajar.
    let pihak = cocokkanKantong(p.pihak, daftar.filter((k) => k.kind === "orang" || k.kind === "kredit"));
    if (!pihak) {
      const { data: baru } = await supabase
        .from("user_accounts")
        .insert({ user_id: userId, name: p.pihak, kind: "orang", emoji: EMOJI_ORANG, saldo_awal: 0, saldo_per: SALDO_PER_PINJAMAN })
        .select(KOLOM)
        .single();
      pihak = (baru as (typeof daftar)[number] | null) ?? null;
    }
    const uang = cocokkanKantong(row.payment_method as string | null, daftar.filter(kantongUang));
    const arah = uang && pihak ? arahPindah(p.arah, uang.id, pihak.id) : null;
    const semua = [...daftar, ...(pihak ? [pihak] : [])];
    kantong = arah ? (semua.find((k) => k.id === arah.dari) ?? null) : null;
    tujuan = arah ? (semua.find((k) => k.id === arah.ke) ?? null) : null;
    row.type = "transfer";
    row.category = "other";
    row.merchant = pihak?.name ?? p.pihak;
  } else {
    kantong =
      daftar.find((k) => k.id === row.kantong_id) ??
      // Orang (Lend & Borrow) hanya lewat pindah kantong; "kopi 25rb budi" bukan pinjaman.
      cocokkanKantong(row.payment_method as string | null, row.type === "transfer" ? daftar : daftar.filter((k) => k.kind !== "orang"));
    tujuan =
      row.type === "transfer"
        ? (daftar.find((k) => k.id === row.kantong_tujuan_id) ?? cocokkanKantong(target, daftar))
        : null;
  }
  row.kantong_id = kantong?.id ?? null;
  row.kantong_tujuan_id = tujuan && tujuan.id !== kantong?.id ? tujuan.id : null;
  if (kantong) row.payment_method = kantong.name;

  // Bayar cicilan dari AI ("bayar cicilan spaylater 150rb"): tempelkan ke
  // rencananya sebagai cicilan berikutnya. Rencana yang tidak ketemu tetap
  // dicatat sebagai pengeluaran biasa (uangnya memang keluar), dengan catatan.
  if (dariAi && typeof sebutanCicilan === "string" && row.type === "expense") {
    const [{ data: rencana }, { data: bayar }] = await Promise.all([
      supabase.from("cicilan").select("id, nama, penyedia, category, tenor, jatuh_tempo_awal, nominal"),
      supabase.from("transactions").select("cicilan_id, cicilan_ke").not("cicilan_id", "is", null),
    ]);
    const dibayar: Record<string, number[]> = {};
    for (const b of (bayar ?? []) as { cicilan_id: string; cicilan_ke: number | null }[]) {
      if (b.cicilan_ke) (dibayar[b.cicilan_id] ??= []).push(b.cicilan_ke);
    }
    const pilih = pilihCicilan(sebutanCicilan, (rencana ?? []) as Cicilan[], dibayar, isoLokal(new Date()));
    if (pilih) {
      row.cicilan_id = pilih.rencana.id;
      row.cicilan_ke = pilih.ke;
      row.category = pilih.rencana.category;
      row.merchant = pilih.rencana.nama;
      row.description = `Cicilan ${pilih.ke}/${pilih.rencana.tenor}${pilih.rencana.penyedia ? ` · ${pilih.rencana.penyedia}` : ""}`;
    } else {
      row.description = [row.description, `Rencana cicilan “${sebutanCicilan}” belum dicatat`].filter(Boolean).join(" · ");
    }
  }

  // Begitu user punya kantong, tiap transaksi harus jelas kantongnya — kalau
  // tidak, saldonya diam-diam meleset (mis. kantong yang disebut sudah
  // dihapus). Hasil AI yang kantongnya tidak cocok jadi draft "Perlu
  // dibenerin"; isian manual ditolak karena user-nya ada di depan form.
  const kurangKantong = !row.kantong_id || (row.type === "transfer" && !row.kantong_tujuan_id);
  if (daftar.length > 0 && kurangKantong) {
    if (!dariAi) throw new KantongKurang(row.kantong_id ? "Pilih kantong tujuannya dulu." : "Pilih kantongnya dulu.");
    row.status = "needs_review";
  }
  // Belum punya kantong sama sekali: "transfer" dari AI tidak bisa dipastikan
  // pindah kantong sendiri, jadi dicatat pengeluaran seperti dulu.
  if (dariAi && daftar.length === 0 && row.type === "transfer") row.type = "expense";
  // Jam transaksi (SPEC-saldo-waktu). Dari AI: jam tertera/disebut, perkiraan
  // bagian hari, atau jam saat dicatat. Di hari saldo kantongnya, jam yang
  // belum pasti ditanyakan dulu ("Tadi itu jam berapa?") — transaksi sebelum
  // jam saldo tidak boleh memotong saldo yang sudah mencakupnya.
  if (dariAi) {
    const j = jamTransaksi({ time: jam as string | null, hint: petunjuk_jam as PetunjukJam | null }, String(row.transaction_date));
    row.waktu = j.waktu;
    const cek = { transaction_date: String(row.transaction_date), waktu: j.waktu, perkiraan: j.perkiraan };
    if ([kantong, tujuan].some((k) => k && perluTanyaJam(cek, saldoSejak(k)))) {
      row.waktu = null;
      row.status = "needs_review";
    }
  }


  const amount = Number(row.amount);
  const date = String(row.transaction_date);
  const tunai = kantong?.kind === "cash" || String(row.payment_method ?? "").toLowerCase() === "tunai";

  let supersededStatement = false;

  // Transaksi tunai tidak pernah muncul di rekening koran, jadi tidak ada yang
  // perlu disingkirkan — dan mencarinya hanya berisiko menghapus baris yang sah.
  if (amount > 0 && !tunai) {
    const { data: kandidat } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "statement")
      .eq("amount", amount)
      .gte("transaction_date", shiftDate(date, -DEDUPE_DAY_WINDOW))
      .lte("transaction_date", shiftDate(date, DEDUPE_DAY_WINDOW))
      .limit(1);

    const cocok = (kandidat ?? [])[0] as { id: string } | undefined;
    if (cocok) {
      const { error } = await supabase.from("transactions").delete().eq("id", cocok.id);
      if (!error) supersededStatement = true;
    }
  }

  // Duplikat (SPEC-catat-andal): hasil AI yang sama persis dengan transaksi
  // tercatat — nominal, jenis, tanggal, jam (menit), kantong — jadi draft dan
  // ditanya "Catat lagi?"; user yang memutuskan. Merchant sengaja tidak
  // dibandingkan: AI membacanya berbeda-beda antar unggahan.
  if (dariAi && row.status === "confirmed") {
    const sama = (q: ReturnType<typeof cariSama>, kolom: string, nilai: unknown) => (nilai == null ? q.is(kolom, null) : q.eq(kolom, nilai));
    const cariSama = () =>
      supabase
        .from("transactions")
        .select("id")
        .eq("status", "confirmed")
        .is("induk_id", null)
        .eq("type", String(row.type))
        .eq("amount", amount)
        .eq("transaction_date", date);
    let q = sama(sama(cariSama(), "waktu", row.waktu), "kantong_id", row.kantong_id);
    if (row.type === "transfer") q = sama(q, "kantong_tujuan_id", row.kantong_tujuan_id);
    const { data: kembar } = await q.limit(1);
    if (kembar?.[0]) {
      row.duplikat_dari = (kembar[0] as { id: string }).id;
      row.status = "needs_review";
    }
  }

  // Teks asli/OCR hanya disimpan untuk draft, sebagai bahan membetulkan.
  if (row.status === "confirmed") row.raw_ocr_text = null;

  const { data: tersimpan, error } = await supabase.from("transactions").insert(row).select().single();

  if (error) throw new Error(error.message);

  // Biaya admin / cashback: baris sendiri yang menempel ke induknya. Kalau
  // gagal, induknya tetap tersimpan — lebih baik kurang satu ikutan daripada
  // transaksi utamanya hilang.
  const ikutan = barisIkutan(
    tersimpan,
    { biaya_admin: biaya_admin as number | null, cashback: cashback as number | null },
    tujuan?.name,
  );
  if (ikutan) await supabase.from("transactions").insert(ikutan);

  // Pertanyaan berikutnya untuk obrolan, kalau belum lengkap.
  const semua = [...daftar, ...[kantong, tujuan].filter((k): k is NonNullable<typeof k> => Boolean(k))];
  const pertanyaan = pertanyaanDraft(tersimpan, (id) => {
    const k = semua.find((x) => x.id === id);
    return k ? saldoSejak(k) : undefined;
  });
  return { supersededStatement, transaction: tersimpan, pertanyaan };
}
