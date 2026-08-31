import type { SupabaseClient } from "@supabase/supabase-js";
import { forbeholdsBibliotek } from "@/lib/referanser/forbehold";

/**
 * Hvor godt lært opp agenten er, som ett tall — bygget på det vi kan MÅLE,
 * ikke på hvor mye som er lastet opp.
 *
 * To lag, med et tak på hver:
 *
 *   Grunnlag (inntil 40 av 100)  Det agenten har å jobbe med: bredde i
 *                                jobbtyper, nok materiale til at søket
 *                                treffer, og et forbeholdsbibliotek.
 *
 *   Utfall  (inntil 60 av 100)   Hvordan de siste tilbudene faktisk gikk:
 *                                hvor mange som gikk ut uten retting, hvor
 *                                ofte prisfilen dekket alt, hvor ofte
 *                                agenten fant referanser å støtte seg på.
 *
 * Fordelingen er selve poenget. Et fullt bibliotek beviser ingenting — det
 * er de 60 utfallspoengene som sier om agenten faktisk leverer, og de kan
 * bare tjenes gjennom ekte tilbud. Før noe er sendt, er taket 40, uansett
 * hvor mye som er lastet opp. En prosent som kan nå 100 på opplasting alene
 * er markedsføring, ikke måling.
 *
 * Grunnlaget måler BREDDE foran volum. Generering leser maks 5 referanser
 * (sok_referanser, tak 8), så tilbud nummer 200 gjør ikke nummer 201 bedre —
 * med mindre det dekker en jobbtype agenten ikke hadde. Derfor teller ulike
 * nøkkelord mer enn antall rader.
 *
 * Prisfilen er fortsatt en port, ikke et ledd: uten priser kan agenten ikke
 * prise noe, og da er tallet null uansett.
 */

export interface Opplaering {
  /** 0–100. */
  prosent: number;
  /** Kort dom, til overskriften. */
  merkelapp: string;
  grunnlag: Ledd[];
  utfall: UtfallLedd[];
  /** Hvor mange tilbud utfallet er målt på. 0 = ikke målt ennå. */
  maaltPaaBekrefta: number;
  maaltPaaUtkast: number;
  /** Det som løfter tallet mest akkurat nå. */
  neste: string[];
}

export interface Ledd {
  navn: string;
  antall: number;
  /** Der kurven flater ut. Ikke et tak — mer hjelper alltid litt. */
  maal: number;
  vekt: number;
  oppnaadd: number;
}

export interface UtfallLedd {
  navn: string;
  /** «7 av 10». Null før noe er målt. */
  treff: number;
  av: number;
  vekt: number;
  oppnaadd: number;
}

/** Metning: 0 ved ingenting, ~0,75 ved målet, aldri helt 1. */
function mett(antall: number, maal: number): number {
  if (antall <= 0) return 0;
  return 1 - Math.exp((-1.4 * antall) / maal);
}

export interface OpplaeringsTal {
  prisrader: number;
  referansefiler: number;
  bekreftaTilbod: number;
  /** Ulike nøkkelord på tvers av referansene. Bredden søket kan treffe i. */
  ulikeTags: number;
  /** Forbehold i biblioteket. Uten dem kan ikke agenten ta forbehold. */
  forbehold: number;
  /**
   * De siste bekreftede tilbudene (nyest først, inntil 10): gikk de ut uten
   * at innholdet ble rettet? Prisoverstyringer teller IKKE som retting —
   * prisen er en menneskelig avgjørelse per jobb, og agenten skal aldri
   * lære av den. En rad med edited_by_user men tom edit_summary er nettopp
   * det: bare pris.
   */
  sisteUroerte: boolean[];
  /** De siste genererte utkastene (inntil 10): dekket prisfilen alt? */
  sisteFullDekning: boolean[];
  /** Samme utkast: fant agenten referanser å støtte seg på? (confidence hoeg) */
  sisteMedTreff: boolean[];
}

