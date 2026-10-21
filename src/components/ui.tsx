"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { spaceScaledL, spaceScaledXxl } from "@cloudscape-design/design-tokens";
import BreadcrumbGroup, {
  type BreadcrumbGroupProps,
} from "@cloudscape-design/components/breadcrumb-group";
import Button, { type ButtonProps } from "@cloudscape-design/components/button";
import Link, { type LinkProps } from "@cloudscape-design/components/link";

/**
 * Pintu masuk komponen Cloudscape untuk Server Component.
 *
 * Komponen Cloudscape memakai hook, jadi hanya bisa jalan di client. Lewat
 * re-export di berkas "use client" ini, halaman server tetap bisa memakainya
 * langsung selama props-nya bisa diserialisasi (tanpa fungsi).
 */
export { default as Alert } from "@cloudscape-design/components/alert";
export { default as Badge } from "@cloudscape-design/components/badge";
export { default as Box } from "@cloudscape-design/components/box";
export { default as ColumnLayout } from "@cloudscape-design/components/column-layout";
export { default as Container } from "@cloudscape-design/components/container";
export { default as ContentLayout } from "@cloudscape-design/components/content-layout";
export { default as ExpandableSection } from "@cloudscape-design/components/expandable-section";
export { default as Header } from "@cloudscape-design/components/header";
export { default as KeyValuePairs } from "@cloudscape-design/components/key-value-pairs";
export { default as SpaceBetween } from "@cloudscape-design/components/space-between";
export { default as StatusIndicator } from "@cloudscape-design/components/status-indicator";

type FollowHandler = NonNullable<LinkProps["onFollow"]>;

const tanpaLangganan = () => () => {};

/**
 * false saat render di server dan saat hydrate, true sesudahnya. Untuk bagian
 * yang hasilnya bergantung pada browser (lebar layar, ukuran chart), supaya
 * HTML server dan render pertama di browser tetap sama persis.
 */
export function useTerpasang(): boolean {
  return useSyncExternalStore(tanpaLangganan, () => true, () => false);
}

/**
 * Tautan Cloudscape berupa <a> biasa, jadi tiap klik memuat ulang halaman
 * penuh. Ini mengalihkannya ke router Next. Klik dengan Ctrl/Cmd atau tombol
 * tengah tidak memicu onFollow, jadi "buka di tab baru" tetap jalan.
 */
export function useIkuti(): FollowHandler {
  const router = useRouter();
  return useCallback<FollowHandler>(
    (e) => {
      if (e.detail.external || !e.detail.href) return;
      e.preventDefault();
      router.push(e.detail.href);
    },
    [router],
  );
}

export function NavLink(props: Omit<LinkProps, "onFollow">) {
  return <Link {...props} onFollow={useIkuti()} />;
}

export function NavButton(props: Omit<ButtonProps, "onFollow">) {
  return <Button {...props} onFollow={useIkuti()} />;
}

export function Breadcrumbs({ items }: { items: BreadcrumbGroupProps.Item[] }) {
  return <BreadcrumbGroup items={items} onFollow={useIkuti()} />;
}

/**
 * Halaman tanpa navigasi (masuk, password baru): satu kolom form di tengah.
 *
 * Sengaja tanpa AppLayout. AppLayout baru tahu lebar layar setelah sampai di
 * browser, jadi HTML dari server (diasumsikan desktop) selalu beda dengan
 * hasil render di HP — React memperingatkan hydration mismatch. Halaman tanpa
 * navigasi tidak butuh apa pun dari AppLayout.
 */
export function HalamanPolos({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: `0 ${spaceScaledL} ${spaceScaledXxl}` }}>
      {children}
    </main>
  );
}
