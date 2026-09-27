import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hvor ofte firmaet faktisk har brukt hver prisrad.
 *
 * Problemet dette løser: Star Elektro har 241 aktive punktpriser, og flere av
 * dem er plausible svar på samme forespørsel. «8 doble stikkontaktar» kan
 * peke på «Montering av dobbel stikkontakt» (890), «Punkt for Stikkontakt»
 * (775), «Punkt for stikk over benk» (775) eller «4-veis stikkontakt» (953).
 * Agenten velger på navnet alene, og navnet skiller dem ikke.
 *
 * Men firmaet har allerede svart på spørsmålet: de har brukt én av dem, seks
 * ganger. Det er et sterkere signal enn noe agenten kan resonnere seg fram
 * til, og det koster noen få tegn per rad i prompten — mot en begrunnelse per
 * post, som ville kostet et avsnitt per linje i hvert eneste tilbud.
 *
 * Telles fra den ENDELIGE versjonen, ikke agentens utkast: en rad teller først
 * når et menneske lot den stå i det som ble sendt. Ellers ville agenten talt
 * sine egne valg som bevis for at de var riktige.
 */

export interface RadBruk {
  antall: number;
  /** ISO-dato for siste gang raden sto i et sendt tilbud. */
  sist: string;
}

export type Brukshistorikk = Record<string, RadBruk>;

/**
 * Leser bruken fra de bekreftede tilbudene.
 *
 * Feiler spørringen, er det ikke verdt å stoppe en generering for: uten
 * historikken oppfører agenten seg som før, og det er nøyaktig situasjonen en
 * ny kunde er i uansett.
 */
export async function hentBrukshistorikk(
  admin: SupabaseClient,
  companyId: string,
): Promise<Brukshistorikk> {
  try {
    const { data, error } = await admin.rpc("prisrad_bruk", { p_company_id: companyId });
    if (error) throw new Error(error.message);
    const ut: Brukshistorikk = {};
    for (const rad of (data ?? []) as { price_item_id: string; antall: number; sist: string }[]) {
      if (!rad.price_item_id) continue;
      ut[rad.price_item_id] = { antall: Number(rad.antall), sist: String(rad.sist).slice(0, 10) };
    }
    return ut;
  } catch (err) {
    console.warn("henting av prisradbruk feilet:", err instanceof Error ? err.message : err);
    return {};
  }
}

/**
 * Linjen som henges på en prisrad i prompten, eller null når raden aldri har
 * vært brukt.
 *
 * Ubrukte rader får ingenting med vilje. Hos Star Elektro er det over 200 av
 * dem, og «brukt: 0 ganger» på hver ville doblet lengden på den delen av
 * prompten uten å si noe nytt — fraværet av et tall er selv opplysningen.
 */
export function bruksnotat(bruk: RadBruk | undefined): string | null {
  if (!bruk || bruk.antall < 1) return null;
  return bruk.antall === 1
    ? `  BRUKT: 1 gang i et sendt tilbud (${bruk.sist})`
    : `  BRUKT: ${bruk.antall} ganger i sendte tilbud, sist ${bruk.sist}`;
}

/**
 * Setningen som forklarer tallene, plassert rett over prislisten.
 *
 * Formulert som et hint, ikke en regel: en rad firmaet har brukt seks ganger
 * er nesten alltid riktig svar på samme spørsmål igjen, men en ny jobb kan
 * kreve en rad de aldri har hatt bruk for før, og da skal den kunne velges
 * uten at agenten føler den bryter en instruks.
 */
export function bruksforklaring(bruk: Brukshistorikk): string {
  const brukte = Object.values(bruk).filter((b) => b.antall > 0).length;
  if (brukte === 0) return "";
  return [
    "",
    `Merk: ${brukte} av radene under er merket BRUKT. Det betyr at firmaet`,
    "har hatt dem med i et tilbud de faktisk sendte. Er flere rader like",
    "gode svar på det kunden spør om, velg den de har brukt før — og den de",
    "har brukt oftest. En rad uten merke er ikke feil, men den er et valg du",
    "må kunne forsvare på annet grunnlag enn navnet.",
  ].join("\n");
}
