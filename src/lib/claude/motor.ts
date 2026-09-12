import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Motoren — systemprompten til tilbudsagenten — i to versjoner side om side.
 *
 *   agent/v2/   dagens motor, frosset. Ett kall fra lead til prisrader.
 *   agent/v3/   omfang først, så tilbud. To kall, jobbtypesjekklister,
 *               spørsmål til kunden, rimelighetsvakt i koden.
 *
 * Hvilken som kjører velges per selskap (companies.motor_versjon), med
 * MOTOR_DEFAULT i miljøet som fallback og «v2» som fallback for fallbacken.
 * Det er hele tilbakerullingen: viser evalueringen at v3 er dårligere, settes
 * selskapet (eller standarden) tilbake til v2 — ingen utrulling, ingen
 * migrasjon, og v2-koden er ikke rørt.
 *
 * Skal agentens oppførsel endres, endres filene under agent/ — ikke koden.
 * Filene caches i minne per versjon: prosessen lever lenge, og de endres bare
 * ved utrulling.
 */

import type { MotorVersjon } from "./motor-versjon";

export {
  MOTOR_LABELS,
  MOTOR_VERSJONER,
  erMotorVersjon,
  fagFor,
  motorFor,
  standardMotor,
  type MotorVersjon,
} from "./motor-versjon";

const cache = new Map<string, string>();

async function lesFiler(versjon: MotorVersjon, filer: string[]): Promise<string> {
  const key = `${versjon}:${filer.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const parts = await Promise.all(
    filer.map((name) => readFile(path.join(process.cwd(), "agent", versjon, name), "utf8")),
  );
  const tekst = parts.join("\n\n---\n\n");
  cache.set(key, tekst);
  return tekst;
}

/**
 * v2: hele motoren som én systemprompt, i samme rekkefølge som før. Byte for
 * byte det samme som produksjon kjørte på før v3 — det er poenget.
 */
export async function loadMotor(versjon: MotorVersjon = "v2"): Promise<string> {
  if (versjon === "v3") {
    throw new Error("v3 har to systemprompter — bruk loadMotorV3()");
  }
  return lesFiler("v2", ["CLAUDE.md", "velg-tilbudstype.md", "lag-tilbudsdata.md"]);
}

export interface Jobbtype {
  id: string;
  navn: string;
  typisk_tilbudstype: "punktpris" | "fastpris" | "tid_og_materiell";
  /** Færreste antall poster + ikke_funnet et tilbud av typen kan ha. */
  min_poster: number;
  /** Rimelighetsbånd for sum eks. mva, eller null når typen er mengdedrevet. */
  band_eks_mva: [number, number] | null;
  sjekkliste: string[];
}

export interface Bransjepakke {
  fag: string;
  versjon: string;
  alltid: string[];
  jobbtyper: Jobbtype[];
}

const pakkeCache = new Map<string, Bransjepakke>();

/** Bransjepakken for et fag. Ukjent fag faller tilbake på elektro. */
export async function loadBransjepakke(fag: string): Promise<Bransjepakke> {
  const hit = pakkeCache.get(fag);
  if (hit) return hit;

  let raw: string;
  try {
    raw = await readFile(path.join(process.cwd(), "agent", "v3", "bransje", fag, "jobbtypar.json"), "utf8");
  } catch {
    if (fag === "elektro") throw new Error("Bransjepakken for elektro mangler (agent/v3/bransje/elektro/jobbtypar.json)");
    return loadBransjepakke("elektro");
  }
  const pakke = JSON.parse(raw) as Bransjepakke;
  pakkeCache.set(fag, pakke);
  return pakke;
}

/** Sjekklistene som tekst, slik de går inn i systemprompten for steg 1. */
export function sjekklisteBlokk(pakke: Bransjepakke): string {
  const linjer: string[] = [
    `# Jobbtyper og sjekklister — ${pakke.fag}`,
    "",
    "Velg jobbtype-id fra listen. Hver post i sjekklisten skal vurderes",
    "(inkludert: ja / nei / ikke_relevant). Sjekklisten er et gulv — legg til",
    "det leadet nevner som ikke står her.",
    "",
    `Alltid med ved installasjonsarbeid: ${pakke.alltid.join("; ")}.`,
    "",
  ];
  for (const j of pakke.jobbtyper) {
    linjer.push(`## ${j.id} — ${j.navn} (typisk ${j.typisk_tilbudstype})`);
    for (const p of j.sjekkliste) linjer.push(`- ${p}`);
    linjer.push("");
  }
  return linjer.join("\n");
}

/**
 * v3 har én systemprompt per steg. Begge inneholder CLAUDE.md, så reglene
 * gjelder i begge; resten er stegets egne instruks og eksempler. Sjekklistene
 * er med i steg 1 — de er bransjekunnskap, like for alle kunder i faget, og
 * hører derfor hjemme i systemprompten (og i cachen), ikke i user-meldingen.
 */
export async function loadMotorV3(steg: "omfang" | "tilbud", fag: string): Promise<string> {
  if (steg === "omfang") {
    const [motor, pakke] = await Promise.all([
      lesFiler("v3", ["CLAUDE.md", "steg1-omfang.md", "eksempel-omfang.md"]),
      loadBransjepakke(fag),
    ]);
    return `${motor}\n\n---\n\n${sjekklisteBlokk(pakke)}`;
  }
  return lesFiler("v3", ["CLAUDE.md", "velg-tilbudstype.md", "steg2-tilbud.md", "eksempel-tilbud.md"]);
}
