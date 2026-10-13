import { Opplaeringskort } from "./Opplaering";
import { ReferenceFiles } from "./ReferenceFiles";
import { opplaeringFor } from "@/lib/opplaering/status";
import { indekserteFiler } from "@/lib/referanser/les-og-indekser";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { ReferenceQuote } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReferansefilerPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data }, opplaering, indeksert] = await Promise.all([
    supabase
      .from("reference_quotes")
      .select("*")
      .order("created_at", { ascending: false }),
    // Referanselisten ligger bak service role — tabellen har ingen policy for
    // authenticated. Selskapet kommer fra sesjonen, aldri fra klienten.
    opplaeringFor(supabaseAdmin(), session!.companyId),
    // «Lest» og «i bruk» er to ting: teksten kan ligge i kolonnen uten at fila
    // har kommet inn i den søkbare poolen. Listen skal vise forskjellen.
    indekserteFiler(supabaseAdmin(), session!.companyId),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Referansefiler</h1>
          <p className="page-subtitle">
            Tidligere tilbud, merket med type. Dette er fasiten agenten matcher mot
            når den foreslår tilbudstype.
          </p>
        </div>
      </div>

      <Opplaeringskort status={opplaering} />

      <ReferenceFiles
        items={(data ?? []) as ReferenceQuote[]}
        indekserteIder={[...indeksert]}
      />
    </>
  );
}
