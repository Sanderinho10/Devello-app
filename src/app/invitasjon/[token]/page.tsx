import Link from "next/link";
import { AcceptInvite } from "./AcceptInvite";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Merke } from "@/components/Merke";

export const dynamic = "force-dynamic";

/**
 * «Du er invitert» — der kollegaen setter passordet sitt.
 *
 * Siden er åpen og gjør ingenting av seg selv. Den slår opp invitasjonen og
 * viser et skjema; først når skjemaet sendes, skjer det noe. Det er med vilje:
 * e-postskannere i Microsoft 365 henter lenker automatisk, og en lenke som
 * brukes opp av et GET er en lenke mottakeren aldri får brukt.
 */
export default async function InvitasjonPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = supabaseAdmin();

  const { data: invite } = await admin
    .from("invitations")
    .select("email, role, expires_at, token_used_at, companies(name)")
    .eq("token", token)
    .maybeSingle();

  // Supabase typer en innerjoin som array; her er det alltid null eller én.
  const firma = invite?.companies as unknown as { name: string } | { name: string }[] | null;
  const selskap =
    (Array.isArray(firma) ? firma[0]?.name : firma?.name) ?? "selskapet";
  const utgaatt = invite ? new Date(invite.expires_at) < new Date() : false;

  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card">
        <div className="brand" style={{ padding: "0 0 20px" }}>
          <Merke size={24} /> Devello
        </div>

        {!invite ? (
          <Beskjed
            tittel="Fant ikke invitasjonen"
            tekst="Lenken er ikke gyldig. Be den som inviterte deg om en ny."
          />
        ) : invite.token_used_at ? (
          <Beskjed
            tittel="Allerede i bruk"
            tekst="Passordet er satt fra før. Logg inn med e-postadressen din."
          />
        ) : utgaatt ? (
          <Beskjed
            tittel="Invitasjonen har gått ut"
            tekst="Invitasjoner varer i to uker. Be om en ny, så er du i gang."
          />
        ) : (
          <AcceptInvite token={token} email={invite.email} selskap={selskap} />
        )}
      </div>
    </div>
  );
}

function Beskjed({ tittel, tekst }: { tittel: string; tekst: string }) {
  return (
    <>
      <h2>{tittel}</h2>
      <p className="muted" style={{ margin: "8px 0 18px" }}>
        {tekst}
      </p>
      <p className="muted tiny">
        <Link href="/login" style={{ textDecoration: "underline" }}>
          Til innlogging
        </Link>
      </p>
    </>
  );
}
