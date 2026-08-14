import { readFile } from "node:fs/promises";
import path from "node:path";

let cached: string | null = null;

/**
 * SOP-en er kjelda for kva som faktisk skal stå i e-postteksten. Den ligg som
 * markdown i repoet slik at den kan endrast utan kodeendring.
 */
export async function loadSop(): Promise<string> {
  if (cached) return cached;
  const file = path.join(process.cwd(), "docs", "Tilbudsmail_SOP.md");
  cached = await readFile(file, "utf8");
  return cached;
}
