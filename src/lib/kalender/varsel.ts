/**
 * Kven skal varslast når ein avtale blir laga, endra eller sletta — og kva
 * skal stå i varselet. Reint, utan database, så det kan testast.
 *
 * Reglane:
 *   - Den som gjer endringa, får ikkje varsel om si eiga endring.
 *   - Fravær blir ikkje varsla: det er ofte montøren sjølv som har bede om det.
 *   - Avtalar som alt er over, blir ikkje varsla.
 *   - Avtalar utan deltakarar (heile firmaet) blir ikkje varsla — det ville
 *     vore eit varsel til alle for kvart møte.
 *   - Ny deltakar → «nytt». Fjerna deltakar → «fjerna». Same deltakar, men
 *     ny tid, stad eller ordre → «endra». Endra tittel eller beskrivelse åleine
 *     er ikkje verdt eit varsel.
 */

import type { HendingType } from "./tid";

export type VarselType = "nytt_oppdrag" | "endra_oppdrag" | "fjerna_oppdrag";

export interface HendingForVarsel {
  kind: HendingType;
  order_id: string | null;
  order_no?: number | null;
  /** Tittelen som blir vist: eigen tittel eller ordretittelen. */
  title: string;
  location: string | null;
  site_address?: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  deltakarar: string[];
}

export interface Mottakar {
  userId: string;
  kind: VarselType;
}

function skalVarslast(h: HendingForVarsel | null, no: Date): h is HendingForVarsel {
  return Boolean(h && h.kind !== "fravaer" && new Date(h.ends_at) > no);
}

function same(a: HendingForVarsel, b: HendingForVarsel): boolean {
  return (
    new Date(a.starts_at).getTime() === new Date(b.starts_at).getTime() &&
    new Date(a.ends_at).getTime() === new Date(b.ends_at).getTime() &&
    a.all_day === b.all_day &&
    a.order_id === b.order_id &&
    (a.location ?? "") === (b.location ?? "")
  );
}

export function kvenSkalVarslast(
  foer: HendingForVarsel | null,
  etter: HendingForVarsel | null,
  avsenderId: string,
  no = new Date(),
): Mottakar[] {
  const varsleFoer = skalVarslast(foer, no);
  const varsleEtter = skalVarslast(etter, no);
  const foerSett = new Set(varsleFoer ? foer.deltakarar : []);
  const etterSett = new Set(varsleEtter ? etter.deltakarar : []);
  const ut: Mottakar[] = [];

  for (const id of etterSett) {
    if (id === avsenderId) continue;
    if (!foerSett.has(id)) ut.push({ userId: id, kind: "nytt_oppdrag" });
    else if (!same(foer!, etter!)) ut.push({ userId: id, kind: "endra_oppdrag" });
  }
  for (const id of foerSett) {
    if (id === avsenderId || etterSett.has(id)) continue;
    // Var avtalen før og er han ikkje lenger aktuell (sletta, over, blitt
    // fravær), er det òg «fjerna» for dei som var med.
    ut.push({ userId: id, kind: "fjerna_oppdrag" });
  }
  return ut;
}

/** «man. 9. nov. 10:00–15:00» i norsk tid, uansett kvar tenaren står. */
export function naarTekst(h: { starts_at: string; ends_at: string; all_day: boolean }): string {
  const tz = "Europe/Oslo";
  const start = new Date(h.starts_at);
  const slutt = new Date(h.ends_at);
  const dag = new Intl.DateTimeFormat("nb-NO", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
  const kl = new Intl.DateTimeFormat("nb-NO", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  if (h.all_day) {
    const siste = new Date(slutt.getTime() - 12 * 3_600_000); // ein stad på siste dag
    return dag.format(start) === dag.format(siste) ? `${dag.format(start)}, hele dagen` : `${dag.format(start)} – ${dag.format(siste)}`;
  }
  return dag.format(start) === dag.format(slutt)
    ? `${dag.format(start)} ${kl.format(start)}–${kl.format(slutt)}`
    : `${dag.format(start)} ${kl.format(start)} – ${dag.format(slutt)} ${kl.format(slutt)}`;
}

/** Overskrift og tekst til varselet. Kort nok for ein push på låseskjermen. */
export function varselTekst(kind: VarselType, h: HendingForVarsel): { title: string; body: string } {
  const namn = h.kind === "oppdrag" && h.order_no ? `#${h.order_no} ${h.title}` : h.title;
  const stad = h.location || h.site_address || "";
  const naar = naarTekst(h);
  const ny = h.kind === "oppdrag" ? "Nytt oppdrag" : "Ny avtale";
  switch (kind) {
    case "nytt_oppdrag":
      return { title: `${ny}: ${namn}`, body: [naar, stad].filter(Boolean).join(" · ") };
    case "endra_oppdrag":
      return { title: `Endret: ${namn}`, body: `Nå: ${[naar, stad].filter(Boolean).join(" · ")}` };
    case "fjerna_oppdrag":
      return { title: `Avlyst for deg: ${namn}`, body: `Var: ${naar}` };
  }
}
