import type { QueryClient } from "@tanstack/react-query";
import type { Bilete, MaterialEntry, Meg, OrderNote, Order, OrdreIApp, TimeEntry } from "../typer";
import type { UtboksRad } from "./typer";

/**
 * Serveren har tatt imot en rad: legg svaret rett inn i ordren som ligger i
 * react-query, så raden står i lista i det utboksmerket forsvinner — uten
 * et blink mens ordren hentes på nytt. Ordren hentes likevel på nytt
 * etterpå; dette er bare broen dit.
 */
export function leggSvarIOrdre(ordre: OrdreIApp, rad: UtboksRad, json: unknown, meg: Meg | undefined): OrdreIApp {
  if (!json || typeof json !== "object") return ordre;
  const navn = meg?.user.full_name || meg?.user.email || "";
  const finnes = (liste: { id: string }[], id: string) => liste.some((x) => x.id === id);

  switch (rad.type) {
    case "time": {
      const t = json as TimeEntry;
      if (!t.id || finnes(ordre.timer, t.id)) return ordre;
      return { ...ordre, timer: [{ ...t, user_name: navn }, ...ordre.timer] };
    }
    case "materiell": {
      const m = json as MaterialEntry;
      if (!m.id || finnes(ordre.materiell, m.id)) return ordre;
      return { ...ordre, materiell: [m, ...ordre.materiell] };
    }
    case "notat": {
      const n = json as OrderNote;
      if (!n.id || finnes(ordre.notat, n.id)) return ordre;
      return { ...ordre, notat: [{ ...n, user_name: navn, bilete: [] }, ...ordre.notat] };
    }
    case "bilete": {
      const d = json as { id?: string; title?: string; file_name?: string | null; created_at?: string; note_id?: string | null };
      if (!d.id || finnes(ordre.bilete, d.id)) return ordre;
      const bilde: Bilete = {
        id: d.id,
        title: d.title ?? "Bilde",
        file_name: d.file_name ?? null,
        created_at: d.created_at ?? new Date().toISOString(),
        note_id: d.note_id ?? null,
      };
      return {
        ...ordre,
        bilete: [bilde, ...ordre.bilete],
        notat: ordre.notat.map((n) => (n.id === bilde.note_id ? { ...n, bilete: [...n.bilete, bilde] } : n)),
      };
    }
    case "status": {
      const o = json as Order;
      if (!o.id || !o.status) return ordre;
      // Hvilke overganger som er lov nå, vet bare serveren — tomt til ordren er hentet på nytt.
      return { ...ordre, ordre: { ...ordre.ordre, status: o.status, updated_at: o.updated_at ?? ordre.ordre.updated_at }, lovlege_overgangar: [] };
    }
  }
}

export function leggSvarICache(qc: QueryClient, rad: UtboksRad, json: unknown): void {
  const meg = qc.getQueryData<Meg>(["meg"]);
  qc.setQueryData<OrdreIApp>(["ordre", rad.ordre_id], (ordre) => (ordre ? leggSvarIOrdre(ordre, rad, json, meg) : ordre));
}
