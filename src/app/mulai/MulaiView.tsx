"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardPen, Keyboard, Plus, Settings, TriangleAlert } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Field, InputNominal, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { isianNominal } from "@/lib/format";
import { emojiKantong, type Kantong } from "@/lib/kantong";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Rekening & e-wallet yang paling umum, untuk dipilih sekali ketuk. */
const SARAN = [
  { name: "BCA", emoji: "🏦" },
  { name: "BRI", emoji: "🏦" },
  { name: "Mandiri", emoji: "🏦" },
  { name: "BNI", emoji: "🏦" },
  { name: "BSI", emoji: "🏦" },
  { name: "SeaBank", emoji: "🏦" },
  { name: "Jago", emoji: "🏦" },
  { name: "GoPay", emoji: "📱" },
  { name: "OVO", emoji: "📱" },
  { name: "DANA", emoji: "📱" },
  { name: "ShopeePay", emoji: "📱" },
];

const LANGKAH = 4;

/**
 * Empat langkah singkat: cara mencatat → kantong → saldo awal → siap. Bisa
 * dilewati kapan saja; yang diisi baru disimpan di langkah terakhir.
 */
export default function MulaiView({ userId, kantong }: { userId: string; kantong: Kantong[] }) {
  const router = useRouter();
  const [langkah, setLangkah] = useState(0);
  const [dipilih, setDipilih] = useState<string[]>([]);
  // Saldo per nama kantong (angka mentah); kantong lama terisi saldo awalnya.
  const [saldo, setSaldo] = useState<Record<string, string>>(() =>
    Object.fromEntries(kantong.map((k) => [k.name, Number(k.saldo_awal) ? isianNominal(k.saldo_awal) : ""])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const namaLama = new Set(kantong.map((k) => k.name.toLowerCase()));
  const saranBaru = SARAN.filter((k) => !namaLama.has(k.name.toLowerCase()));
  // Kantong yang saldonya ditanyakan: yang sudah ada (Tunai dulu) + yang baru dipilih.
  const daftarSaldo = [
    ...[...kantong].sort((a, b) => Number(Boolean(b.bawaan)) - Number(Boolean(a.bawaan))).map((k) => ({ name: k.name, emoji: emojiKantong(k) })),
    ...SARAN.filter((k) => dipilih.includes(k.name)),
  ];

  const pilih = (nama: string) => setDipilih((v) => (v.includes(nama) ? v.filter((n) => n !== nama) : [...v, nama]));

  /** Tandai selesai di akun (ikut di JWT), segarkan sesi, lalu ke Beranda. */
  async function tandaiSelesai() {
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.updateUser({ data: { onboarding_selesai: new Date().toISOString() } });
    if (err) throw err;
    // Token baru membawa tanda tadi; tanpa ini layout masih melihat token lama.
    await supabase.auth.refreshSession();
    router.replace("/");
    router.refresh();
  }

  async function selesai(simpan: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (simpan) {
        const db = createSupabaseBrowserClient().from("user_accounts");
        const baru = SARAN.filter((k) => dipilih.includes(k.name)).map((k) => ({
          user_id: userId,
          name: k.name,
          emoji: k.emoji,
          saldo_awal: Number(saldo[k.name] || 0),
          // Saldo saat ini: berlaku sejak jam sekarang (SPEC-saldo-waktu).
          saldo_sejak: new Date().toISOString(),
        }));
        if (baru.length) {
          const { error: err } = await db.insert(baru);
          if (err) throw err;
        }
        // Kantong lama yang saldonya diubah di sini.
        for (const k of kantong) {
          const isian = saldo[k.name] ?? "";
          if (isian !== (Number(k.saldo_awal) ? isianNominal(k.saldo_awal) : "")) {
            const { error: err } = await db.update({ saldo_awal: Number(isian || 0), saldo_sejak: new Date().toISOString() }).eq("id", k.id);
            if (err) throw err;
          }
        }
      }
      await tandaiSelesai();
    } catch (e) {
      setLoading(false);
      setError(dbErrorMessage(e));
    }
  }

  const lanjut = () => setLangkah((l) => Math.min(l + 1, LANGKAH - 1));
  const kembali = () => setLangkah((l) => Math.max(l - 1, 0));

  return (
    <main className={s.app} style={{ paddingBottom: 120 }}>
      <div className={s.mulaiAtas}>
        <span className={s.mulaiTitik} aria-label={`Langkah ${langkah + 1} dari ${LANGKAH}`} role="img">
          {Array.from({ length: LANGKAH }, (_, i) => (
            <span key={i} data-aktif={i === langkah} />
          ))}
        </span>
        {langkah < LANGKAH - 1 && (
          <button type="button" className={`${s.flat} ${s.flatNetral}`} style={{ flex: "none", padding: "0 16px" }} disabled={loading} onClick={() => void selesai(false)}>
            Lewati
          </button>
        )}
      </div>

      {/* key: tiap langkah dipasang ulang, jadi animasi masuknya berjalan lagi. */}
      <div key={langkah}>
        {langkah === 0 && (
          <>
            <BrandMark judul="Halo!" sub="Catat keuangan secepat ngetik chat. Ada tiga cara:" />
            <div className={s.isi}>
              <div className={s.blok}>
                <Baris ikon={Keyboard} warna="#3e91ff" judul="Ketik" ket="“kopi 25rb gopay” langsung tercatat." />
                <Baris ikon={Camera} warna="#5ecb7a" judul="Foto struk" ket="Nominal & tempatnya dibaca otomatis." />
                <Baris ikon={ClipboardPen} warna="#ff9f43" judul="Isi manual" ket="Kalau mau lengkap dan teliti." />
              </div>
            </div>
          </>
        )}

        {langkah === 1 && (
          <>
            <header className={s.viewing}>
              <h1 className={s.judulBesar}>Uangmu disimpan di mana?</h1>
              <p className={s.judulSub}>Pilih rekening & e-wallet yang kamu pakai. Bisa ditambah nanti di Profil.</p>
            </header>
            <div className={s.isi}>
              <div className={s.chipsBungkus}>
                {kantong.map((k) => (
                  <button key={k.id} type="button" className={s.chip} aria-pressed disabled>
                    {emojiKantong(k)} {k.name}
                  </button>
                ))}
                {saranBaru.map((k) => (
                  <button key={k.name} type="button" className={`${s.chip} ${s.tekan}`} aria-pressed={dipilih.includes(k.name)} onClick={() => pilih(k.name)}>
                    {k.emoji} {k.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {langkah === 2 && (
          <>
            <header className={s.viewing}>
              <h1 className={s.judulBesar}>Berapa saldonya sekarang?</h1>
              <p className={s.judulSub}>Biar Total aset langsung benar. Boleh dikosongkan.</p>
            </header>
            <div className={s.isi}>
              <div className={`${s.blok} ${s.blokForm}`}>
                {daftarSaldo.map((k) => (
                  <Field key={k.name} label={`${k.emoji} ${k.name}`}>
                    <InputNominal
                      value={saldo[k.name] ?? ""}
                      onChange={(v) => setSaldo((x) => ({ ...x, [k.name]: v }))}
                      placeholder={`${k.emoji} ${k.name}`}
                    />
                  </Field>
                ))}
              </div>
            </div>
          </>
        )}

        {langkah === 3 && (
          <>
            <header className={s.viewing}>
              <h1 className={s.judulBesar}>Siap mencatat!</h1>
              <p className={s.judulSub}>Tiga hal yang perlu kamu tahu:</p>
            </header>
            <div className={s.isi}>
              <div className={s.blok}>
                <Baris ikon={Plus} warna="#3e91ff" judul="Ketuk + di bawah" ket="Untuk mencatat dengan ketik, foto, atau manual." />
                <Baris ikon={TriangleAlert} warna="#ffb340" judul="Belum selesai" ket="Kalau AI kurang yakin, dia langsung nanya. Yang belum dijawab menunggu di sini — titik oranye di tombol +." />
                <Baris ikon={Settings} warna="#9b9b9b" judul="Profil" ket="Kantong, kategori & budget, dari tab Profil." />
              </div>
              {error && <Pesan jenis="bahaya">{error}</Pesan>}
            </div>
          </>
        )}
      </div>

      <div className={s.pil} style={{ position: "fixed" }}>
        {langkah > 0 && (
          <>
            <button type="button" disabled={loading} onClick={kembali}>
              Kembali
            </button>
            <span className={s.pilPemisah} aria-hidden />
          </>
        )}
        {langkah < LANGKAH - 1 ? (
          <button type="button" onClick={lanjut}>
            Lanjut
          </button>
        ) : (
          <button type="button" disabled={loading} onClick={() => void selesai(true)}>
            {loading ? <Spinner /> : "Mulai mencatat"}
          </button>
        )}
      </div>
    </main>
  );
}

function Baris({ ikon: Ikon, warna, judul, ket }: { ikon: React.ElementType; warna: string; judul: string; ket: string }) {
  return (
    <div className={s.baris}>
      <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
        <Ikon size={20} />
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul}>{judul}</span>
        <span className={s.redup} style={{ whiteSpace: "normal" }}>
          {ket}
        </span>
      </span>
    </div>
  );
}