export function regnOpplaering(tal: OpplaeringsTal): Opplaering {
  // --- Grunnlag: inntil 40 poeng --------------------------------------------
  const grunnlag: Ledd[] = [
    // Bredden er hovedaksen. 15 ulike nøkkelord dekker de vanligste jobbene
    // en elektriker møter; søket henter likevel bare de 5 beste per lead.
    { navn: "Bredde i jobbtyper", antall: tal.ulikeTags, maal: 15, vekt: 20, oppnaadd: 0 },
    // Nok materiale til at søket har noe å treffe. Filer og bekreftede tilbud
    // teller likt her — begge ligger i samme søkbare pool.
    {
      navn: "Referanser i alt",
      antall: tal.referansefiler + tal.bekreftaTilbod,
      maal: 10,
      vekt: 12,
      oppnaadd: 0,
    },
    // Forbehold kan bare velges fra biblioteket. Er det tomt, kan ikke
    // agenten ta ett eneste forbehold — se lib/referanser/forbehold.ts.
    { navn: "Forbehold i biblioteket", antall: tal.forbehold, maal: 5, vekt: 8, oppnaadd: 0 },
  ];
  for (const l of grunnlag) l.oppnaadd = l.vekt * mett(l.antall, l.maal);

  // --- Utfall: inntil 60 poeng, som må TJENES -------------------------------
  //
  // Hvert ledd er en andel av de siste tilbudene, dempet av hvor mange de er
  // målt på. To plettfrie tilbud beviser lite; ti gjør det ikke helt heller.
  // Dempingen er pessimismen: poeng som ikke er demonstrert, deles ikke ut.
  const uroert = rate(tal.sisteUroerte);
  const dekning = rate(tal.sisteFullDekning);
  const treff = rate(tal.sisteMedTreff);

  const wBekrefta = mett(tal.sisteUroerte.length, 8);
  const wUtkast = mett(tal.sisteFullDekning.length, 8);

  const utfall: UtfallLedd[] = [
    {
      navn: "Gikk ut uten retting",
      treff: tel(tal.sisteUroerte),
      av: tal.sisteUroerte.length,
      vekt: 30,
      oppnaadd: 30 * uroert * wBekrefta,
    },
    {
      navn: "Prisfilen dekket alt",
      treff: tel(tal.sisteFullDekning),
      av: tal.sisteFullDekning.length,
      vekt: 18,
      oppnaadd: 18 * dekning * wUtkast,
    },
    {
      navn: "Fant referanser å bygge på",
      treff: tel(tal.sisteMedTreff),
      av: tal.sisteMedTreff.length,
      vekt: 12,
      oppnaadd: 12 * treff * wUtkast,
    },
  ];

  // Porten. Uten prisrader er alt annet uten verdi.
  const port = tal.prisrader === 0 ? 0 : 0.5 + 0.5 * mett(tal.prisrader, 60);

  const sum =
    grunnlag.reduce((s, l) => s + l.oppnaadd, 0) +
    utfall.reduce((s, l) => s + l.oppnaadd, 0);
  const prosent = Math.max(0, Math.min(100, Math.round(sum * port)));

  return {
    prosent,
    merkelapp: merkelappFor(prosent, tal),
    grunnlag,
    utfall,
    maaltPaaBekrefta: tal.sisteUroerte.length,
    maaltPaaUtkast: tal.sisteFullDekning.length,
    neste: nesteSteg(tal, { uroert }),
  };
}

function tel(liste: boolean[]): number {
  return liste.filter(Boolean).length;
}

function rate(liste: boolean[]): number {
  return liste.length === 0 ? 0 : tel(liste) / liste.length;
}

function merkelappFor(prosent: number, tal: OpplaeringsTal): string {
  if (tal.prisrader === 0) return "Mangler prisfil";
  // Før noe er bekreftet er tallet et løfte, ikke en måling. Si det.
  if (tal.sisteUroerte.length === 0) {
    return prosent < 15 ? "Så vidt i gang" : "Grunnlag på plass — ikke målt ennå";
  }
  if (prosent < 15) return "Så vidt i gang";
  if (prosent < 35) return "Lærer fortsatt";
  if (prosent < 55) return "Kommer seg";
  if (prosent < 75) return "Leverer oftere enn ikke";
  return "Leverer jevnt";
}

