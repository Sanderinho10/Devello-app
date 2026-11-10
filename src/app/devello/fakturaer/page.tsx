import { FakturaAdmin, type AdminFaktura, type AdminSelskap } from "./FakturaAdmin";
import { finnPakke } from "@/lib/billing/katalog";
import { vurderTilgang } from "@/lib/billing/tilgang-regel";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Abonnementsfakturaene til alle selskapene, og hvor hvert selskap står.
 * Leses med service role — tabellen har ingen policy, og siden er bare for
 * Devello (sjekket i layouten).
 */
export default async function DevelloFakturaerPage() {
  const admin = supabaseAdmin();
  const [{ data: selskapRader }, { data: subs }, { data: fakturaRader }] = await Promise.all([
    admin.from("companies").select("id, name, trial_ends_at, abonnement_unntak").order("name"),
    admin.from("subscriptions").select("company_id, package_id, price_nok, billing_interval, cancel_at_period_end"),
    admin.from("devello_fakturaer").select("*").order("forfall", { ascending: false }),
  ]);

  const subAv = new Map((subs ?? []).map((s) => [s.company_id as string, s]));
  const navnAv = new Map((selskapRader ?? []).map((c) => [c.id as string, c.name as string]));
  const fakturaer = (fakturaRader ?? []) as Omit<AdminFaktura, "selskap">[];

  const selskaper: AdminSelskap[] = (selskapRader ?? []).map((c) => {
    const sub = subAv.get(c.id as string);
    const egne = fakturaer.filter((f) => f.company_id === c.id);
    const tilgang = vurderTilgang({
      unntak: Boolean(c.abonnement_unntak),
      harAbonnement: Boolean(sub),
      trialEndsAt: (c.trial_ends_at as string | null) ?? null,
      fakturaer: egne,
    });
    return {
      id: c.id as string,
      navn: c.name as string,
      pakke: sub ? (finnPakke(sub.package_id as string)?.name ?? (sub.package_id as string)) : null,
      prisNok: sub ? Number(sub.price_nok) : null,
      intervall: sub ? (sub.billing_interval === "aar" ? "aar" : "maanad") : null,
      sagtOpp: Boolean(sub?.cancel_at_period_end),
      grunn: tilgang.grunn,
      trialEndsAt: (c.trial_ends_at as string | null) ?? null,
      dagerIgjen: tilgang.ubetalt?.dagerIgjen ?? null,
      ubetaltSum: egne.filter((f) => !f.betalt_at).reduce((s, f) => s + Number(f.belop_nok), 0),
    };
  });

  // Neste nummer: ett over det høyeste rent numeriske, ellers 1001.
  const tall = fakturaer.map((f) => Number(f.fakturanr)).filter((n) => Number.isInteger(n) && n > 0);
  const nesteNr = String(tall.length ? Math.max(...tall) + 1 : 1001);

  return (
    <>
      <div className="page-header kompakt">
        <div>
          <h1>Abonnementsfakturaer</h1>
          <p className="page-subtitle">
            Fakturaene Devello sender kundene. Ubetalt etter forfall gir varsel i appen; 30 dager etter forfall
            sperres kontoen til fakturaen er markert betalt.
          </p>
        </div>
      </div>
      <FakturaAdmin
        fakturaer={fakturaer.map((f) => ({ ...f, selskap: navnAv.get(f.company_id) ?? "Ukjent selskap" }))}
        selskaper={selskaper}
        nesteNr={nesteNr}
        idag={new Date().toISOString().slice(0, 10)}
      />
    </>
  );
}
