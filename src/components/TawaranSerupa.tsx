"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCatat } from "@/components/Catat";
import { Konfirmasi } from "@/components/oneui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface HasilUbahKategori {
  diubah: number;
  sebelum: { id: string; category: string; kelompok: string | null }[];
  kategori: { slug: string; name: string };
}

/** POST /api/kategori-merchant (lihat route-nya untuk isi `body`). */
export async function ubahKategoriMerchant(body: Record<string, unknown>): Promise<HasilUbahKategori | { error: string }> {
  const res = await fetch("/api/kategori-merchant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = (await res?.json().catch(() => null)) as (HasilUbahKategori & { error?: string }) | null;
  if (!res?.ok || !d) return { error: d?.error ?? "Gagal mengubah. Coba lagi." };
  return d;
}

/** Urungkan pembetulan massal: kategori & kelompok tiap transaksi dikembalikan. */
export async function kembalikanKategori(sebelum: HasilUbahKategori["sebelum"]) {
  const db = createSupabaseBrowserClient();
  const hasil = await Promise.all(sebelum.map((b) => db.from("transactions").update({ category: b.category, kelompok: b.kelompok }).eq("id", b.id)));
  return hasil.find((h) => h.error)?.error ?? null;
}

interface Tawaran {
  merchant: string;
  type: "expense" | "income";
  kategori: { slug: string; name: string };
  kelompok: string | null;
  /** Transaksi yang baru dibetulkan, tidak ikut dihitung. */
  kecuali: string;
  jumlah: number;
}

/**
 * Setelah kategori sebuah transaksi dibetulkan (Ubah transaksi, koreksi di
 * obrolan Catat): tawarkan ikut membetulkan transaksi lain dari merchant yang
 * sama (SPEC-ingat-kategori). Tidak ada yang berubah tanpa "Ubah".
 */
export function useTawaranSerupa() {
  const router = useRouter();
  const { kabari } = useCatat();
  const [tawaran, setTawaran] = useState<Tawaran | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function tawarkan(t: Omit<Tawaran, "jumlah">) {
    if (!t.merchant.trim()) return;
    const q = new URLSearchParams({ merchant: t.merchant, type: t.type, kategori: t.kategori.slug, kecuali: t.kecuali });
    const res = await fetch(`/api/kategori-merchant?${q}`).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { jumlah?: number } | null;
    if (d?.jumlah) {
      setError(null);
      setTawaran({ ...t, jumlah: d.jumlah });
    }
  }

  async function ubah() {
    if (!tawaran) return;
    setLoading(true);
    const r = await ubahKategoriMerchant({
      merchant: tawaran.merchant,
      type: tawaran.type,
      kategori: tawaran.kategori.slug,
      kelompok: tawaran.kelompok,
      kecuali: tawaran.kecuali,
    });
    setLoading(false);
    if ("error" in r) return setError(r.error);
    const hasil = r;
    setTawaran(null);
    router.refresh();
    kabari(`${hasil.diubah} transaksi ${tawaran.merchant} jadi ${hasil.kategori.name}`, {
      label: "Urungkan",
      jalankan: async () => {
        const err = await kembalikanKategori(hasil.sebelum);
        kabari(err ? "Gagal mengurungkan. Coba lagi." : "Kategori lama dikembalikan");
        router.refresh();
      },
    });
  }

  const elemen = tawaran && (
    <Konfirmasi
      tanya={`Ubah juga ${tawaran.jumlah} transaksi ${tawaran.merchant} lain jadi ${tawaran.kategori.name}?`}
      ya="Ubah"
      loading={loading}
      error={error}
      onBatal={() => setTawaran(null)}
      onYa={() => void ubah()}
    >
      Transaksi berikutnya dari {tawaran.merchant} otomatis {tawaran.kategori.name}, apa pun pilihanmu di sini.
    </Konfirmasi>
  );

  return { tawarkan, elemen };
}
