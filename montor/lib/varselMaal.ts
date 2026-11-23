import type { PushData } from "./typer";

/**
 * Hvor et trykk på et varsel fører: ordren når den finnes og oppdraget
 * ikke er tatt bort, ellers programmet. Samme regel for push og for lista.
 */
export function varselMaal(v: { type?: string | null; order_id?: string | null }): string {
  if (!v.order_id || v.type === "fjerna_oppdrag") return "/";
  // Et nytt oppdrag: montøren skal se hva jobben er og hva som er tilbudt.
  return `/ordrer/${v.order_id}/${v.type === "nytt_oppdrag" ? "jobben" : "timer"}`;
}

/** Plukker det vi trenger ut av pushens data, uansett hva som ellers ligger der. */
export function lesPushData(data: unknown): PushData {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    type: typeof d.type === "string" ? d.type : undefined,
    event_id: typeof d.event_id === "string" ? d.event_id : null,
    order_id: typeof d.order_id === "string" ? d.order_id : null,
  };
}

/**
 * Hvor en ordre åpner: jobben (beskrivelsen og tilbudet) før den er startet,
 * timene når den er i gang.
 */
export function ordreSti(id: string, status: string): `/ordrer/${string}/jobben` | `/ordrer/${string}/timer` {
  return status === "opna" ? `/ordrer/${id}/jobben` : `/ordrer/${id}/timer`;
}
