import type { Svar, UtboksRad, Vedtak } from "./typer";

/**
 * Rene funksjoner for utboksen — det som kan testes uten SQLite og nett.
 *
 * planleggNeste: hvilken rad skal sendes nå. handterSvar: hva skjer med
 * raden etter svaret. Motoren (motor.ts) er bare rør rundt disse to.
 */

export const MAKS_BACKOFF_S = 300;

/** 2, 4, 8 … sekunder, aldri mer enn fem minutter. */
export function backoffSekund(forsok: number): number {
  return Math.min(2 ** Math.max(1, forsok), MAKS_BACKOFF_S);
}

export interface Plan {
  /** Raden som skal sendes nå, eller null. */
  rad: UtboksRad | null;
  /** Når rad er null: så lenge må motoren vente før noe blir klart. Null = ingenting venter. */
  ventMs: number | null;
}

/**
 * Neste rad å sende, i opprettelsesrekkefølge.
 *
 * - Bare rader med status «venter». «sender» tilhører en kjøring som pågår
 *   (eller ble drept — motoren nullstiller dem ved oppstart), «feil» venter
 *   på montøren.
 * - Et bilde hopper over så lenge notatet det hører til fremdeles ligger i
 *   utboksen uten server_id. Er notatet borte, er det sendt og note_id
 *   ligger i bildets payload.
 * - Rader i backoff hoppes over, men sperrer ikke de bak seg.
 */
export function planleggNeste(rader: UtboksRad[], no: Date): Plan {
  const uferdigeNotat = new Set(
    rader.filter((r) => r.type === "notat" && !r.server_id).map((r) => r.client_id),
  );
  const venter = rader
    .filter((r) => r.status === "venter")
    .sort((a, b) => (a.laga_kl < b.laga_kl ? -1 : a.laga_kl > b.laga_kl ? 1 : a.id - b.id));

  let ventMs: number | null = null;
  for (const rad of venter) {
    if (rad.type === "bilete" && rad.avhengig_av && uferdigeNotat.has(rad.avhengig_av)) continue;
    if (rad.neste_forsok_kl) {
      const om = new Date(rad.neste_forsok_kl).getTime() - no.getTime();
      if (om > 0) {
        ventMs = ventMs === null ? om : Math.min(ventMs, om);
        continue;
      }
    }
    return { rad, ventMs: null };
  }
  return { rad: null, ventMs };
}

/**
 * Hva som skjer med raden etter svaret.
 *
 * 200/201 → ferdig. 401 → token må fornyes. Andre 4xx → feil som blir
 * liggende til montøren sletter eller prøver igjen. Nettverksfeil, 5xx,
 * 429 og 408 → tilbake til venter med backoff.
 */
export function handterSvar(rad: UtboksRad, svar: Svar, no: Date): Vedtak {
  if (svar.slag === "http") {
    if (svar.status === 200 || svar.status === 201) {
      return { handling: "ferdig", server_id: svar.server_id };
    }
    if (svar.status === 401) return { handling: "refresh" };
    const forbigaaende = svar.status === 408 || svar.status === 429 || svar.status >= 500;
    if (!forbigaaende) {
      return { handling: "feil", feil: svar.melding || `Serveren svarte ${svar.status}.` };
    }
  }
  const forsok = rad.forsok + 1;
  const neste = new Date(no.getTime() + backoffSekund(forsok) * 1000);
  const feil = svar.slag === "nett" ? "Ingen dekning" : svar.melding || `Serveren svarte ${svar.status}.`;
  return { handling: "venter", forsok, neste_forsok_kl: neste.toISOString(), feil };
}
