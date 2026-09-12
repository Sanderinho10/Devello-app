import type { AgentStatus, RawTilbudsdata } from "./generate";
import type { Jobbtype } from "./motor";
import { computeTotals, type QuoteDocument } from "@/lib/types";

/**
 * Omfanget — datatypene og vaktene i motor v3, uten modell og database.
 *
 * Ligger for seg selv så de kan prøves med «npm run test:motor». Selve
 * kallene mot modellen står i generate-v3.ts.
 */

export interface Arbeidspost {
  /** Hva arbeidet er, internt. */
  kva: string;
  /** Setningen i leadet posten kommer fra. Tom når posten er fra sjekklisten. */
  sitat: string;
  mengde: number | null;
  enhet: string;
  kilde: "lead" | "antakelse" | "sjekkliste";
  inkludert: "ja" | "nei" | "ikke_relevant";
  begrunnelse: string | null;
}

export interface Omfang {
  jobbtype: string;
  kundetype: "forbruker" | "bedrift" | "ukjent";
  status: AgentStatus;
  arbeidsposter: Arbeidspost[];
  antakelser: string[];
  sporsmal_til_kunden: string[];
}

/** Omfanget slik steg 2 leser det. Kompakt, én linje per arbeidspost. */
export function omfangBlokk(omfang: Omfang, jobbtype: Jobbtype | null): string {
  const linjer = omfang.arbeidsposter.map((p) => {
    const mengde = p.mengde != null ? ` × ${p.mengde} ${p.enhet}` : "";
    const kilde = p.kilde === "lead" ? "fra leadet" : p.kilde === "antakelse" ? "antatt" : "fra sjekklisten";
    const sitat = p.sitat ? ` — «${p.sitat}»` : "";
    const begr = p.begrunnelse ? ` (${p.begrunnelse})` : "";
    return `- [${p.inkludert}] ${p.kva}${mengde} · ${kilde}${sitat}${begr}`;
  });
  const ja = omfang.arbeidsposter.filter((p) => p.inkludert === "ja").length;

  // Steg 1 sin konklusjon må fram til steg 2 — ellers står steg 2 med en tom
  // liste og gjetter selv om det skal lage et tilbud eller spørre.
  if (omfang.status === "trenger_avklaring") {
    return [
      `# Omfang fra steg 1 — STATUS: trenger_avklaring, kundetype ${omfang.kundetype}`,
      "",
      "Steg 1 fant ikke ut hva jobben er. Lever status «trenger_avklaring», dokument null, tom forbehold-liste, og en kort e-post med ett konkret spørsmål om jobbtypen — med spørsmålstegn. Ikke lag poster.",
      "",
      ...linjer,
      "",
      omfang.sporsmal_til_kunden.length
        ? `Spørsmål steg 1 foreslo: ${omfang.sporsmal_til_kunden.join(" · ")}`
        : "Steg 1 foreslo ikke noe spørsmål — formuler ett selv ut fra leadet.",
    ].join("\n");
  }

  return [
    `# Omfang fra steg 1 — jobbtype «${jobbtype?.navn ?? omfang.jobbtype}», kundetype ${omfang.kundetype}`,
    "",
    `${ja} arbeidsposter er inkludert («ja»). Hver av dem skal bli en post, en del av en pakkepost (sagt i beskrivelsen), eller stå i ikke_funnet. «nei» blir forbehold eller spørsmål — ikke poster.`,
    "",
    ...linjer,
    "",
    omfang.antakelser.length ? `Antakelser: ${omfang.antakelser.join(" · ")}` : "Antakelser: ingen.",
    omfang.sporsmal_til_kunden.length
      ? `Spørsmål til kunden (skal inn i e-posten): ${omfang.sporsmal_til_kunden.join(" · ")}`
      : "Spørsmål til kunden: ingen — hopp over avsnittet i e-posten.",
  ].join("\n");
}

/**
 * Omfangsvakten: har tilbudet plass til arbeidet omfanget fant?
 *
 * Poster + ikke_funnet skal være minst jobbtypens minimum, og minst halvparten
 * av de inkluderte arbeidspostene — pakkeposter slår gjerne to–tre sammen, så
 * én-til-én er for strengt, men et tilbud med to poster for tolv inkluderte
 * arbeidsposter er Roger-saka om igjen.
 */
export function omfangSjekk(raw: RawTilbudsdata, omfang: Omfang, jobbtype: Jobbtype | null): string[] {
  if (raw.status !== "utkast" || raw.tilbudstype === "tid_og_materiell" || !raw.dokument) return [];

  const poster = raw.dokument.seksjoner.reduce((n, s) => n + s.poster.length, 0);
  const dekket = poster + raw.ikke_funnet.length;
  const ja = omfang.arbeidsposter.filter((p) => p.inkludert === "ja").length;
  const krav = Math.max(jobbtype?.min_poster ?? 1, Math.ceil(ja / 2));

  if (dekket < krav) {
    return [
      `tilbudet har ${poster} poster og ${raw.ikke_funnet.length} i ikke_funnet, men omfanget har ${ja} inkluderte arbeidsposter` +
        (jobbtype ? ` og jobbtypen «${jobbtype.navn}» har normalt minst ${jobbtype.min_poster} poster` : "") +
        `. Gå gjennom arbeidspostene med «ja»: hver skal bli en post, stå i en pakkeposts beskrivelse, eller i ikke_funnet.`,
    ];
  }
  return [];
}

export function bandAvvik(
  document: QuoteDocument | null,
  jobbtype: Jobbtype | null,
): { sum: number; lo: number; hi: number } | null {
  if (!document || !jobbtype?.band_eks_mva) return null;
  const sum = Math.round(computeTotals(document).subtotal);
  const [lo, hi] = jobbtype.band_eks_mva;
  if (sum >= lo && sum <= hi) return null;
  return { sum, lo, hi };
}
