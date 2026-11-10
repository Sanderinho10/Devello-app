import { TilbakemeldingListe, type AdminTilbakemelding } from "./TilbakemeldingListe";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Det kundene har sendt med «Gi tilbakemelding». Leses med service role —
 * tabellen har ingen policy, og siden er bare for Devello (sjekket i layouten).
 */
export default async function DevelloTilbakemeldingerPage() {
  const { data, error } = await supabaseAdmin()
    .from("devello_tilbakemeldinger")
    .select("id, epost, selskap, type, melding, side, epost_sendt, behandlet_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <>
      <div className="page-header kompakt">
        <div>
          <h1>Tilbakemeldinger</h1>
          <p className="page-subtitle">
            Det kundene har sendt fra «Gi tilbakemelding» i menyen. Svar på e-posten du fikk, og marker den behandlet her.
          </p>
        </div>
      </div>
      {error ? (
        <div className="banner error">Kunne ikke hente tilbakemeldingene: {error.message}</div>
      ) : (
        <TilbakemeldingListe rader={(data ?? []) as AdminTilbakemelding[]} />
      )}
    </>
  );
}
