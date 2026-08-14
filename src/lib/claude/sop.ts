import { readFile } from "node:fs/promises";
import path from "node:path";

let cached: string | null = null;

/**
 * SOP-en er kilden til hva som faktisk skal stå i e-postteksten. Den ligger som
 * markdown i repoet slik at den kan endres uten kodeendring.
 */
export async function loadSop(): Promise<string> {
  if (cached) return cached;
  const file = path.join(process.cwd(), "docs", "Tilbudsmail_SOP.md");
  cached = await readFile(file, "utf8");
  return cached;
}
