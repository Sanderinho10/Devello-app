import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Forbeholdsbiblioteket — de forbeholdene firmaet faktisk har brukt før.
 *
 * Samme prinsipp som prisene: agenten skal ikke finne på et forbehold, like
 * lite som den skal finne på en pris. Den peker på en id herfra, og koden
 * slår opp teksten. Er biblioteket tomt, får tilbudet ingen forbehold — og en
 * merknad om hvorfor. Det er bedre enn en velformulert setning ingen i firmaet
 * har vedtatt, som kunden kan holde dem til.
 *
 * Kildene lander i samme tabell: bekreftede tilbud skriver forutsetningene
 * sine til quote_references ved «Bekreft og lag kladd», og opplastede
 * referansefiler får sine hentet ut ved indeksering. Biblioteket er derfor
 * bare et oppslag i én tabell.
 */

export interface Forbehold {
  id: string;
  tekst: string;
  /** Hvor mange tilbud det har stått i. Det som gjentar seg, er det etablerte. */
  ganger: number;
}

const MAKS = 40;

export async function forbeholdsBibliotek(
  admin: SupabaseClient,
  companyId: string,
): Promise<Forbehold[]> {
  const { data } = await admin
    .from("quote_references")
    .select("assumptions, confirmed_at")
    .eq("company_id", companyId)
    .order("confirmed_at", { ascending: false })
    .limit(300);

  const teller = new Map<string, { tekst: string; ganger: number }>();

  for (const rad of data ?? []) {
    const linjer = (rad.assumptions ?? []) as unknown[];
    for (const linje of linjer) {
      if (typeof linje !== "string") continue;
      const tekst = linje.trim();
      if (tekst.length < 8 || tekst.length > 300) continue;

      // Antakelser om ÉN jobb skal ikke inn i biblioteket. «Badegulvet er
      // antatt 10 m²» er sant for det ene tilbudet og feil for alle andre.
      if (erJobbspesifikk(tekst)) continue;

      const nøkkel = normaliser(tekst);
      const eksisterende = teller.get(nøkkel);
      if (eksisterende) eksisterende.ganger += 1;
      else teller.set(nøkkel, { tekst, ganger: 1 });
    }
  }

  return [...teller.values()]
    .sort((a, b) => b.ganger - a.ganger || a.tekst.localeCompare(b.tekst, "nb"))
    .slice(0, MAKS)
    .map((f, i) => ({ id: `F${i + 1}`, tekst: f.tekst, ganger: f.ganger }));
}

/**
 * Tall og målenheter er signaturen til en antakelse om én konkret jobb.
 * «Prisen forutsetter at strøm er tilgjengelig på stedet» har ingen tall;
 * «Badegulvet er antatt 10 m²» har det.
 */
function erJobbspesifikk(tekst: string): boolean {
  return /\d+\s*(m²|m2|kvm|meter|stk|timer|timar|punkt|kurser?)\b/i.test(tekst);
}

function normaliser(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?«»"']/g, "")
    .trim();
}

/** Blokken som går inn i prompten. */
export function forbeholdsBlokk(bibliotek: Forbehold[]): string {
  if (bibliotek.length === 0) {
    return [
      "# Forbeholdsbibliotek",
      "",
      "(tomt — firmaet har ingen lagrede forbehold ennå)",
      "",
      "La `forbehold` stå tom, og skriv i `merknader` at tilbudet er uten",
      "forbehold fordi det ikke finnes lagrede å velge fra. Ikke formuler",
      "egne.",
    ].join("\n");
  }

  return [
    "# Forbeholdsbibliotek",
    "",
    "Forbeholdene firmaet har brukt før. Velg de 2–4 som er relevante for",
    "akkurat denne jobben, og oppgi id-ene i `forbehold`. Teksten settes inn",
    "ordrett av systemet — du skal verken omformulere eller finne på nye.",
    "Passer ingen, la lista stå tom.",
    "",
    ...bibliotek.map((f) => `- ${f.id}: ${f.tekst}${f.ganger > 1 ? `  (brukt ${f.ganger} ganger)` : ""}`),
  ].join("\n");
}
