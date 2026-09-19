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
    <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">
          Rekening &amp; Dompet Saya
        </h3>
        <p className="text-sm text-slate-500">
          Biar pindah-pindah uang antar kantong sendiri nggak kehitung
          pengeluaran. Topup ShopeePay dari bank itu bukan belanja — uangnya
          cuma pindah tempat.
        </p>
      </div>

      <div className="space-y-5 p-6 pt-0">
        {loading ? (
          <p className="text-sm text-slate-400">Memuat...</p>
        ) : accounts.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Masih kosong. Pilih dari bawah — minimal bank sama e-wallet yang kamu
            pakai sehari-hari.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">
                    {a.name}
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {KIND_LABEL[a.kind]}
                  </span>
                </div>
                <button
                  onClick={() => void hapus(a.id)}
                  className="shrink-0 text-xs text-slate-400 transition hover:text-red-600"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        )}

        {belumAda.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">
              Pilih yang kamu pakai
            </p>
            <div className="flex flex-wrap gap-2">
              {belumAda.map((p) => (
                <button
                  key={p.name}
                  onClick={() => void tambah(p)}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 transition hover:border-slate-900 hover:bg-slate-50"
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
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Nggak ada di daftar?
            </label>
            <input
              id="nama-rekening"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ketik nama bank atau dompetnya"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
            />
          </div>
          <div>
            <label
              htmlFor="jenis-rekening"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Jenis
            </label>
            <select
              id="jenis-rekening"
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
            >
              <option value="bank">Bank</option>
              <option value="ewallet">E-wallet</option>
              <option value="cash">Tunai</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            Tambah
          </button>
        </form>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
