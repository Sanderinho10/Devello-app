import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteReference } from "./index";

/**
 * Oppdelingen firmaet pleier å bruke — utledet av tilbudene de faktisk har
 * sendt, ikke av hva vi tror er pent.
 *
 * Star Elektro har samme tre bolker i alle seks bekreftede tilbud:
 *
 *     Elbillader / Installasjon av elbillader   ← selve jobben
 *     Dokumentasjon                             ← NEK400 + samsvarserklæring
 *     Diverse                                   ← timer, servicebil
 *
 * «Dokumentasjon» står i 6 av 6, alltid med de samme to postene, begge til
 * 0 kr. Det er ikke pynt: det er den bolken som forteller kunden at arbeidet
 * blir dokumentert og samsvarserklært. Agenten droppet den hver gang, fordi
 * referansene ble bygget med flatMap og oppdelingen var kastet før prompten.
 *
 * Denne modulen finner bolker som går igjen, og postene som alltid står i
 * dem. Terskelen er streng med vilje: et mønster som bare finnes i halvparten
 * av tilbudene er ikke et mønster, det er tilfeldigheter, og å presentere det
 * som «slik pleier dere» ville lært agenten noe firmaet ikke gjør.
 *
 * Utledningen er en ren funksjon. hentStruktur() under henter grunnlaget.
 *
 * Grunnlaget er ALLE firmaets bekreftede tilbud, ikke de 3–5 som ligner mest
 * på dette leadet. Oppdelingen er en vane firmaet har på tvers av jobber:
 * spurte vi bare de like, ville «Dokumentasjon» falle bort så snart et lead
 * lignet mest på de to tilbudene der agenten selv glemte den — og da lærer
 * agenten sin egen feil tilbake.
 */

/** Andel av tilbudene en bolk må stå i før vi kaller den fast. */
const FAST_TERSKEL = 0.6;

/** Færreste tilbud vi i det hele tatt uttaler oss ut fra. */
const MINST_TILBUD = 3;

export interface FastBolk {
  tittel: string;
  /** Hvor mange av tilbudene bolken sto i. */
  antall: number;
  /** Poster som står i bolken i minst like mange tilbud som bolken selv. */
  fastePoster: string[];
  /** Typisk plassering, 0-indeksert, medianen av der bolken faktisk sto. */
  plass: number;
}

export interface Struktur {
  tilbud: number;
  bolker: FastBolk[];
  /** Typisk antall seksjoner, medianen. */
  typiskAntall: number;
}

export function finnStruktur(refs: QuoteReference[]): Struktur | null {
  const medSeksjon = refs.filter((r) => r.lines.some((l) => l.seksjon));
  if (medSeksjon.length < MINST_TILBUD) return null;

  // Per tilbud: bolkene i rekkefølge, og postene i hver.
  const perTilbud = medSeksjon.map((r) => {
    const bolker: { tittel: string; poster: string[] }[] = [];
    for (const l of r.lines) {
      const tittel = (l.seksjon ?? "").trim();
      if (!tittel) continue;
      const siste = bolker[bolker.length - 1];
      if (siste && norm(siste.tittel) === norm(tittel)) siste.poster.push(l.beskrivelse);
      else bolker.push({ tittel, poster: [l.beskrivelse] });
    }
    return bolker;
  });

  interface Rad {
    tittel: string;
    antall: number;
    plasser: number[];
    poster: Map<string, { tekst: string; antall: number }>;
  }
  const teller = new Map<string, Rad>();

  for (const bolker of perTilbud) {
    // Samme bolk to ganger i ett tilbud skal telle én gang.
    const sett = new Set<string>();
    bolker.forEach((b, plass) => {
      const n = norm(b.tittel);
      if (sett.has(n)) return;
      sett.add(n);
      const rad: Rad =
        teller.get(n) ?? { tittel: b.tittel, antall: 0, plasser: [], poster: new Map() };
      rad.antall += 1;
      rad.plasser.push(plass);
      for (const p of unike(b.poster)) {
        const pn = norm(p);
        const eks = rad.poster.get(pn);
        if (eks) eks.antall += 1;
        else rad.poster.set(pn, { tekst: p, antall: 1 });
      }
      teller.set(n, rad);
    });
  }

  const grense = Math.ceil(medSeksjon.length * FAST_TERSKEL);
  const bolker: FastBolk[] = [...teller.values()]
    .filter((r) => r.antall >= grense)
    .map((r) => ({
      tittel: r.tittel,
      antall: r.antall,
      plass: median(r.plasser),
      fastePoster: [...r.poster.values()]
        .filter((p) => p.antall >= r.antall)
        .map((p) => p.tekst),
    }))
    .sort((a, b) => a.plass - b.plass || b.antall - a.antall);

  if (bolker.length === 0) return null;

  return {
    tilbud: medSeksjon.length,
    bolker,
    typiskAntall: median(perTilbud.map((b) => b.length)),
  };
}

