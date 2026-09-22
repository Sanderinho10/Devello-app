/**
 * Grensene for vedlegg på et lead. Delt mellom nettleseren (som sier fra før
 * noe lastes opp) og serveren (som er den som faktisk håndhever dem).
 *
 * Tallene er satt etter hva som gir agenten nok å se på uten at ett lead med
 * førti bilder koster like mye som tjue vanlige tilbud:
 *
 * - Et bilde skaleres til maks 1568 px på lengste side før det lagres. Det er
 *   den størrelsen modellen leser i uansett — større bilder skaleres ned hos
 *   Anthropic, bare etter at vi har betalt for å sende dem. Ca. 1 600 tokens
 *   per bilde.
 * - En PDF-side koster 1 500–3 000 tokens: både teksten og et bilde av siden.
 *   Taket på sider er det som holder en tjuesiders anbudsbeskrivelse fra å
 *   bli det dyreste i hele genereringen.
 */

/** Filer som lagres per lead. Resten avvises ved opplasting. */
export const MAKS_VEDLEGG = 10;

/** Største fil vi tar imot, før skalering. En mobilbilde er 3–12 MB. */
export const MAKS_FILSTORRELSE = 25 * 1024 * 1024;

/**
 * Største samlede opplasting fra «Manuell henvendelse». Under taket på
 * forespørselskroppen i next.config.ts, med margin.
 */
export const MAKS_OPPLASTING = 35 * 1024 * 1024;

/** Bilder som sendes til modellen per generering. */
export const MAKS_BILDER_TIL_MODELL = 10;

/** PDF-sider til sammen som sendes til modellen per generering. */
export const MAKS_PDF_SIDER_TIL_MODELL = 30;

/** Lengste side på et lagret bilde. */
export const BILDE_MAKS_PX = 1568;

/**
 * Filendelser som kan bli vedlegg. Typen sjekkes på innholdet, ikke navnet.
 *
 * HEIC er med fordi det er det iPhone tar bilder i. Sendes bildet på e-post,
 * gjør telefonen det som regel om til JPEG — men et bilde som deles fra
 * Bilder-appen, eller dras inn fra en Mac, kommer ofte som .heic.
 */
export function kanBliVedlegg(filnavn: string, mime?: string): boolean {
  return (
    /\.(jpe?g|png|gif|webp|heic|heif|avif|pdf)$/i.test(filnavn) ||
    /^image\/(jpeg|png|gif|webp|heic|heif|heic-sequence|heif-sequence|avif)$|^application\/pdf$/.test(mime ?? "")
  );
}