/** Hva som løfter tallet mest, i rekkefølge. */
function nesteSteg(tal: OpplaeringsTal, malt: { uroert: number }): string[] {
  const steg: string[] = [];

  if (tal.prisrader === 0) {
    return ["Legg inn prisfilen. Uten priser kan ikke agenten prise noe."];
  }

  if (tal.forbehold < 3) {
    steg.push(
      "Forbeholdsbiblioteket er nesten tomt. Agenten kan bare ta forbehold den " +
        "har sett før — last opp tilbud der forbeholdene deres står.",
    );
  }
  if (tal.ulikeTags < 15) {
    steg.push(
      "Bredden teller mest: referanser fra ulike typer jobber løfter mer enn " +
        "flere av samme sort.",
    );
  }
  if (tal.sisteUroerte.length < 8) {
    steg.push(
      `Utfallsdelen — 60 av 100 poengene — låses opp av ekte tilbud. ` +
        `${tal.sisteUroerte.length === 0 ? "Ingen" : `Bare ${tal.sisteUroerte.length}`} ` +
        `bekreftet så langt.`,
    );
  } else if (malt.uroert < 0.7) {
    steg.push(
      "Utkastene rettes fortsatt ofte. Det er dette tallet som må opp — og det " +
        "stiger med bredere referanser og et rikere forbeholdsbibliotek, ikke " +
        "med flere av det samme.",
    );
  }
  return steg;
}

/** Henter tallene og regner ut. Tenant-ID kommer alltid fra sesjonen. */
export async function opplaeringFor(
  admin: SupabaseClient,
  companyId: string,
): Promise<Opplaering> {
  const [{ data: lister }, { count: filer }, { data: referansar }, forbehold, { data: utkast }] =
    await Promise.all([
      admin.from("price_lists").select("id").eq("company_id", companyId).eq("active", true),
      admin
        .from("reference_quotes")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId),
      admin
        .from("quote_references")
        .select("tags, edited_by_user, edit_summary, draft_id, confirmed_at")
        .eq("company_id", companyId)
        .order("confirmed_at", { ascending: false }),
      // Samme bibliotek som genereringen bruker — måler vi noe annet enn det
      // agenten faktisk får, måler vi feil ting.
      forbeholdsBibliotek(admin, companyId),
      admin
        .from("drafts")
        .select("confidence, ikke_funnet, created_at, leads!inner(company_id)")
        .eq("leads.company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const listIds = (lister ?? []).map((l) => l.id);
  const { count: prisrader } = listIds.length
    ? await admin
        .from("price_list_items")
        .select("id", { count: "exact", head: true })
        .in("price_list_id", listIds)
        .eq("active", true)
    : { count: 0 };

  const alle = referansar ?? [];
  const tags = new Set<string>();
  for (const r of alle) for (const t of (r.tags as string[]) ?? []) tags.add(t);

  const bekrefta = alle.filter((r) => r.draft_id);
  const sisteUroerte = bekrefta
    .slice(0, 10)
    // Rettet = innholdet ble endret. Ren prisoverstyring gir edited_by_user
    // uten edit_summary (summarizeEdits hopper over beløp med vilje), og den
    // skal ikke telle mot agenten — prisen er menneskets avgjørelse per jobb.
    .map((r) => !(r.edited_by_user && r.edit_summary));

  const sisteFullDekning = (utkast ?? []).map(
    (d) => ((d.ikke_funnet as string[]) ?? []).length === 0,
  );
  const sisteMedTreff = (utkast ?? []).map((d) => d.confidence === "hoeg");

  return regnOpplaering({
    prisrader: prisrader ?? 0,
    referansefiler: filer ?? 0,
    bekreftaTilbod: bekrefta.length,
    ulikeTags: tags.size,
    forbehold: forbehold.length,
    sisteUroerte,
    sisteFullDekning,
    sisteMedTreff,
  });
}
