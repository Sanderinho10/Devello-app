import { Members } from "./Members";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { Invitation, Member } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MedlemmerPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    // Alle med medlemskap i selskapet, også de som akkurat nå står i et
    // annet — og med rollen de har her.
    brukereISelskap(supabase, session!.companyId).then((data) => ({
      data: data.sort((x, y) => (x.role === y.role ? x.email.localeCompare(y.email) : x.role === "admin" ? -1 : 1)),
    })),
    supabase
      .from("invitations")
      .select("id, email, fornavn, etternavn, role, accepted_at, expires_at, created_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const me = (members ?? []).find((member) => member.id === session!.userId);

  return (
    <>
      <div className="page-header kompakt">
        <div>
          <h1>Medlemmer</h1>
          <p className="page-subtitle">Hvem som har tilgang, og hvilke invitasjoner som står ute.</p>
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
