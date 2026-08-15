import { Members } from "./Members";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { Invitation, Member } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MedlemmerPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, role")
      .eq("company_id", session!.companyId)
      .order("role")
      .order("email"),
    supabase
      .from("invitations")
      .select("id, email, role, accepted_at, expires_at, created_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const me = (members ?? []).find((member) => member.id === session!.userId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Medlemmer</h1>
          <p className="page-subtitle">
            Hvem som har tilgang, og hvilke invitasjoner som står ute.
          </p>
        </div>
      </div>

      <Members
        members={(members ?? []) as Member[]}
        invitations={(invitations ?? []) as Invitation[]}
        isAdmin={me?.role === "admin"}
      />
    </>
  );
}
