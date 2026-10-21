"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Landmark, LogOut, Plus, Wallet, X } from "lucide-react";
import { AppBar, Field, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import type { UserAccount } from "@/types/transaction";

type Kind = UserAccount["kind"];

const KIND: Record<Kind, { label: string; ikon: React.ElementType }> = {
  bank: { label: "Bank", ikon: Landmark },
  ewallet: { label: "E-wallet", ikon: Wallet },
  cash: { label: "Tunai", ikon: Banknote },
};

// Hanya nama kanoniknya. Variasi penulisan di rekening koran ("BRImo",
// "myBCA", "Livin") sudah ditangani tabel bawaan di src/lib/accounts.ts —
// bukan sesuatu yang perlu diurus user.
const PRESET: Array<{ name: string; kind: Kind }> = [
  { name: "BRI", kind: "bank" },
  { name: "BCA", kind: "bank" },
  { name: "Mandiri", kind: "bank" },
  { name: "BNI", kind: "bank" },
  { name: "SeaBank", kind: "bank" },
  { name: "Jago", kind: "bank" },
  { name: "ShopeePay", kind: "ewallet" },
  { name: "GoPay", kind: "ewallet" },
  { name: "DANA", kind: "ewallet" },
  { name: "OVO", kind: "ewallet" },
  { name: "Tunai", kind: "cash" },
];

/** Halaman Rekening: rekening & dompet milik user, lalu urusan akun. */
export default function UserAccountsCard({ email }: { email: string | null }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("bank");

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error: err } = await supabase
      .from("user_accounts")
      .select("id, user_id, name, kind, aliases")
      .order("kind")
      .order("name");

    if (err) setError(dbErrorMessage(err));
    else setAccounts((data ?? []) as UserAccount[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function tambah(entry: { name: string; kind: Kind }) {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error: err } = await supabase
      .from("user_accounts")
      .insert({ ...entry, aliases: [], user_id: userData.user.id });

    if (err) setError(dbErrorMessage(err, entry.name));
    else await load();
  }

  async function hapus(id: string) {
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.from("user_accounts").delete().eq("id", id);
    if (err) setError(dbErrorMessage(err));
    else await load();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const bersih = name.trim();
    if (!bersih) return;
    await tambah({ name: bersih, kind });
    setName("");
  }

  async function keluar() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const belumAda = PRESET.filter(
    (p) => !accounts.some((a) => a.name.toLowerCase() === p.name.toLowerCase()),
  );

  return (
    <>
      <AppBar judul="Rekening" sub={email ?? undefined} />

      <div className={s.isi}>
        <span className={s.redup} style={{ padding: "0 4px" }}>
          Biar pindah-pindah uang antar kantong sendiri nggak kehitung pengeluaran. Topup ShopeePay
          dari bank itu bukan belanja — uangnya cuma pindah tempat.
        </span>

        {error && <Pesan jenis="bahaya">{error}</Pesan>}

        <h2 className={s.subheader}>Rekening &amp; dompet saya</h2>
        <div className={s.blok}>
          {loading ? (
            <div className={s.blokIsi}>
              <Spinner label="Memuat..." />
            </div>
          ) : accounts.length === 0 ? (
            <div className={s.blokIsi}>
              <span className={s.redup}>
                Masih kosong. Pilih dari bawah — minimal bank sama e-wallet yang kamu pakai sehari-hari.
              </span>
            </div>
          ) : (
            accounts.map((a) => {
              const Ikon = KIND[a.kind].ikon;
              return (
                <div key={a.id} className={s.baris}>
                  <span className={s.barisIkon} aria-hidden>
                    <Ikon size={20} />
                  </span>
                  <span className={s.barisTeks}>
                    <span className={s.barisJudul}>{a.name}</span>
                    <span className={s.redup}>{KIND[a.kind].label}</span>
                  </span>
                  <button type="button" className={s.ikonTombol} aria-label={`Hapus ${a.name}`} onClick={() => void hapus(a.id)}>
                    <X size={20} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {belumAda.length > 0 && (
          <>
            <h2 className={s.subheader}>Tambah cepat</h2>
            <div className={s.chipsBungkus}>
              {belumAda.map((p) => (
                <button key={p.name} type="button" className={s.chip} onClick={() => void tambah(p)}>
                  <Plus size={16} /> {p.name}
                </button>
              ))}
            </div>
          </>
        )}

        <h2 className={s.subheader}>Nggak ada di daftar?</h2>
        <form onSubmit={handleSubmit} className={`${s.blok} ${s.blokIsi} ${s.form}`}>
          <Field label="Nama">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama bank atau dompetnya" />
          </Field>
          <Field label="Jenis">
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {Object.entries(KIND).map(([value, k]) => (
                <option key={value} value={value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={s.tombol} disabled={!name.trim()}>
            Tambah
          </button>
        </form>

        <h2 className={s.subheader}>Akun</h2>
        <div className={s.blok}>
          <button type="button" className={s.baris} onClick={() => void keluar()}>
            <span className={`${s.barisIkon} ${s.bahaya}`} aria-hidden>
              <LogOut size={20} />
            </span>
            <span className={`${s.barisJudul} ${s.bahaya}`}>Keluar</span>
          </button>
        </div>
      </div>
    </>
  );
}
