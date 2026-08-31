import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hvor godt lært opp agenten er, som ett tall.
 *
 * Med vilje pessimistisk. En prosent som sier 100 mens tilbudene fortsatt må
 * rettes hver gang, er verre enn ingen prosent: den flytter skylden fra
 * datagrunnlaget til agenten, og da slutter folk å mate den. Derfor er kurven
 * lagd slik at man treffer omtrent 75 % av en enkeltdel når man når målet for
 * den — og må et godt stykke forbi for å nærme seg full pott.
 *
 * Prisfilen er ikke et ledd i summen, den er en port. Uten priser kan agenten
 * ikke prise noe som helst, uansett hvor mange referansefiler som ligger inne.
 * Da er tallet null, og det er det ærlige svaret.
 */

export interface Opplaering {
  /** 0–100. */
  prosent: number;
  /** Kort dom, til overskriften. */
  merkelapp: string;
  ledd: Ledd[];
  /** Det som løfter tallet mest akkurat nå. Tom når alt er på plass. */
  neste: string[];
}

export interface Ledd {
  navn: string;
  antall: number;
  /** Der kurven flater ut. Ikke et tak — man kan gjerne ha flere. */
  maal: number;
  /** Hvor mye leddet kan bidra med, i prosentpoeng. */
  vekt: number;
  oppnaadd: number;
}

/**
 * Metning: 0 ved ingenting, ~0,75 ved målet, aldri helt 1.
 *
 * Poenget med å aldri nå 1 er at det alltid finnes mer å lære. En agent som
 * har sett 25 tilbud er god; en som har sett 60 er bedre.
 */
function mett(antall: number, maal: number): number {
  if (antall <= 0) return 0;
  return 1 - Math.exp((-1.4 * antall) / maal);
}

export function regnOpplaering(tall: {
  prisrader: number;
  referansefiler: number;
  bekreftaTilbod: number;
  /** Tilbud brukeren rettet før de gikk ut. Der ligger det meste av signalet. */
  rettaTilbod: number;
  /** Hvor mange ulike nøkkelord referansene dekker. */
  ulikeTags: number;
}): Opplaering {
  const ledd: Ledd[] = [
    { navn: "Referansefiler", antall: tall.referansefiler, maal: 8, vekt: 30, oppnaadd: 0 },
    { navn: "Bekreftede tilbud", antall: tall.bekreftaTilbod, maal: 25, vekt: 45, oppnaadd: 0 },
    { navn: "Bredde i jobbtyper", antall: tall.ulikeTags, maal: 20, vekt: 15, oppnaadd: 0 },
    { navn: "Tilbud du har rettet", antall: tall.rettaTilbod, maal: 8, vekt: 10, oppnaadd: 0 },
  ];

  for (const l of ledd) l.oppnaadd = l.vekt * mett(l.antall, l.maal);

  // Porten. Uten prisrader er alt annet uten verdi, og halvveis prisfil gir
  // halvveis uttelling.
  const port = tall.prisrader === 0 ? 0 : 0.5 + 0.5 * mett(tall.prisrader, 60);
  const prosent = Math.round(ledd.reduce((s, l) => s + l.oppnaadd, 0) * port);

  return { prosent, merkelapp: merkelappFor(prosent, tall), ledd, neste: nesteSteg(tall) };
}

function merkelappFor(
  prosent: number,
  tall: { prisrader: number; bekreftaTilbod: number },
): string {
  if (tall.prisrader === 0) return "Mangler prisfil";
  if (prosent < 15) return "Så vidt i gang";
  if (prosent < 35) return "Lærer fortsatt";
  if (prosent < 60) return "Kommer seg";
  if (prosent < 80) return "Godt grunnlag";
  return "Solid grunnlag";
}

/**
 * Hva som løfter tallet mest, i rekkefølge.
 *
 * Et tall alene er til å bli motløs av. Det som gjør det til noe man kan
 * handle på, er linjen under: hva mangler, og hvor mye.
 */
function nesteSteg(tall: {
  prisrader: number;
  referansefiler: number;
  bekreftaTilbod: number;
  ulikeTags: number;
}): string[] {
  const steg: string[] = [];

  if (tall.prisrader === 0) {
    steg.push("Legg inn prisfilen. Uten priser kan ikke agenten prise noe.");
    return steg;
  }
  if (tall.prisrader < 20) {
    steg.push(`Prisfilen har ${tall.prisrader} rader. Flere rader gir færre poster den ikke finner.`);
  }
  if (tall.referansefiler < 8) {
    const mangler = 8 - tall.referansefiler;
    steg.push(
      `Last opp ${mangler} referansefil${mangler === 1 ? "" : "er"} til — gamle tilbud lærer den tonen og forbeholdene deres.`,
    );
  }
  if (tall.bekreftaTilbod < 25) {
    steg.push(
      `${tall.bekreftaTilbod} bekreftede tilbud så langt. Hvert tilbud dere sender gjør neste utkast bedre.`,
    );
  }
  if (tall.referansefiler >= 8 && tall.bekreftaTilbod >= 25 && tall.ulikeTags < 20) {
    steg.push("Grunnlaget er bredt nok i mengde, men smalt i jobbtyper. Ulike typer jobber teller mest nå.");
  }
  return steg;
}

/** Henter tallene og regner ut. Tenant-ID kommer alltid fra sesjonen. */
export async function opplaeringFor(
  admin: SupabaseClient,
  companyId: string,
): Promise<Opplaering> {
  const [{ data: lister }, { count: filer }, { data: referansar }] = await Promise.all([
    admin.from("price_lists").select("id").eq("company_id", companyId).eq("active", true),
    admin
      .from("reference_quotes")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    admin
      .from("quote_references")
      .select("tags, edited_by_user, draft_id")
      .eq("company_id", companyId),
  ]);

  const listIds = (lister ?? []).map((l) => l.id);
  const { count: prisrader } = listIds.length
    ? await admin
        .from("price_list_items")
        .select("id", { count: "exact", head: true })
        .in("price_list_id", listIds)
        .eq("active", true)
    : { count: 0 };

  const rader = referansar ?? [];
  const tags = new Set<string>();
  for (const r of rader) for (const t of (r.tags as string[]) ?? []) tags.add(t);

  return regnOpplaering({
    prisrader: prisrader ?? 0,
    referansefiler: filer ?? 0,
    // Bare bekreftede tilbud, ikke opplastede filer — de telles for seg.
    bekreftaTilbod: rader.filter((r) => r.draft_id).length,
    rettaTilbod: rader.filter((r) => r.draft_id && r.edited_by_user).length,
    ulikeTags: tags.size,
  });
}
