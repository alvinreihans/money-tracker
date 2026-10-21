"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Banner,
  Button,
  FormControl,
  Heading,
  IconButton,
  Label,
  PageHeader,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
} from "@primer/react";
import { PlusIcon, TrashIcon } from "@primer/octicons-react";
import s from "@/components/ui.module.css";
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

/** Halaman Rekening: daftar rekening & dompet milik user. */
export default function UserAccountsCard({ email }: { email: string | null }) {
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
    <>
      <PageHeader>
        <PageHeader.TitleArea>
          <PageHeader.Title>Rekening</PageHeader.Title>
        </PageHeader.TitleArea>
        {email && <PageHeader.Description>{email}</PageHeader.Description>}
      </PageHeader>

      <Text className={s.redup}>
        Biar pindah-pindah uang antar kantong sendiri nggak kehitung pengeluaran. Topup ShopeePay
        dari bank itu bukan belanja — uangnya cuma pindah tempat.
      </Text>

      {error && <Banner variant="critical" title="Gagal" hideTitle description={error} />}

      <section className={s.kotak}>
        <div className={s.kotakKepala}>
          <Heading as="h2" variant="small">
            Rekening &amp; dompet saya
          </Heading>
        </div>
        {loading ? (
          <div className={`${s.kotakIsi} ${s.tengah}`}>
            <Spinner size="small" />
          </div>
        ) : accounts.length === 0 ? (
          <div className={s.kotakIsi}>
            <span className={s.redup}>
              Masih kosong. Pilih dari bawah — minimal bank sama e-wallet yang kamu pakai sehari-hari.
            </span>
          </div>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className={s.baris} style={{ alignItems: "center" }}>
              <Stack direction="horizontal" gap="condensed" align="center">
                <Text weight="semibold">{a.name}</Text>
                <Label>{KIND_LABEL[a.kind]}</Label>
              </Stack>
              <IconButton
                icon={TrashIcon}
                variant="invisible"
                size="small"
                aria-label={`Hapus ${a.name}`}
                onClick={() => void hapus(a.id)}
              />
            </div>
          ))
        )}
      </section>

      {belumAda.length > 0 && (
        <Stack gap="condensed">
          <Text weight="semibold">Pilih yang kamu pakai</Text>
          <Stack direction="horizontal" gap="condensed" wrap="wrap">
            {belumAda.map((p) => (
              <Button key={p.name} size="small" leadingVisual={PlusIcon} onClick={() => void tambah(p)}>
                {p.name}
              </Button>
            ))}
          </Stack>
        </Stack>
      )}

      <form onSubmit={handleSubmit}>
        <Stack gap="condensed">
          <div className={s.formGrid}>
            <FormControl>
              <FormControl.Label>Nggak ada di daftar?</FormControl.Label>
              <TextInput
                block
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ketik nama bank atau dompetnya"
              />
            </FormControl>
            <FormControl>
              <FormControl.Label>Jenis</FormControl.Label>
              <Select block value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {Object.entries(KIND_LABEL).map(([value, label]) => (
                  <Select.Option key={value} value={value}>
                    {label}
                  </Select.Option>
                ))}
              </Select>
            </FormControl>
          </div>
          <div>
            <Button type="submit" leadingVisual={PlusIcon} disabled={!name.trim()}>
              Tambah
            </Button>
          </div>
        </Stack>
      </form>
    </>
  );
}
