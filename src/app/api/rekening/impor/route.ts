import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilBerkas, bacaBerkas, bacaPilihan, susunRencana } from "@/lib/rekening/server";
import { namaDariMetadata, namaRekeningBaru } from "@/lib/nama-rekening";
import { dbErrorMessage } from "@/lib/errors";

/**
 * Impor rekening koran (SPEC-impor-rekening §4–§8). PDF dibaca ulang dan
 * rencananya disusun ulang dengan pilihan yang sama dengan pratinjau, lalu
 * ditulis dalam SATU transaksi database (RPC impor_rekening): semua atau
 * tidak sama sekali.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu udah abis. Masuk lagi ya." }, { status: 401 });

  const form = await req.formData();
  const { berkas, galat: galatUnggah } = ambilBerkas(form);
  if (galatUnggah) return NextResponse.json({ error: galatUnggah }, { status: 400 });

  try {
    const { bacaan, galat } = await bacaBerkas(berkas);
    if (galat.length) return NextResponse.json({ galat }, { status: 422 });
    const { rencana } = await susunRencana(supabase, bacaan, bacaPilihan(form.get("pilihan")));
    if (rencana.belumDipetakan.length) {
      return NextResponse.json({ error: `Pilih dulu kantong untuk ${rencana.belumDipetakan.map((r) => r.nama).join(", ")}.` }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("impor_rekening", {
      p: {
        // Kantong yang dibuat di tempat (A-2/D-3) bersaldo sementara (U1): rekening koran pertamanya mengisi saldo awal.
        kantong_baru: rencana.kantongBaru.map((k) => ({ ...k, saldo_sementara: Boolean(k.tanyaSaldo) })),
        nomor_akhir: rencana.nomorAkhir,
        deposito_baru: rencana.depositoBaru,
        saldo: rencana.saldo,
        sisip: rencana.sisip,
        tautkan: rencana.tautkan,
        perbarui: rencana.perbarui,
        jadi_pindah: rencana.jadiPindah,
        // Pengeluaran/pemasukan yang ternyata pindah antar rekening sendiri (SPEC-impor-rekening R2).
        ubah_pindah: rencana.ubahPindah,
        // Deposito jatuh tempo (SPEC-deposito-jatuh-tempo).
        hapus: rencana.hapus,
        jadikan: rencana.jadikan,
        tutup: rencana.tutup,
        sesuaikan: rencana.sesuaikan,
      },
    });
    if (error) {
      const pesan = error.code === "23505" && /diimpor/.test(error.message) ? error.message : dbErrorMessage(error);
      return NextResponse.json({ error: pesan }, { status: error.code === "23505" ? 409 : 500 });
    }
    // B-1 (SPEC-kantong-sendiri): nama pemilik rekening koran → nama_rekening user, supaya
    // bukti transfer atas nama sendiri langsung dikenali. Gagal di sini tidak menggagalkan impor.
    // Dari Auth, bukan token: nama yang baru disimpan belum ada di token.
    const { data: pengguna } = await supabase.auth.getUser();
    const nama = namaRekeningBaru(namaDariMetadata(pengguna.user?.user_metadata), bacaan);
    if (nama) {
      const { error: eNama } = await supabase.auth.updateUser({ data: { nama_rekening: nama } });
      if (eNama) console.error("impor rekening: nama_rekening:", eNama.message);
    }
    // K1: kantong e-wallet/bank/paylater yang dibuat di tempat → sesudah impor ditanya saldonya.
    const id = ((data as { kantong_baru?: Record<string, string> } | null)?.kantong_baru ?? {}) as Record<string, string>;
    const tanyaSaldo = rencana.kantongBaru.filter((k) => k.tanyaSaldo && id[k.kunci]).map((k) => ({ id: id[k.kunci], name: k.name, kind: k.kind, emoji: k.emoji }));
    // A-3: kantong uang baru → dicari transaksi rekening koran lama yang tampaknya pindah ke/dari situ.
    const periksaPindah = rencana.kantongBaru.filter((k) => id[k.kunci] && ["bank", "ewallet", "cash"].includes(k.kind)).map((k) => id[k.kunci]);
    return NextResponse.json({ ok: true, hasil: data, ringkas: rencana.ringkas, tanyaSaldo, periksaPindah });
  } catch (e) {
    console.error("impor rekening:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Rekening korannya gagal diimpor. Coba lagi." }, { status: 500 });
  }
}
