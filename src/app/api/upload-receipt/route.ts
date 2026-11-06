import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { hasilKirimanUlang, processReceiptImage, toTransactionRow } from "@/lib/receipt";
import { cariKandidat, dipakaiSebelumAI, dipakaiSesudahAI, GalatLengkapi, sidikGambar, susunUsulan, terapkanLengkapi } from "@/lib/lengkapi-server";
import { isiDariEkstraksi, jenisBukti, tambahRef } from "@/lib/lengkapi";
import { ambilKonteksAI } from "@/lib/kategori-server";
import { simpanTransaksi } from "@/lib/simpan-transaksi";
import { dbErrorMessage } from "@/lib/errors";
import type { JenisTanya } from "@/lib/draft";
import { kabariDraft, simpanThumbnail } from "@/lib/draft-server";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

// Route ini murni dinamis & stateless: jangan di-cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OCR + rantai LLM bisa memakan puluhan detik pada cold start.
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(req: NextRequest) {
  try {
    // 1. Autentikasi user (RLS butuh session yang valid).
    const supabase = await createSupabaseServerClient();
    const user = await ambilUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Ambil & validasi file dari FormData.
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Field 'file' (gambar struk) wajib diisi." },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: `Format tidak didukung: ${file.type}` },
        { status: 415 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Ukuran file melebihi 5 MB." },
        { status: 413 },
      );
    }

    // Keterangan opsional yang diketik bersama fotonya (mis. "pakai BCA").
    const keterangan = formData.get("keterangan");
    const catatan = typeof keterangan === "string" ? keterangan.trim().slice(0, TEKS_MAKS) : "";

    // Lengkapi (SPEC-lengkapi): cara memproses.
    //  - latar (Bagikan, service worker) / banyak (unggah banyak): pasangan pasti
    //    langsung dilengkapi (K1); yang ragu jadi draft "sudah tercatat?", atau
    //    dikembalikan dulu bila `tunda` (dicoba lagi di akhir antrean);
    //  - satu gambar dari Catat: pasangan ditawarkan lewat kartu, belum disimpan;
    //  - baru: "Catat sebagai baru" — tanpa mencari pasangan.
    const latar = formData.get("latar") === "1";
    const banyak = latar || formData.get("banyak") === "1";
    const tunda = !latar && formData.get("tunda") === "1";
    const baru = formData.get("baru") === "1";
    const peringkat = bacaPeringkat(formData.get("peringkat"));

    const image = Buffer.from(await file.arrayBuffer());
    const sidik = sidikGambar(image);
    // Gambar yang sama (atau nama berkas struk digital yang sama) sudah dipakai: tanpa AI (§5).
    if (!baru) {
      const dipakai = await dipakaiSebelumAI(supabase, sidik, file.name);
      if (dipakai) return NextResponse.json({ success: true, dipakai, sidik }, { status: 200 });
    }

    // 3. Pipeline bersama: Gemini (gambar terkompres) -> OCR + Groq -> draft (SPEC-catat-andal).
    //    Tidak pernah melempar; kegagalan turun menjadi status needs_review.
    //    `hasil`: hasil baca yang dikirim balik klien (tanpa AI lagi).
    const konteks = await ambilKonteksAI(supabase);
    const kiriman = bacaJson(formData.get("hasil"));
    const result = kiriman ? hasilKirimanUlang(kiriman, konteks) : await processReceiptImage(image, file.type, konteks, catatan);
    const e = result.extracted;

    // Pasangan transaksi yang sudah tercatat (§1).
    let duplikatDari: string | null = null;
    if (e && result.status === "confirmed" && !baru) {
      const dipakai = await dipakaiSesudahAI(supabase, e);
      if (dipakai) return NextResponse.json({ success: true, dipakai, sidik, hasil: e }, { status: 200 });
      const cari = await cariKandidat(supabase, e, peringkat);
      if (cari.hasil.kandidat.length) {
        if (!banyak) {
          const lengkapi = await susunUsulan(supabase, e, cari);
          return NextResponse.json({ success: true, lengkapi, hasil: e, sidik, source: result.source, notes: result.notes }, { status: 200 });
        }
        if (cari.hasil.pasti) {
          try {
            const r = await terapkanLengkapi(supabase, user.id, cari.hasil.kandidat[0].id, isiDariEkstraksi(e, sidik), { dompet: e.dompet, kantong: cari.kantong });
            return NextResponse.json({ success: true, dilengkapi: r, hasil: e, sidik, source: result.source }, { status: 200 });
          } catch (err) {
            if (!(err instanceof GalatLengkapi)) throw err;
          }
        } else if (tunda) {
          return NextResponse.json({ success: true, ragu: true, hasil: e, sidik, source: result.source }, { status: 200 });
        } else duplikatDari = cari.hasil.kandidat[0].id;
      }
    }

    // 4. Simpan.
    let inserted: Transaction;
    let pertanyaan: JenisTanya | null = null;
    try {
      const row = toTransactionRow(result, user.id);
      if (e) {
        row.ref_bukti = tambahRef(null, jenisBukti(e), e.ref_bukti ?? null, sidik);
        row.dompet = e.dompet ?? null;
      }
      // Pasangannya ragu (unggah banyak/latar): draft yang menanyakan "lengkapi yang mana?".
      const isi = duplikatDari ? { ...row, status: "needs_review", duplikat_dari: duplikatDari } : row;
      const hasil = await simpanTransaksi(supabase, user.id, isi as unknown as Record<string, unknown>);
      // Belanja paylater yang langsung jadi rencana cicilan (SPEC-paylater).
      if (hasil.cicilan) return NextResponse.json({ success: true, cicilan: hasil.cicilan, notes: result.notes }, { status: 201 });
      inserted = hasil.transaction as Transaction;
      pertanyaan = hasil.pertanyaan;
    } catch (dbError) {
      return NextResponse.json(
        {
          error: dbErrorMessage(dbError),
        },
        { status: 500 },
      );
    }

    // Belum lengkap → jadi percakapan; thumbnail-nya disimpan (terenkripsi)
    // supaya nanti masih ingat ini transaksi apa.
    if (inserted.status === "needs_review") {
      await simpanThumbnail(supabase, inserted.id, image);
      // Dari "Bagikan" di latar (service worker): user mungkin sudah menutup
      // aplikasinya, jadi langsung dikabari lewat push.
      if (formData.get("latar") === "1") await kabariDraft(supabase, inserted, new URL(req.url).origin);
    }

    return NextResponse.json(
      {
        success: true,
        transaction: inserted,
        pertanyaan,
        // Status akhir: bisa jadi draft di simpanTransaksi (kantong tak cocok).
        status: inserted.status,
        source: result.source,
        // Jejak keputusan pipeline; membantu saat hasilnya meleset.
        notes: result.notes,
        // Hasil baca: dikirim balik untuk "Catat sebagai baru" tanpa AI lagi.
        hasil: e,
        sidik,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal server error.", detail: message },
      { status: 500 },
    );
  }
}

/** JSON dari FormData; null bila kosong/rusak. */
function bacaJson(v: FormDataEntryValue | null): unknown {
  if (typeof v !== "string" || !v || v.length > 20_000) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** Urutan jam gambar ini di antara gambar sebayar & setanggal di unggahan yang sama (§1). */
function bacaPeringkat(v: FormDataEntryValue | null): { ke: number; dari: number } | null {
  const p = bacaJson(v) as { ke?: unknown; dari?: unknown } | null;
  const ke = Number(p?.ke);
  const dari = Number(p?.dari);
  return Number.isInteger(ke) && Number.isInteger(dari) && dari > 1 && dari <= 50 && ke >= 1 && ke <= dari ? { ke, dari } : null;
}
