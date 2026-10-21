import UserAccountsCard from "@/components/UserAccountsCard";
import { ContentLayout, Header } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RekeningPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <ContentLayout
      header={
        <Header variant="h1" description={user?.email}>
          Rekening
        </Header>
      }
    >
      <UserAccountsCard />
    </ContentLayout>
  );
}
