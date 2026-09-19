"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import type { UserAccount } from "@/types/transaction";

type Kind = UserAccount["kind"];

const KIND_LABEL: Record<Kind, string> = {
  bank: "Bank",
  ewallet: "E-wallet",
  cash: "Tunai",
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

export default function UserAccountsCard() {
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

  const belumAda = PRESET.filter(
    (p) => !accounts.some((a) => a.name.toLowerCase() === p.name.toLowerCase()),
  );

  return (
    <div className="w-full rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          Rekening &amp; Dompet Saya
        </h3>
        <p className="text-sm text-muted-foreground">
          Biar pindah-pindah uang antar kantong sendiri nggak kehitung
          pengeluaran. Topup ShopeePay dari bank itu bukan belanja — uangnya
          cuma pindah tempat.
        </p>
      </div>

      <div className="space-y-5 p-6 pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : accounts.length === 0 ? (
          <p className="rounded-md bg-[rgba(245,110,15,0.14)] px-3 py-2.5 text-sm text-[var(--accent)]">
            Masih kosong. Pilih dari bawah — minimal bank sama e-wallet yang kamu
            pakai sehari-hari.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {a.name}
                  </span>
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                    {KIND_LABEL[a.kind]}
                  </span>
                </div>
                <button
                  onClick={() => void hapus(a.id)}
                  className="-my-2 flex min-h-11 shrink-0 items-center px-2 text-xs text-muted-foreground transition hover:text-[var(--danger)]"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        )}

        {belumAda.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Pilih yang kamu pakai
            </p>
            <div className="flex flex-wrap gap-2">
              {belumAda.map((p) => (
                <button
                  key={p.name}
                  onClick={() => void tambah(p)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-foreground transition hover:border-[var(--ring)] hover:bg-secondary"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <label
              htmlFor="nama-rekening"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Nggak ada di daftar?
            </label>
            <input
              id="nama-rekening"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ketik nama bank atau dompetnya"
              className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
          <div>
            <label
              htmlFor="jenis-rekening"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Jenis
            </label>
            <select
              id="jenis-rekening"
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              className="rounded-md border border-border px-2.5 py-1.5 text-sm outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="bank">Bank</option>
              <option value="ewallet">E-wallet</option>
              <option value="cash">Tunai</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            Tambah
          </button>
        </form>

        {error && (
          <p className="rounded-md bg-[rgba(255,107,91,0.14)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
        )}
      </div>
    </div>
  );
}
