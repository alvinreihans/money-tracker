import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKonteksAI } from "@/lib/kategori-server";
import { bacaNominal, bacaTenor, kalimatBelumAda, kantongDariJawaban, pertanyaanDraft, type JenisTanya } from "@/lib/draft";
import { namaLembaga } from "@/lib/lembaga";
import { penyediaPaylater } from "@/lib/paylater-nama";
import { bacaPetunjuk, namaKantongBaru, simpanPetunjuk, sudahAda, type Petunjuk } from "@/lib/petunjuk";
import { buatKantongDiTempat, GalatPindah, type KantongBaru } from "@/lib/pindah-server";
import { EMOJI_KREDIT, type InfoPaylater } from "@/lib/pinjaman";
import { bacaArah, bacaBukti, gabungNama, isianArah, kantongBank, namaDariJawaban } from "@/lib/arah";
import { jadikanCicilan, namaRekening, tetapkanCicilan } from "@/lib/simpan-transaksi";
import { isoLokal } from "@/lib/format";
import { processReceiptText } from "@/lib/receipt";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import { kantongDeposito, pesanGagalKantong, type Kantong } from "@/lib/kantong";
import { bacaJam, jamTransaksi, perluTanyaJam, saldoSejak } from "@/lib/waktu";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// "cerita" membaca ulang lewat rantai Groq.
export const maxDuration = 30;

const JENIS: JenisTanya[] = ["cerita", "nominal", "arah", "sendiri", "cicilan", "kantong", "kantong_tujuan", "kartu", "waktu", "tenor", "duplikat", "konfirmasi"];

/** "buat:GoPay" dari pilihan "+ Buat kantong GoPay" (SPEC-kantong-sendiri A-1). */
const namaBuat = (nilai: string) => (nilai.startsWith("buat:") ? nilai.slice(5).trim().slice(0, 40) : null);
/** Jawaban ya/bukan untuk "dari rekeningmu sendiri?". */
const bacaYa = (t: string) => (/^(ya|iya|y|yes|betul|benar|sendiri|pindah)\b/i.test(t.trim()) ? true : /^(bukan|tidak|ga|gak|nggak|enggak|no|pemasukan)\b/i.test(t.trim()) ? false : null);

