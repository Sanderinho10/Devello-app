import { ReferenceFiles } from "./ReferenceFiles";
import { supabaseServer } from "@/lib/supabase/server";
import type { ReferenceQuote } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReferansefilerPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("reference_quotes")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Referansefiler</h1>
          <p className="page-subtitle">
            Tidlegare tilbod, merka med type. Dette er fasiten agenten matchar mot
            når den foreslår tilbudstype.
          </p>
        </div>
      </div>

      <ReferenceFiles items={(data ?? []) as ReferenceQuote[]} />
    </>
  );
}
