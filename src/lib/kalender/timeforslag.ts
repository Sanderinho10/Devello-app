/**
 * Forslag til timeføring frå kalenderen.
 *
 * Var Noah sett opp på ordre 1001 måndag 10–15, foreslår vi 5 timar på
 * ordre 1001 måndag. Reint, utan database — testa i test:kalender.
 *
 * Reglane:
 *   - Berre oppdrag (ikkje møte, fravær eller anna) og ikkje heildagsavtalar,
 *     som ikkje seier noko om timar.
 *   - Éin rad per montør, ordre og dag. To oppdrag på same ordre same dag
 *     blir lagde saman.
 *   - Delen av avtalen som har starta. Eit oppdrag som går 10–15 gir
 *     forslag frå klokka 10, med heile lengda: montøren fører gjerne før
 *     han går heim.
 *   - Har montøren ført noko som helst på ordren den dagen, er dagen gjort.
 *     Då har han teke stilling, og eit «0,5 t att» ville berre mase.
 *   - Rundar til næraste kvarter.
 */

export interface OppdragForForslag {
  id: string;
  kind: string;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  order_id: string;
  deltakarar: string[];
}

export interface FoertTime {
  order_id: string;
  user_id: string;
  work_date: string;
  hours: number;
}

export interface Timeforslag {
  user_id: string;
  order_id: string;
  work_date: string;
  event_ids: string[];
  /** Første start og siste slutt den dagen, til visning: «10:00–15:00». */
  fra: string;
  til: string;
  timar: number;
}

export function lagTimeforslag(input: {
  oppdrag: OppdragForForslag[];
  foert: FoertTime[];
  dagar: { dato: string; start: Date; slutt: Date }[];
  no: Date;
  /** Berre for desse brukarane. Utan: alle deltakarane. */
  brukarar?: Set<string>;
}): Timeforslag[] {
  const harFoert = new Set(input.foert.map((f) => `${f.user_id}|${f.order_id}|${f.work_date}`));
  const forslag = new Map<string, Timeforslag & { ms: number }>();

  for (const h of input.oppdrag) {
    if (h.kind !== "oppdrag" || h.all_day || !h.order_id) continue;
    const start = new Date(h.starts_at);
    const slutt = new Date(h.ends_at);
    if (start > input.no) continue;

    for (const dag of input.dagar) {
      const fra = start > dag.start ? start : dag.start;
      const til = slutt < dag.slutt ? slutt : dag.slutt;
      if (til <= fra || fra > input.no) continue;

      for (const userId of h.deltakarar) {
        if (input.brukarar && !input.brukarar.has(userId)) continue;
        const nokkel = `${userId}|${h.order_id}|${dag.dato}`;
        if (harFoert.has(nokkel)) continue;
        const finst = forslag.get(nokkel);
        if (finst) {
          finst.ms += til.getTime() - fra.getTime();
          finst.event_ids.push(h.id);
          if (fra.toISOString() < finst.fra) finst.fra = fra.toISOString();
          if (til.toISOString() > finst.til) finst.til = til.toISOString();
        } else {
          forslag.set(nokkel, {
            user_id: userId,
            order_id: h.order_id,
            work_date: dag.dato,
            event_ids: [h.id],
            fra: fra.toISOString(),
            til: til.toISOString(),
            timar: 0,
            ms: til.getTime() - fra.getTime(),
          });
        }
      }
    }
  }

  return [...forslag.values()]
    .map(({ ms, ...f }) => ({ ...f, timar: Math.min(24, Math.round((ms / 3_600_000) * 4) / 4) }))
    .filter((f) => f.timar > 0)
    .sort((a, b) => (a.work_date < b.work_date ? 1 : a.work_date > b.work_date ? -1 : a.fra.localeCompare(b.fra)));
}
