"use client";

import { useRouter } from "next/navigation";
import { PageHeader, SegmentedControl } from "@primer/react";
import { Blankslate } from "@primer/react/experimental";
import { InboxIcon } from "@primer/octicons-react";
import TransactionList from "@/components/TransactionList";
import s from "@/components/ui.module.css";
import type { Transaction } from "@/types/transaction";

const FILTER = [
  { id: "semua", label: "Semua" },
  { id: "keluar", label: "Keluar" },
  { id: "masuk", label: "Masuk" },
  { id: "pindah", label: "Pindah" },
  { id: "draft", label: "Perlu dibenerin" },
] as const;

/** Filter disimpan di URL, jadi tautan "Benerin" dari beranda langsung jatuh di sini. */
export default function RiwayatView({ filter, daftar }: { filter: string; daftar: Transaction[] }) {
  const router = useRouter();

  return (
    <>
      <PageHeader>
        <PageHeader.TitleArea>
          <PageHeader.Title>Riwayat</PageHeader.Title>
        </PageHeader.TitleArea>
        <PageHeader.Description>{daftar.length} transaksi tercatat di sini.</PageHeader.Description>
      </PageHeader>

      {/* Di layar sempit lima pilihan tidak muat sebaris, jadi Primer
          menggantinya dengan dropdown. */}
      <SegmentedControl
        aria-label="Saring transaksi"
        fullWidth={{ narrow: true, regular: false }}
        variant={{ narrow: "dropdown", regular: "default" }}
        onChange={(i) => {
          const id = FILTER[i].id;
          router.push(id === "semua" ? "/riwayat" : `/riwayat?filter=${id}`);
        }}
      >
        {FILTER.map((f) => (
          <SegmentedControl.Button key={f.id} selected={filter === f.id}>
            {f.label}
          </SegmentedControl.Button>
        ))}
      </SegmentedControl>

      <section className={s.kotak}>
        {daftar.length > 0 ? (
          <TransactionList items={daftar} />
        ) : (
          <Blankslate>
            <Blankslate.Visual>
              <InboxIcon size="medium" />
            </Blankslate.Visual>
            <Blankslate.Heading>
              {filter === "draft" ? "Nggak ada yang perlu dibenerin" : "Belum ada transaksi di sini"}
            </Blankslate.Heading>
            {filter === "draft" && <Blankslate.Description>Aman.</Blankslate.Description>}
          </Blankslate>
        )}
      </section>
    </>
  );
}
