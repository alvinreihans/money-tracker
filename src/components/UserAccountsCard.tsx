"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import TokenGroup from "@cloudscape-design/components/token-group";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import type { UserAccount } from "@/types/transaction";

type Kind = UserAccount["kind"];

const KIND_LABEL: Record<Kind, string> = {
  bank: "Bank",
  ewallet: "E-wallet",
  cash: "Tunai",
};

const OPSI_KIND = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }));

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
    <Container
      header={
        <Header
          variant="h2"
          description="Biar pindah-pindah uang antar kantong sendiri nggak kehitung pengeluaran. Topup ShopeePay dari bank itu bukan belanja — uangnya cuma pindah tempat."
        >
          Rekening &amp; dompet saya
        </Header>
      }
    >
      <SpaceBetween size="l">
        {loading ? (
          <StatusIndicator type="loading">Memuat...</StatusIndicator>
        ) : accounts.length === 0 ? (
          <Alert type="info">
            Masih kosong. Pilih dari bawah — minimal bank sama e-wallet yang kamu pakai sehari-hari.
          </Alert>
        ) : (
          <TokenGroup
            items={accounts.map((a) => ({
              label: a.name,
              description: KIND_LABEL[a.kind],
              dismissLabel: `Hapus ${a.name}`,
            }))}
            onDismiss={(e) => void hapus(accounts[e.detail.itemIndex].id)}
          />
        )}

        {belumAda.length > 0 && (
          <FormField label="Pilih yang kamu pakai">
            <SpaceBetween direction="horizontal" size="xs">
              {belumAda.map((p) => (
                <Button key={p.name} iconName="add-plus" onClick={() => void tambah(p)}>
                  {p.name}
                </Button>
              ))}
            </SpaceBetween>
          </FormField>
        )}

        <form onSubmit={handleSubmit}>
          <SpaceBetween size="s">
            <ColumnLayout columns={2}>
              <FormField stretch label="Nggak ada di daftar?">
                <Input
                  value={name}
                  onChange={(e) => setName(e.detail.value)}
                  placeholder="Ketik nama bank atau dompetnya"
                />
              </FormField>
              <FormField stretch label="Jenis">
                <Select
                  selectedOption={OPSI_KIND.find((o) => o.value === kind) ?? null}
                  onChange={(e) => setKind(e.detail.selectedOption.value as Kind)}
                  options={OPSI_KIND}
                />
              </FormField>
            </ColumnLayout>
            <Button iconName="add-plus" formAction="submit" disabled={!name.trim()}>
              Tambah
            </Button>
          </SpaceBetween>
        </form>

        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Container>
  );
}
