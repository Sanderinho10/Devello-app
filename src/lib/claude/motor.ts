import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Motoren — systemprompten til tilbudsagenten.
 *
 * agent/CLAUDE.md + agent/velg-tilbudstype.md + agent/lag-tilbudsdata.md,
 * satt sammen i den rekkefølgen. Filene er fasiten fra devello-agent/ (uten
 * testmodus-avsnittet) og er samme motor for alle kunder — alt kundespesifikt
 * går inn i user-meldingen per kall, aldri her.
 *
 * Skal agentens oppførsel endres, endres disse filene — ikke koden. Caches i
 * minne som sop.ts gjorde: prosessen lever lenge, og filene endres bare ved
 * utrulling.
 */

let cached: string | null = null;

const FILES = ["CLAUDE.md", "velg-tilbudstype.md", "lag-tilbudsdata.md"];

export async function loadMotor(): Promise<string> {
  if (cached) return cached;

  const parts = await Promise.all(
    FILES.map((name) => readFile(path.join(process.cwd(), "agent", name), "utf8")),
  );

  cached = parts.join("\n\n---\n\n");
  return cached;
}
