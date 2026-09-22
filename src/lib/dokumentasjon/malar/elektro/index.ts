import type { Mal } from "../typar";
import { kursfortegnelse } from "./kursfortegnelse";
import { risikovurdering } from "./risikovurdering";
import { samsvarserklaering } from "./samsvarserklaering";
import { sluttkontroll } from "./sluttkontroll";
import { utstyrsdokumentasjon } from "./utstyrsdokumentasjon";

/** «5 sikre» — i den rekkefølgen de brukes på en jobb. */
export const ELEKTRO: Mal[] = [risikovurdering, samsvarserklaering, sluttkontroll, kursfortegnelse, utstyrsdokumentasjon];
