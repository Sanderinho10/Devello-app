import { ORDER_STATUS_LABELS, type OrderEvent, type OrderStatus } from "@/lib/types";

/** «opna → paagaar» i loggen blir «Åpen → Pågår» på skjermen. */
export function hendelseTekst(h: Pick<OrderEvent, "kind" | "note">): string {
  if (h.kind === "oppretta") return `Ordre opprettet${h.note ? ` — ${h.note.toLowerCase()}` : ""}`;
  if (h.kind === "status" && h.note) {
    const [fra, til] = h.note.split("→").map((s) => s.trim()) as OrderStatus[];
    const navn = (s: OrderStatus) => ORDER_STATUS_LABELS[s] ?? s;
    return `Status: ${navn(fra)} → ${navn(til)}`;
  }
  if (h.kind === "redigert") return `Redigert${h.note ? ` — ${h.note}` : ""}`;
  return h.note ?? h.kind;
}
