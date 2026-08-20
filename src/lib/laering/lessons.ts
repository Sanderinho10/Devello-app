import type { SupabaseClient } from "@supabase/supabase-js";
import { structured } from "@/lib/claude/client";
import type { DraftSnapshot } from "@/lib/drafts/versions";
import type { QuoteType } from "@/lib/types";

/**
 * Lærdommer — det agenten har lært av rettelsene den har fått.
 *
 * Referanselisten viser agenten hva firmaet pleier å sende. Lærdommene er noe
 * annet: de fanger regelen bak en rettelse, så den gjelder også for jobber som
 * ikke ligner på den som utløste den. «Skriv alltid at stillas kommer i
 * tillegg over tre meter» hjelper på et lead om takbelysning selv om
 * referansen var et fasadeanlegg.
 *
 * Hver lærdom må godkjennes av et menneske. Modellen generaliserer villig fra
 * én hendelse, og en regel som er lært feil påvirker hvert eneste tilbud
 * etterpå — uten at noen ser hvorfor.
 */

export interface Lesson {
  id: string;
  regel: string;
  begrunnelse: string | null;
  quote_type: QuoteType | null;
  status: "foreslaatt" | "aktiv" | "avvist";
  ganger: number;
  draft_id: string | null;
  created_at: string;
}

interface Utledning {
  fant_moenster: boolean;
  regel: string | null;
  begrunnelse: string | null;
  gjelder_type: "punktpris" | "fastpris" | "tid_og_materiell" | "alle" | null;
  duplikat_av: string | null;
}

const SCHEMA = {
  type: "object",
  properties: {
    fant_moenster: {
      type: "boolean",
      description:
        "true bare når rettelsen sier noe om hvordan firmaet vil ha tilbudene sine generelt. false for alt som gjelder denne ene kunden eller denne ene jobben.",
    },
    regel: {
      type: ["string", "null"],
      description:
        "Én setning i imperativ, slik du ville sagt det til en ny medarbeider. F.eks. «Ta alltid med en forutsetning om at stillas kommer i tillegg ved arbeid over tre meter.» Ingen kundenavn, ingen beløp fra denne jobben.",
    },
    begrunnelse: {
      type: ["string", "null"],
      description: "Kort: hvilken rettelse regelen er utledet fra.",
    },
    gjelder_type: {
      type: ["string", "null"],
      enum: ["punktpris", "fastpris", "tid_og_materiell", "alle", null],
      description: "«alle» når regelen ikke henger på tilbudstypen.",
    },
    duplikat_av: {
      type: ["string", "null"],
      description:
        "id-en til en eksisterende lærdom som allerede dekker dette, hvis noen gjør det. Ellers null.",
    },
  },
  required: ["fant_moenster", "regel", "begrunnelse", "gjelder_type", "duplikat_av"],
  additionalProperties: false,
};

const SYSTEM = `Du ser på hva en håndverker endret i et tilbudsutkast før det ble sendt,
og finner ut om rettelsen sier noe varig om hvordan firmaet vil ha tilbudene sine.

Vær streng. De aller fleste rettelser er engangsting: et navn, en adresse, en
mengde som passet akkurat denne jobben, en pris kunden hadde fått lovet. Slikt
skal gi fant_moenster: false. En regel som læres feil vil påvirke hvert eneste
tilbud firmaet sender etterpå.

Si fant_moenster: true bare når rettelsen ville vært riktig også på neste jobb
av samme slag — en forutsetning som alltid mangler, en formulering firmaet
alltid retter på, en post de alltid legger til, en tone de alltid endrer.

Er en av de eksisterende lærdommene allerede dekkende, sett duplikat_av til
id-en dens i stedet for å foreslå det samme på nytt.`;

/**
 * Leser en rettelse og foreslår en varig regel — eller lar være.
 *
 * Returnerer null når rettelsen var en engangsting, som er det vanlige.
 */
export async function utledLaerdom(input: {
  foer: DraftSnapshot;
  etter: DraftSnapshot;
  eksisterende: Lesson[];
}): Promise<Utledning | null> {
  const eksisterende = input.eksisterende.length
    ? input.eksisterende
        .map((l) => `- id ${l.id}: ${l.regel}`)
        .join("\n")
    : "(ingen ennå)";

  const prompt = [
    "# Eksisterende lærdommer",
    "",
    eksisterende,
    "",
    "# Agentens utkast",
    "",
    JSON.stringify(input.foer, null, 2).slice(0, 12000),
    "",
    "# Slik ble det sendt",
    "",
    JSON.stringify(input.etter, null, 2).slice(0, 12000),
  ].join("\n");

  try {
    const svar = await structured<Utledning>({
      system: SYSTEM,
      schema: SCHEMA,
      effort: "medium",
      maxTokens: 4000,
      prompt,
    });
    return svar;
  } catch (err) {
    // Læring skal aldri velte en bekreftelse. Kladden er allerede i Outlook.
    console.error("Kunne ikke utlede lærdom:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Lagrer forslaget, eller teller opp den som allerede dekker det. */
export async function lagreLaerdom(
  admin: SupabaseClient,
  input: { companyId: string; draftId: string; utledning: Utledning },
): Promise<void> {
  const { utledning } = input;

  if (utledning.duplikat_av) {
    // Et mønster som gjentar seg er mer verdt enn en engangshendelse — og en
    // lærdom som er sett flere ganger er lettere å si ja til.
    const { data: eksisterende } = await admin
      .from("agent_lessons")
      .select("ganger")
      .eq("id", utledning.duplikat_av)
      .eq("company_id", input.companyId)
      .maybeSingle();

    if (eksisterende) {
      await admin
        .from("agent_lessons")
        .update({ ganger: (eksisterende.ganger ?? 1) + 1 })
        .eq("id", utledning.duplikat_av);
      return;
    }
    // Modellen fant på en id. Da faller vi tilbake til å lagre som nytt.
  }

  if (!utledning.fant_moenster || !utledning.regel) return;

  await admin.from("agent_lessons").insert({
    company_id: input.companyId,
    regel: utledning.regel,
    begrunnelse: utledning.begrunnelse,
    quote_type:
      utledning.gjelder_type && utledning.gjelder_type !== "alle"
        ? utledning.gjelder_type
        : null,
    draft_id: input.draftId,
  });
}

/** De godkjente lærdommene som gjelder for en tilbudstype. */
export async function aktiveLaerdommer(
  admin: SupabaseClient,
  companyId: string,
): Promise<Lesson[]> {
  const { data } = await admin
    .from("agent_lessons")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "aktiv")
    .order("created_at", { ascending: true });
  return (data ?? []) as Lesson[];
}

/** Blokken som går inn i prompten. */
export function laerdomsBlokk(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  const linjer = lessons.map((l) =>
    l.quote_type ? `- (${l.quote_type}) ${l.regel}` : `- ${l.regel}`,
  );
  return [
    "# Lærdommer fra tidligere tilbud",
    "",
    "Dette har firmaet rettet på før, og godkjent som varige regler. De veier",
    "tyngre enn mønsteret i referansene, og skal følges med mindre leadet sier",
    "noe annet.",
    "",
    ...linjer,
  ].join("\n");
}
