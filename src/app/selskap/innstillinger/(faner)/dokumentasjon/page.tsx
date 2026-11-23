import { KrevOrdre } from "../_deler/OrdreSjekk";
import { Signaturer } from "../_deler/Signaturer";
import { hentSignaturer } from "@/lib/dokumentasjon/signatur";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Signaturene samsvarserklæringen godkjennes med. Administrator legger dem
 * inn — tegnet på skjermen eller lastet opp — og knytter dem til brukeren
 * som skal kunne signere med dem.
 */
export default async function DokumentasjonInnstillinger() {
  const session = await currentSession();
  const supabase = await supabaseServer();
  const { data: me } = await supabase.from("users").select("role").eq("id", session!.userId).single();
  const erAdmin = me?.role === "admin";
  const [signaturer, kolleger] = await Promise.all([
    hentSignaturer(supabaseAdmin(), session!.companyId, session!.userId, erAdmin).catch(() => []),
    brukereISelskap(supabase, session!.companyId),
  ]);

  return (
    <KrevOrdre>
      <Signaturer
        signaturer={signaturer}
        kolleger={kolleger
          .map((k) => ({ id: k.id, navn: k.full_name?.trim() || k.email }))
          .sort((a, b) => a.navn.localeCompare(b.navn, "nb"))}
        erAdmin={erAdmin}
      />
    </KrevOrdre>
  );
}
