"use client";

import { useRouter } from "next/navigation";
import SegmentedControl, {
  type SegmentedControlProps,
} from "@cloudscape-design/components/segmented-control";

/** Filter disimpan di URL, jadi tautan "Benerin" dari beranda langsung jatuh di sini. */
export default function FilterRiwayat({
  aktif,
  options,
}: {
  aktif: string;
  options: SegmentedControlProps.Option[];
}) {
  const router = useRouter();
  return (
    <SegmentedControl
      label="Saring transaksi"
      selectedId={aktif}
      options={options}
      onChange={(e) =>
        router.push(e.detail.selectedId === "semua" ? "/riwayat" : `/riwayat?filter=${e.detail.selectedId}`)
      }
    />
  );
}