/**
 * Jawaban user untuk pertanyaan di percakapan sebuah draft (SPEC-catat-chat).
 * Jawaban mengisi draft; begitu tidak ada yang kurang, draft dikonfirmasi
 * (ikut dihitung) dan percakapan + fotonya hilang lewat trigger database.
 *
 * Balasan: { transaction, pertanyaan, kantong_baru? } — pertanyaan null = selesai;
 * kantong_baru = kantong yang dibuat di tempat (SPEC-kantong-sendiri A-1); atau
 * { cicilan } kalau belanja paylater-nya jadi rencana cicilan (SPEC-paylater).
 * 422 = jawaban tidak bisa dipakai; pertanyaannya tetap terbuka. 422 dengan
 * `buat` = kantong yang diketik belum ada: ditawari "Buat sekarang?".
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { jenis?: unknown; nilai?: unknown } | null;
  const jenis = JENIS.find((j) => j === body?.jenis);
  const nilai = typeof body?.nilai === "string" ? body.nilai.trim().slice(0, TEKS_MAKS) : "";
  if (!jenis) return NextResponse.json({ error: "Jenis jawaban tidak dikenal." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("transactions").select("*").eq("id", id).eq("status", "needs_review").maybeSingle();
  const tx = data as Transaction | null;
  if (!tx) return NextResponse.json({ error: "Catatan ini sudah selesai atau sudah dihapus." }, { status: 404 });

  const { data: daftarKantong } = await supabase.from("user_accounts").select("id, name, kind, aliases, saldo_per, saldo_sejak, macam_simpanan");
  // Deposito bukan jawaban "kantong mana?" (SPEC-simpanan).
  const semua = ((daftarKantong ?? []) as Pick<Kantong, "id" | "name" | "kind" | "aliases" | "saldo_per" | "saldo_sejak" | "macam_simpanan">[]).filter((k) => !kantongDeposito(k));
  const petunjuk = bacaPetunjuk(tx.bukti_transfer);
  const saldoDari = (id: string) => {
    const k = semua.find((x) => x.id === id);
    return k ? saldoSejak(k) : undefined;
  };
  // Jam masih perlu ditanyakan untuk tanggal & jam ini? (hari saldo kantongnya)
  const masihRagu = (t: Pick<Transaction, "transaction_date" | "kantong_id" | "kantong_tujuan_id">, waktu: string | null, perkiraan: boolean) =>
    [t.kantong_id, t.kantong_tujuan_id].some((kid) => kid && perluTanyaJam({ transaction_date: t.transaction_date, waktu, perkiraan }, saldoDari(kid)));
  // Orang (Lend & Borrow) hanya lewat pindah kantong, seperti di simpanTransaksi.
  const pilihan = (type: string) => (type === "transfer" ? semua : semua.filter((k) => k.kind !== "orang"));
  // `buat`: nama kantong yang diketik tapi belum ada → "Kantong 'GoPay' belum ada. Buat sekarang?" (A-1).
  const tolak = (error: string, buat?: string | null) =>
    NextResponse.json(buat ? { error: kalimatBelumAda(buat), buat } : { error }, { status: 422 });

  const patch: Partial<Transaction> = {};
  // Kantong yang dibuat di tempat lewat "+ Buat kantong <nama>" (A-1): saldo 0 sejak tanggal transaksinya (K1).
  let kantongBaru: KantongBaru | null = null;
  const buat = async (nama: string, sisi: "sumber" | "tujuan") => {
    const k = await buatKantongDiTempat(supabase, user.id, nama, { tanggal: tx.transaction_date, nomor_akhir: sisi === "tujuan" ? petunjuk.nomor_tujuan : null });
    if (!semua.some((x) => x.id === k.id)) {
      kantongBaru = k;
      semua.push(k as unknown as (typeof semua)[number]);
    }
    return k;
  };
  // Petunjuk kantong di draft (src/lib/petunjuk.ts) ikut diperbarui.
  const ubahPetunjuk = (p: Petunjuk) => {
    patch.bukti_transfer = simpanPetunjuk(patch.bukti_transfer !== undefined ? patch.bukti_transfer : tx.bukti_transfer, p);
  };
  // Ketikan nama kantong yang belum ada: ditawari dibuat (A-1), bukan diulang terus.
  let usulBuat: string | null = null;
  const usulan = (teks: string) => {
    const nama = namaKantongBaru(teks);
    if (!nama || sudahAda(nama, semua) || /\d/.test(teks) || teks.trim().split(/\s+/).length > 3) return { nama: null, kuat: false };
    return { nama, kuat: Boolean(namaLembaga(teks) || penyediaPaylater(teks) || /\b(tunai|cash)\b/i.test(teks)) };
  };
  // Ketikan yang bukan jawaban langsung ("nominalnya 40rb", "pakai yang biru")
  // dibaca AI seperti cerita; kalau tetap tidak ada yang berubah, baru ditolak.
  let gagal: string | null = null;
  // Paylater: berapa kali cicilannya, dan isian lain yang terbaca AI.
  let tenor: number | null = null;
  let infoPaylater: InfoPaylater | null = null;
  if (jenis === "nominal") {
    const n = bacaNominal(nilai);
    if (n) patch.amount = n;
    else gagal = "Angkanya belum kebaca. Coba ketik lagi, mis. 150.000";
  } else if (jenis === "arah") {
    // Bukti transfer antar dua pihak (SPEC-catat-tuntas): arah dari jawaban,
    // kantong dari bank di sisi user, lalu nama user dipelajari supaya bukti
    // berikutnya tidak perlu ditanyakan lagi.
    const bukti = bacaBukti(tx.bukti_transfer);
    const arah = bacaArah(nilai);
    if (bukti && !arah) return tolak("Pilih “Aku kirim” atau “Aku terima” ya.");
    patch.bukti_transfer = null;
    if (bukti && arah) {
      const uang = semua.filter((k) => k.kind !== "orang");
      const isi = isianArah(bukti, arah);
      Object.assign(patch, { type: isi.type, merchant: isi.merchant, ...("category" in isi ? { category: isi.category } : {}) });
      const dari = kantongBank(isi.payment_method, uang);
      const ke = isi.payment_target ? kantongBank(isi.payment_target, uang) : null;
      Object.assign(patch, dari ? { kantong_id: dari.id, payment_method: dari.name } : { kantong_id: null, payment_method: isi.payment_method });
      patch.kantong_tujuan_id = ke && ke.id !== dari?.id ? ke.id : null;
      // Kantong yang belum ada (B-3): ditawarkan dibuat di pertanyaan berikutnya, nomor rekeningnya ikut (B-2).
      patch.bukti_transfer = simpanPetunjuk(null, {
        nomor_tujuan: petunjuk.nomor_tujuan,
        sumber: dari ? null : isi.payment_method,
        tujuan: isi.payment_target && !ke ? isi.payment_target : null,
      });
      const nama = gabungNama(await namaRekening(supabase), namaDariJawaban(bukti, arah));
      await supabase.auth.updateUser({ data: { nama_rekening: nama } });
    }
  } else if (jenis === "sendiri") {
    // "Uang dari Jago ini dari rekeningmu sendiri?" (B-4).
    const ya = bacaYa(nilai);
    if (ya === null || !petunjuk.lembaga) return tolak("Pilih “Ya, pindah” atau “Bukan, pemasukan” ya.");
    if (ya) {
      let k: { id: string; name: string } | null = kantongDariJawaban(petunjuk.lembaga, semua.filter((x) => x.kind !== "orang"));
      try {
        k ??= await buat(petunjuk.lembaga, "sumber");
      } catch (e) {
        if (e instanceof GalatPindah) return tolak(e.message);
        throw e;
      }
      Object.assign(patch, { kantong_id: k.id, payment_method: k.name });
      if (k.id === tx.kantong_tujuan_id) patch.kantong_tujuan_id = null;
      ubahPetunjuk({ lembaga: null, sumber: null });
    } else {
      // Pemasukan ke e-wallet penerimanya, dari lembaga itu.
      const ke = semua.find((x) => x.id === tx.kantong_tujuan_id);
      Object.assign(patch, { type: "income", category: "other", merchant: petunjuk.lembaga, kantong_id: ke?.id ?? null, payment_method: ke?.name ?? petunjuk.tujuan ?? null, kantong_tujuan_id: null });
      ubahPetunjuk({ lembaga: null, sumber: ke ? null : (petunjuk.tujuan ?? null), tujuan: null });
    }
  } else if (jenis === "cicilan") {
    // "Bayar cicilan Shopee PayLater yang mana?" (D-2): id rencananya.
    const { data: r } = await supabase.from("cicilan").select("id, nama, category").eq("id", nilai).maybeSingle();
    if (!r) return tolak("Pilih salah satu cicilannya ya.");
    Object.assign(patch, { cicilan_id: r.id, merchant: r.nama, category: r.category ?? tx.category });
    ubahPetunjuk({ cicilan: null });
  } else if (jenis === "kantong" || jenis === "kantong_tujuan") {
    const tujuan = jenis === "kantong_tujuan";
    const nama = namaBuat(nilai);
    if (nama) {
      // "+ Buat kantong <nama>" (A-1).
      try {
        const k = await buat(nama, tujuan ? "tujuan" : "sumber");
        if (tujuan && k.id === tx.kantong_id) return tolak("Pilih kantong tujuan yang lain ya.");
        if (tujuan) patch.kantong_tujuan_id = k.id;
        else Object.assign(patch, { kantong_id: k.id, payment_method: k.name });
        ubahPetunjuk(tujuan ? { tujuan: null, nomor_tujuan: null } : { sumber: null });
      } catch (e) {
        if (e instanceof GalatPindah) return tolak(e.message);
        throw e;
      }
    } else {
      const k = kantongDariJawaban(nilai, tujuan ? semua : pilihan(tx.type));
      if (k && !(tujuan && k.id === tx.kantong_id)) {
        if (tujuan) patch.kantong_tujuan_id = k.id;
        else Object.assign(patch, { kantong_id: k.id, payment_method: k.name });
      } else {
        const u = k ? { nama: null, kuat: false } : usulan(nilai);
        // Nama bank/e-wallet/tunai yang jelas: langsung ditawari dibuat, tanpa dibaca ulang AI.
        if (u.nama && u.kuat) return tolak("", u.nama);
        usulBuat = u.nama;
        gagal = tujuan ? "Pilih kantong tujuan yang lain ya." : "Kantong itu belum ada. Pilih salah satu ya.";
      }
    }
  } else if (jenis === "kartu") {
    // Tagihan kartu kredit yang belum terdaftar (SPEC-tagihan-cicilan): kartu
    // yang sudah ada, atau kartu baru bertagihan = pembayaran ini sejak awal
    // harinya, jadi sesudah dibayar tagihannya Rp 0.
    if (nilai === "tambah" && tx.merchant) {
      const { data: kartu, error } = await supabase
        .from("user_accounts")
        .insert({
          user_id: user.id,
          name: tx.merchant,
          kind: "kredit",
          emoji: EMOJI_KREDIT,
          saldo_awal: -Number(tx.amount),
          saldo_per: tx.transaction_date,
          saldo_sejak: `${tx.transaction_date}T00:00:00+07:00`,
        })
        .select("id")
        .single();
      if (error) return tolak(await pesanGagalKantong(supabase, error, tx.merchant, null, "Gagal menambah kartunya."));
      patch.kantong_tujuan_id = kartu.id;
    } else {
      const k = kantongDariJawaban(nilai, semua.filter((x) => x.kind === "kredit"));
      if (k) patch.kantong_tujuan_id = k.id;
      else gagal = "Pilih kartu kredit yang ada, atau tambah kartunya.";
    }
  } else if (jenis === "duplikat") {
    // "Ya, catat lagi": penandanya dilepas, transaksinya tersimpan seperti biasa.
    // "Bukan" ditangani obrolan dengan menghapus draft-nya langsung.
    if (!/^(ya|iya|y|yes|catat|lanjut|oke|ok)\b/i.test(nilai)) return tolak("Pilih “Ya, catat lagi” atau “Bukan, buang” ya.");
    patch.duplikat_dari = null;
  } else if (jenis === "tenor") {
    tenor = bacaTenor(nilai);
    if (!tenor) gagal = "Berapa kali? Mis. 3 atau 6.";
  } else if (jenis === "waktu") {
    const b = bacaJam(nilai);
    // "siang" padahal saldo diisi jam 14.00: masih bisa sebelum atau sesudah.
    // Langsung ditanya lagi — bukan dibaca AI, yang bisa mengarang jam pasti.
    if (b && masihRagu(tx, b.jam, b.perkiraan)) return tolak("Kira-kira jam berapa? Mis. “jam 13” atau “13.30”.");
    if (b) patch.waktu = b.jam;
    else gagal = "Jamnya belum kebaca. Coba mis. “jam 10” atau “10.30”.";
  }
  if (jenis === "cerita" || (gagal && nilai)) {
    if (!nilai) return tolak("Ceritain sedikit transaksinya ya.");
    // Digabung dengan teks/OCR sebelumnya, tapi ditandai jelas sebagai
    // penjelasan user: kalau ditempel begitu saja, model menganggapnya bagian
    // struk dan lebih percaya "TOTAL ??" dari OCR yang rusak.
    const gabung = tx.raw_ocr_text
      ? `${tx.raw_ocr_text}\n\n---\nPenjelasan dari pengguna (utamakan ini untuk semua isian, termasuk nominal): ${nilai}`
      : nilai;
    const hasil = await processReceiptText(gabung, await ambilKonteksAI(supabase));
    const e = hasil.extracted;
    patch.raw_ocr_text = gabung;
    if (e && e.amount > 0) {
      Object.assign(patch, {
        amount: e.amount,
        type: e.type === "transfer" && !semua.length ? "expense" : e.type,
        category: e.category,
        merchant: e.merchant ?? tx.merchant,
        description: e.description ?? tx.description,
        transaction_date: e.transaction_date,
      });
    }
    // ponytail: pinjaman/cicilan dari cerita tidak ditautkan (jarang); kalau perlu, pakai simpanTransaksi.
    const type = (patch.type as string | undefined) ?? tx.type;
    const k = e?.payment_method ? kantongDariJawaban(e.payment_method, pilihan(type)) : null;
    if (k) Object.assign(patch, { kantong_id: k.id, payment_method: k.name });
    const t = type === "transfer" && e?.payment_target ? kantongDariJawaban(e.payment_target, semua) : null;
    if (t && t.id !== (k?.id ?? tx.kantong_id)) patch.kantong_tujuan_id = t.id;
    // Jam dari cerita ("tadi jam 10 beli roti"); yang masih ragu ditanya berikutnya.
    if (e && (e.time || e.time_hint)) {
      const j = jamTransaksi({ time: e.time, hint: e.time_hint }, patch.transaction_date ?? tx.transaction_date);
      patch.waktu = masihRagu({ ...tx, ...patch }, j.waktu, j.perkiraan) ? null : j.waktu;
    }
    // "13:57:00" dari database = "13:57"; "15680.00" = 15680.
    const teks = (x: unknown) => String(x ?? "").replace(/^(\d\d:\d\d):00$/, "$1");
    const sama = (a: unknown, b: unknown) => teks(a) === teks(b) || (a != null && b != null && Number(a) === Number(b));
    // Yang sedang ditanyakan tetap harus dari jawaban user, bukan tebakan AI
    // (mis. AI mengisi "Tunai" padahal user tidak menyebut kantong).
    if (gagal) {
      const ditanya = { kantong: ["kantong_id", "payment_method"], kantong_tujuan: ["kantong_tujuan_id"], waktu: ["waktu"] } as const;
      for (const k of ditanya[jenis as keyof typeof ditanya] ?? []) delete patch[k];
    }
    // "pakai spaylater 3x": belanjanya ternyata paylater bertenor → jadi cicilan, bukan dari kantong.
    // Tanpa tenor → dari kantong utang penyedianya (SPEC-kantong-sendiri D-4).
    if (e?.paylater && ((patch.type as string | undefined) ?? tx.type) === "expense") {
      infoPaylater = e.paylater;
      tenor ??= e.paylater.tenor;
      if (tenor) Object.assign(patch, { paylater: e.paylater.penyedia, payment_method: e.paylater.penyedia, kantong_id: null, kantong_tujuan_id: null });
      else {
        const k = kantongDariJawaban(e.paylater.penyedia, pilihan("expense"));
        Object.assign(patch, { payment_method: k?.name ?? e.paylater.penyedia, kantong_id: k?.id ?? null, kantong_tujuan_id: null });
        if (!k) ubahPetunjuk({ sumber: e.paylater.penyedia });
      }
    }
    const PENTING = ["amount", "type", "transaction_date", "waktu", "kantong_id", "kantong_tujuan_id", "paylater"] as const;
    if (gagal && !tenor && PENTING.every((k) => !(k in patch) || sama(patch[k], tx[k]))) return tolak(gagal, usulBuat);
  } else if (gagal) return tolak(gagal, usulBuat);

  // Paylater dengan tenor: jadi rencana cicilan, draft-nya dihapus.
  const paylater = patch.paylater ?? tx.paylater;
  const total = Number(patch.amount ?? tx.amount);
  if (paylater && tenor && total > 0) {
    const t = { ...tx, ...patch };
    try {
      const cicilan = await jadikanCicilan(
        supabase,
        user.id,
        { amount: total, merchant: t.merchant, category: t.category, transaction_date: t.transaction_date, description: t.description },
        { penyedia: paylater, per_cicilan: infoPaylater?.per_cicilan ?? null, jatuh_tempo: infoPaylater?.jatuh_tempo ?? null, tenor },
        id,
      );
      return NextResponse.json({ cicilan });
    } catch {
      return NextResponse.json({ error: "Gagal membuat rencana cicilannya." }, { status: 500 });
    }
  }

  // Setelah dijawab, "konfirmasi" berarti tidak ada yang kurang lagi: langsung
  // dikonfirmasi. Pertanyaan konfirmasi hanya diajukan saat draft dibuka.
  const sesudah = pertanyaanDraft({ ...tx, ...patch }, saldoDari);
  const selesai = sesudah === null || sesudah === "konfirmasi";
  // Petunjuk kantong (kolom bukti_transfer) tidak dibawa transaksi yang sudah selesai.
  if (selesai) Object.assign(patch, { status: "confirmed", raw_ocr_text: null, bukti_transfer: null });
  // Bayar cicilan: nomornya baru ditetapkan sekarang (SPEC-tagihan-cicilan).
  const cicilanId = patch.cicilan_id ?? tx.cicilan_id;
  if (selesai && cicilanId) Object.assign(patch, await tetapkanCicilan(supabase, cicilanId, isoLokal(new Date())));

  const { data: baru, error } = await supabase.from("transactions").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Gagal menyimpan jawabannya." }, { status: 500 });

  // Biaya admin / cashback mengikuti induknya: ikut dihitung, dari kantong yang sama.
  if (selesai) {
    const t = baru as Transaction;
    await supabase
      .from("transactions")
      .update({ status: "confirmed", kantong_id: t.kantong_id, payment_method: t.payment_method })
      .eq("induk_id", id)
      .or(`type.eq.expense,kantong_id.is.null${tx.kantong_id ? `,kantong_id.eq.${tx.kantong_id}` : ""}`);
    // Cashback yang sudah di kantong e-wallet perantaranya (SPEC-lengkapi K2) tetap di sana.
    await supabase.from("transactions").update({ status: "confirmed" }).eq("induk_id", id);
  }

  return NextResponse.json({ transaction: baru as Transaction, pertanyaan: selesai ? null : sesudah, kantong_baru: kantongBaru });
}
