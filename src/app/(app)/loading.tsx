import s from "@/components/ui.module.css";

/**
 * Tampilan sementara selagi halaman diambil dari server. Tanpa ini, ketukan
 * pindah halaman terasa "tidak ditanggapi" sampai server selesai. Bentuknya
 * meniru tata letak halaman: judul besar di area tampilan, lalu kartu-kartu.
 * Navigasi bawah tetap tampil (ada di layout) dan bisa diketuk.
 */
export default function Memuat() {
  return (
    <div aria-busy="true" aria-label="Memuat halaman">
      <header className={s.viewing}>
        <span className={s.kerangka} style={{ width: 200, height: 38 }} />
        <span className={s.kerangka} style={{ width: 130, height: 16 }} />
      </header>
      <div className={s.isi} style={{ marginTop: 56 }}>
        <div className={`${s.blok} ${s.kerangkaBlok}`} style={{ height: 120 }} />
        <div className={`${s.blok} ${s.kerangkaBlok}`} style={{ height: 72 }} />
        <div className={`${s.blok} ${s.kerangkaBlok}`} style={{ height: 200 }} />
      </div>
    </div>
  );
}
