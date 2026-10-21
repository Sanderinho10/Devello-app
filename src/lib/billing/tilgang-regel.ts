/**
 * Regelen for tilgang, uten databasen — så den kan testes
 * (scripts/test-tilgang.ts). Se lib/billing/tilgang.ts.
 */

/** Dager fra forfall til kontoen deaktiveres. */
export const DAGER_TIL_DEAKTIVERING = 30;

export type TilgangGrunn = "unntak" | "abonnement" | "prove" | "ingen" | "deaktivert";

export interface UbetaltFaktura {
  fakturanr: string;
  belopNok: number;
  forfall: string;
  /** Dagen kontoen deaktiveres (YYYY-MM-DD). */
  deaktiveres: string;
  /** Hele dager igjen til deaktivering. 0 eller mindre: deaktivert. */
  dagerIgjen: number;
}

export interface Tilgang {
  aktiv: boolean;
  grunn: TilgangGrunn;
  /** Den eldste forfalte, ubetalte fakturaen. Null for unntak. */
  ubetalt: UbetaltFaktura | null;
  trialEndsAt: string | null;
}

export interface TilgangInput {
  unntak: boolean;
  harAbonnement: boolean;
  trialEndsAt: string | null;
  fakturaer: { fakturanr: string; belop_nok: number | string; forfall: string; betalt_at: string | null }[];
  no?: Date;
}

const DAG_MS = 24 * 60 * 60 * 1000;

function datoUtc(iso: string): number {
  const [aar, mnd, dag] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(aar, mnd - 1, dag);
}

/** Reint og testbart: tilgangen gitt flagg, abonnement, prøvetid og fakturaer. */
export function vurderTilgang(input: TilgangInput): Tilgang {
  const no = input.no ?? new Date();
  const trialEndsAt = input.trialEndsAt;
  if (input.unntak) return { aktiv: true, grunn: "unntak", ubetalt: null, trialEndsAt };

  const idag = Date.UTC(no.getUTCFullYear(), no.getUTCMonth(), no.getUTCDate());
  const forfalte = input.fakturaer
    .filter((f) => !f.betalt_at && datoUtc(f.forfall) < idag)
    .sort((a, b) => datoUtc(a.forfall) - datoUtc(b.forfall));

  let ubetalt: UbetaltFaktura | null = null;
  if (forfalte.length) {
    const f = forfalte[0];
    const deaktiveres = datoUtc(f.forfall) + DAGER_TIL_DEAKTIVERING * DAG_MS;
    ubetalt = {
      fakturanr: f.fakturanr,
      belopNok: Number(f.belop_nok),
      forfall: f.forfall.slice(0, 10),
      deaktiveres: new Date(deaktiveres).toISOString().slice(0, 10),
      dagerIgjen: Math.round((deaktiveres - idag) / DAG_MS),
    };
    if (ubetalt.dagerIgjen <= 0) return { aktiv: false, grunn: "deaktivert", ubetalt, trialEndsAt };
  }

  if (input.harAbonnement) return { aktiv: true, grunn: "abonnement", ubetalt, trialEndsAt };
  if (trialEndsAt && new Date(trialEndsAt) > no) return { aktiv: true, grunn: "prove", ubetalt, trialEndsAt };
  return { aktiv: false, grunn: "ingen", ubetalt, trialEndsAt };
}
