"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Banner, Heading, Link, PageHeader } from "@primer/react";
import { Blankslate } from "@primer/react/experimental";
import { NoteIcon } from "@primer/octicons-react";
import { MenuCatat } from "@/components/Catat";
import KomposisiKategori from "@/components/KomposisiKategori";
import RingkasanBulan from "@/components/RingkasanBulan";
import TransactionList from "@/components/TransactionList";
import s from "@/components/ui.module.css";
import { namaBulan } from "@/lib/format";
import type { AvgMonthlyExpenseRow, Transaction } from "@/types/transaction";

export default function BerandaView({
  ringkasan,
  draft,
  terbaru,
  rerata,
  rerataError,
}: {
  ringkasan: { keluar: number; masuk: number; keluarBulanLalu: number };
  draft: number;
  terbaru: Transaction[];
  rerata: AvgMonthlyExpenseRow[];
  rerataError: string | null;
}) {
  const router = useRouter();
  const sekarang = new Date();

  return (
    <>
      <PageHeader>
        <PageHeader.TitleArea>
          <PageHeader.Title>Beranda</PageHeader.Title>
        </PageHeader.TitleArea>
        <PageHeader.Description>
          {namaBulan(sekarang)} {sekarang.getFullYear()}
        </PageHeader.Description>
        <PageHeader.Actions>
          <MenuCatat utama />
        </PageHeader.Actions>
      </PageHeader>

      <RingkasanBulan {...ringkasan} />

      {draft > 0 && (
        <Banner
          variant="warning"
          title={`${draft} transaksi perlu dibenerin`}
          description="Nominalnya belum kebaca, jadi belum ikut dihitung di ringkasan."
          primaryAction={
            <Banner.PrimaryAction onClick={() => router.push("/riwayat?filter=draft")}>
              Benerin
            </Banner.PrimaryAction>
          }
        />
      )}

      <section className={s.kotak}>
        <div className={s.kotakKepala}>
          <Heading as="h2" variant="small">
            Transaksi terbaru
          </Heading>
          {terbaru.length > 0 && (
            <Link as={NextLink} href="/riwayat">
              Lihat semua
            </Link>
          )}
        </div>
        {terbaru.length > 0 ? (
          <TransactionList items={terbaru} />
        ) : (
          <Blankslate>
            <Blankslate.Visual>
              <NoteIcon size="medium" />
            </Blankslate.Visual>
            <Blankslate.Heading>Belum ada transaksi</Blankslate.Heading>
            <Blankslate.Description>
              Tekan Catat buat mulai — dari foto struk, ketik, atau isi sendiri.
            </Blankslate.Description>
          </Blankslate>
        )}
      </section>

      <KomposisiKategori data={rerata} error={rerataError} />
    </>
  );
}
