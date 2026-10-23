"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Memuat from "@/app/(app)/loading";
import { useCatat } from "@/components/Catat";

/**
 * Tujuan "Bagikan" dari aplikasi lain. Service worker (public/sw.js)
 * menangkap POST dari Android dan mengalihkan ke sini:
 *  - ?latar=<jumlah>: gambarnya sudah diunggah service worker di latar —
 *    cukup dikabari; yang belum lengkap nanti dikabari lewat push.
 *  - ?berkas=<jumlah>: gambar yang gagal diunggah di latar, disimpan di
 *    Cache Storage → masuk antrean struk di sini (dengan sesi halaman).
 *  - ?teks=…: mengisi kolom Catat tanpa langsung dikirim, supaya dicek dulu.
 * Setelah itu pindah ke Beranda — sheet-nya tetap terbuka karena Catat
 * hidup di kerangka aplikasi.
 */
export default function BagikanPage() {
  const router = useRouter();
  const { buka, tambahStruk, kabari } = useCatat();
  // Efek berjalan dua kali di mode dev (StrictMode); berkasnya cukup diambil sekali.
  const sudah = useRef(false);

  useEffect(() => {
    if (sudah.current) return;
    sudah.current = true;

    void (async () => {
      const q = new URLSearchParams(window.location.search);
      const jumlah = Math.min(Number(q.get("berkas")) || 0, 10);
      const latar = Number(q.get("latar")) || 0;
      const teks = q.get("teks") ?? "";

      const berkas: File[] = [];
      if (jumlah && "caches" in window) {
        const cache = await caches.open("bagikan");
        for (let i = 0; i < jumlah; i++) {
          const kunci = `/bagikan/berkas/${i}`;
          const res = await cache.match(kunci);
          if (!res) continue;
          const isi = await res.blob();
          const nama = decodeURIComponent(res.headers.get("x-nama") ?? `struk-${i}`);
          berkas.push(new File([isi], nama, { type: isi.type || res.headers.get("content-type") || "image/jpeg" }));
          await cache.delete(kunci);
        }
      }

      router.replace("/");
      if (berkas.length) tambahStruk(berkas);
      else if (latar) kabari(`${latar} struk diproses di latar. Kalau ada yang kurang, nanti dikabari.`);
      else buka(teks);
    })();
  }, [router, buka, tambahStruk, kabari]);

  return <Memuat />;
}
