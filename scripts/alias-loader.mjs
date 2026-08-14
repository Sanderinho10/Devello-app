// Løyser "@/..."-importar når vi køyrer TypeScript direkte i Node (utan Next).
// Brukt av scripts/preview-pdf.ts.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL(import.meta.filename));
