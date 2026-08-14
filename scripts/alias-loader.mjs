// Løser "@/..."-importer når vi kjører TypeScript direkte i Node (uten Next).
// Brukt av scripts/preview-pdf.ts.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL(import.meta.filename));
