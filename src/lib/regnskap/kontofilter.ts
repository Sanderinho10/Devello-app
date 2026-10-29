import type { ConnectionSettings } from "@/lib/types";

/**
 * Kontofilteret: hvilke inngående fakturaer som skal hentes fra
 * regnskapssystemet.
 *
 * En elektriker får strøm, husleie og regnskapsføreren sin faktura inn i
 * Go også — ingen av dem hører hjemme på en ordre. Varekjøpet står på
 * 4000–4999 i norsk standard kontoplan, og det er standarden her. Noen
 * fører underentreprenører på 45xx og vil ha dem med; andre ikke. Derfor
 * redigerbart, og mulig å skru av.
 */
export interface Kontofilter {
  enabled: boolean;
  from: number;
  to: number;
}

export const STANDARD_KONTOFILTER: Kontofilter = { enabled: true, from: 4000, to: 4999 };

export function kontofilterAv(settings: ConnectionSettings | null | undefined): Kontofilter {
  const f = settings?.account_filter;
  if (!f) return STANDARD_KONTOFILTER;
  return normaliserKontofilter(f) ?? STANDARD_KONTOFILTER;
}

/** Validerer det som kommer fra skjemaet. Null når det ikke gir mening. */
export function normaliserKontofilter(inn: unknown): Kontofilter | null {
  if (!inn || typeof inn !== "object") return null;
  const o = inn as Record<string, unknown>;
  const from = Math.trunc(Number(o.from));
  const to = Math.trunc(Number(o.to));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from < 1000 || to > 9999 || from > to) return null;
  return { enabled: Boolean(o.enabled), from, to };
}

export function kontofilterTekst(f: Kontofilter): string {
  return `${f.from}–${f.to}`;
}
