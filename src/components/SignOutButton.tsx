"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { IconKeluar } from "@/components/icons";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground transition hover:bg-secondary"
    >
      <IconKeluar />
      Keluar
    </button>
  );
}
