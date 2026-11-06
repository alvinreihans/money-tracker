import { bacaBri, cocokBri } from "@/lib/rekening/bri";
import { bacaJagoBulanan, bacaJagoRiwayat, cocokJagoBulanan, cocokJagoRiwayat } from "@/lib/rekening/jago";
import { GalatRekening, NAMA_BANK, PESAN_BANK_LAIN, type BarisPdf, type HasilBaca, type RekeningBank } from "@/lib/rekening/jenis";
import { bacaSeabank, cocokSeabank } from "@/lib/rekening/seabank";
import { sen } from "@/lib/rekening/teks";

/**
 * Baris teks PDF → rekening koran yang sudah divalidasi. Bank dikenali dari
 * isi (judul dokumen), bukan nama berkas. Bank lain → GalatRekening dengan
 * pesan K5.
 */
export function bacaRekening(baris: BarisPdf[]): HasilBaca {
  const hasil = cocokSeabank(baris)
    ? bacaSeabank(baris)
    : cocokJagoBulanan(baris)
      ? bacaJagoBulanan(baris)
      : cocokJagoRiwayat(baris)
        ? bacaJagoRiwayat(baris)
        : cocokBri(baris)
          ? bacaBri(baris)
          : null;
  if (!hasil) throw new GalatRekening(PESAN_BANK_LAIN);
  for (const r of hasil.rekening) {
    const galat = cekSaldo(r);
    if (galat) throw new GalatRekening(galat);
    unikkanRef(r);
  }
  return hasil;
}

/**
 * Pengenal kembar di satu rekening (mis. transfer gagal, dikembalikan, lalu
 * diulang di menit yang sama: tanggal, nominal & saldo sesudahnya sama)
 * diberi nomor kemunculan "#2", "#3". Urutannya sama di setiap rekening koran
 * yang memuat hari itu, jadi tetap cocok antar-berkas.
 */
export function unikkanRef(r: RekeningBank) {
  const ke = new Map<string, number>();
  for (const b of r.baris) {
    const n = (ke.get(b.ref) ?? 0) + 1;
    ke.set(b.ref, n);
    if (n > 1) b.ref = `${b.ref}#${n}`;
  }
}

/** Nama tampilan rekening: "SeaBank …1234", "Jago · Dana Darurat". */
export const namaRekening = (r: Pick<RekeningBank, "bank" | "nomorAkhir" | "saku" | "utama">) =>
  r.bank === "jago" && r.saku && !r.utama ? `Jago · ${r.saku}` : `${NAMA_BANK[r.bank]} …${r.nomorAkhir}`;

/**
 * Validasi (spec §2): saldo awal + Σ baris = saldo akhir, dan tiap saldo
 * berjalan = saldo sebelumnya + nominal barisnya. Null bila cocok; selain itu
 * pesan yang menyebut di mana tidak cocoknya.
 */
export function cekSaldo(r: RekeningBank): string | null {
  const nama = namaRekening(r);
  let saldo = r.saldoAwal;
  for (const b of r.baris) {
    saldo = sen(saldo + b.nominal);
    if (b.saldo !== null && Math.abs(b.saldo - saldo) > 0.005) {
      return `Rekening koran ${nama} tidak bisa dicocokkan: saldo sesudah baris ${b.tanggal} seharusnya ${fmt(saldo)}, tertulis ${fmt(b.saldo)}. Tidak ada yang diimpor.`;
    }
  }
  if (Math.abs(saldo - r.saldoAkhir) > 0.005) {
    return `Rekening koran ${nama} tidak bisa dicocokkan: saldo awal + semua baris = ${fmt(saldo)}, saldo akhir tertulis ${fmt(r.saldoAkhir)}. Tidak ada yang diimpor.`;
  }
  return null;
}

const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;

export { GalatRekening };