/**
 * Strukturen som tekst i systemprompten. Formulert som en observasjon om hva
 * firmaet gjør, ikke som en regel — agenten skal kunne avvike når jobben er en
 * annen, men skal aldri droppe en bolk uten å ha tenkt på den.
 */
export function strukturBlokk(struktur: Struktur | null): string {
  if (!struktur) return "";

  const linjer = [
    "# Slik deler dette firmaet opp tilbudene sine",
    "",
    `Observert i ${struktur.tilbud} bekreftede tilbud. Typisk ${struktur.typiskAntall} ${
      struktur.typiskAntall === 1 ? "seksjon" : "seksjoner"
    }.`,
    "",
  ];

  for (const b of struktur.bolker) {
    linjer.push(`## ${b.tittel} — i ${b.antall} av ${struktur.tilbud} tilbud`);
    if (b.fastePoster.length > 0) {
      linjer.push("Står alltid her:");
      for (const p of b.fastePoster) linjer.push(`- ${p}`);
    }
    linjer.push("");
  }

  linjer.push(
    [
      "Bruk denne oppdelingen når jobben ligner. Er jobben en annen, lag de",
      "seksjonene jobben krever — men en bolk som står i nesten hvert tilbud",
      "er der fordi firmaet mener den hører med, og skal ikke falle bort i",
      "stillhet. Finner du ikke prisraden til en fast post, ta den likevel med",
      "i `ikke_funnet` og si fra i `merknader`.",
    ].join("\n"),
  );

  return linjer.join("\n");
}

function unike(v: string[]): string[] {
  const sett = new Set<string>();
  return v.filter((x) => {
    const n = norm(x);
    if (sett.has(n)) return false;
    sett.add(n);
    return true;
  });
}

function norm(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

function median(tall: number[]): number {
  const s = [...tall].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Strukturen til et selskap, lest av alle bekreftede tilbud som har poster.
 *
 * Henter bare `lines`: vi trenger seksjonstitlene og postnavnene, ikke tekst,
 * beløp eller kundeopplysninger. Feiler spørringen, er det ikke verdt å stoppe
 * en generering for — da går utkastet ut uten strukturblokken, slik det gjorde
 * før denne fantes.
 */
export async function hentStruktur(
  admin: SupabaseClient,
  companyId: string,
): Promise<Struktur | null> {
  try {
    const { data, error } = await admin
      .from("quote_references")
      .select("lines")
      .eq("company_id", companyId)
      .order("confirmed_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);

    const refs = (data ?? [])
      .map((r) => ({ lines: (r.lines ?? []) as QuoteReference["lines"] }))
      .filter((r) => r.lines.length > 0) as QuoteReference[];
    return finnStruktur(refs);
  } catch (err) {
    console.warn("henting av tilbudsstruktur feilet:", err instanceof Error ? err.message : err);
    return null;
  }
}
