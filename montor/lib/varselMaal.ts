import type { PushData } from "./typer";

/**
 * Hvor et trykk på et varsel fører: ordren når den finnes og oppdraget
 * ikke er tatt bort, ellers programmet. Samme regel for push og for lista.
 */
export function varselMaal(v: { type?: string | null; order_id?: string | null }): string {
  return v.order_id && v.type !== "fjerna_oppdrag" ? `/ordrer/${v.order_id}/timer` : "/";
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
