import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(srcRoot, specifier.slice(2));
    const hit = firstExisting(base);
    if (hit) return next(pathToFileURL(hit).href, context);
  }

  // Relative importer uten filending («./client») er gyldig TypeScript, men
  // Node-ESM krever endelsen. Prøv .ts/.tsx før vi gir opp.
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL ?? pathToFileURL(srcRoot).href));
    const base = path.resolve(parentDir, specifier);
    if (!existsSync(base)) {
      const hit = firstExisting(base);
      if (hit) return next(pathToFileURL(hit).href, context);
    }
  }

  return next(specifier, context);
}

function firstExisting(base) {
  // Et katalognavn («@/lib/referanser») skal treffe index.ts i katalogen,
  // ikke katalogen selv — Node-ESM nekter katalogimporter.
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}
