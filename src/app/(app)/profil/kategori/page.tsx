import KategoriView from "./KategoriView";

export const dynamic = "force-dynamic";

// Daftar kategorinya sudah diambil layout (lewat konteks Catat), jadi halaman
// ini cukup meneruskan; router.refresh() setelah simpan memuat ulang keduanya.
export default function KategoriPage() {
  return <KategoriView />;
}
