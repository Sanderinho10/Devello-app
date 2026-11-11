import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { useMemo, useSyncExternalStore } from "react";
import { lager } from "./lager";
import type { Payload, UtboksRad, UtboksStatus, UtboksType } from "./typer";

/**
 * Utboksen: alt montøren har skrevet som ikke er bekreftet av serveren.
 *
 * Radene ligger på disk (lager.ts). En kopi av den innloggedes rader holdes
 * i minnet og deles ut via useUtboks(), så fanene kan vise «Sendes …» uten
 * å spørre lageret på hver render. All skriving går gjennom denne fila.
 *
 * Hver rad eies av brukeren som skrev den. Logger en annen inn på samme
 * telefon, blir radene liggende urørt til eieren er tilbake — de sendes
 * aldri med en annens token.
 */

let brukerId: string | null = null;
let kopi: UtboksRad[] = [];
const lyttere = new Set<() => void>();

function varsle() {
  for (const l of lyttere) l();
}

async function lesInn(): Promise<UtboksRad[]> {
  const alleRader = await lager.lesAlle();
  kopi = brukerId ? alleRader.filter((r) => r.bruker_id === brukerId) : [];
  varsle();
  return kopi;
}

/**
 * Hvem som er innlogget. Rader fra før eierskap fantes (bruker_id tom) går
 * til den første som logger inn. Null ved utlogging: utboksen vises tom.
 */
export async function settBruker(id: string | null): Promise<void> {
  brukerId = id;
  if (id) {
    for (const r of await lager.lesAlle()) {
      if (!r.bruker_id) await lager.oppdater(r.id, { bruker_id: id });
    }
  }
  await lesInn();
}

function abonner(l: () => void) {
  lyttere.add(l);
  return () => {
    lyttere.delete(l);
  };
}

function hentKopi() {
  return kopi;
}

/** Den innloggedes rader, oppdatert ved hver skriving. */
export function useUtboks(): UtboksRad[] {
  return useSyncExternalStore(abonner, hentKopi, hentKopi);
}

/** Radene for én ordre, i opprettelsesrekkefølge. */
export function useUtboksForOrdre(ordreId: string): UtboksRad[] {
  const alleRader = useUtboks();
  return useMemo(() => alleRader.filter((r) => r.ordre_id === ordreId), [alleRader, ordreId]);
}

/** Den innloggedes rader, ferskt fra lageret. */
export async function alle(): Promise<UtboksRad[]> {
  return lesInn();
}

export interface NyRad {
  ordre_id: string;
  type: UtboksType;
  payload: Payload;
  fil_sti?: string | null;
  avhengig_av?: string | null;
  /** Bruk en ferdig laget client_id når andre rader skal peke på den (bilde → notat). */
  client_id?: string;
}

export function nyClientId(): string {
  return Crypto.randomUUID();
}

export async function leggTil(ny: NyRad): Promise<UtboksRad> {
  if (!brukerId) throw new Error("Ikke innlogget.");
  if (!ny.ordre_id) throw new Error("Mangler ordre — gå tilbake og åpne ordren på nytt.");
  const id = await lager.settInn({
    client_id: ny.client_id ?? nyClientId(),
    ordre_id: ny.ordre_id,
    type: ny.type,
    payload: JSON.stringify(ny.payload),
    fil_sti: ny.fil_sti ?? null,
    avhengig_av: ny.avhengig_av ?? null,
    status: "venter",
    feil: null,
    forsok: 0,
    laga_kl: new Date().toISOString(),
    neste_forsok_kl: null,
    server_id: null,
    bruker_id: brukerId,
  });
  const rad = (await lesInn()).find((r) => r.id === id);
  if (!rad) throw new Error("Raden ble ikke lagret.");
  return rad;
}

export async function oppdater(
  id: number,
  felt: Partial<Pick<UtboksRad, "status" | "feil" | "forsok" | "neste_forsok_kl" | "server_id" | "payload">>,
): Promise<void> {
  await lager.oppdater(id, felt);
  await lesInn();
}

/** Sletter raden og bildefila om den finnes. Et notat tar bildene sine med seg. */
export async function slett(id: number): Promise<void> {
  const rad = kopi.find((r) => r.id === id) ?? (await lesInn()).find((r) => r.id === id);
  if (!rad) return;
  const medBilder = rad.type === "notat" ? kopi.filter((r) => r.type === "bilete" && r.avhengig_av === rad.client_id && !rad.server_id) : [];
  for (const r of [rad, ...medBilder]) {
    await lager.slett(r.id);
    if (r.fil_sti) slettFil(r.fil_sti);
  }
  await lesInn();
}

/** Raden er sendt: bort fra utboksen. Bildene til et sendt notat blir stående — de skal sendes etterpå. */
export async function fjernSendt(id: number): Promise<void> {
  const rad = kopi.find((r) => r.id === id);
  await lager.slett(id);
  if (rad?.fil_sti) slettFil(rad.fil_sti);
  await lesInn();
}

/** Notatet er sendt: legg server-ID-en inn i bildene som venter på det. */
export async function settNoteIdPaaBilete(avhengigAv: string, noteId: string): Promise<void> {
  const bilder = (await lesInn()).filter((r) => r.type === "bilete" && r.avhengig_av === avhengigAv);
  for (const b of bilder) {
    const payload = JSON.parse(b.payload) as Record<string, unknown>;
    await lager.oppdater(b.id, { payload: JSON.stringify({ ...payload, note_id: noteId }) });
  }
  if (bilder.length) await lesInn();
}

/** Brukeren trykket «Prøv igjen»: tilbake i køen uten backoff. */
export async function proevIgjen(id: number): Promise<void> {
  await oppdater(id, { status: "venter", feil: null, forsok: 0, neste_forsok_kl: null });
}

/** Rader som sto i «sender» da appen døde: tilbake til «venter». Kalles ved oppstart. */
export async function nullstillSender(): Promise<void> {
  for (const r of await lager.lesAlle()) {
    if (r.status === "sender") await lager.oppdater(r.id, { status: "venter" });
  }
  await lesInn();
}

export function antall(rader: UtboksRad[]): Record<UtboksStatus, number> {
  const n: Record<UtboksStatus, number> = { venter: 0, sender: 0, feil: 0 };
  for (const r of rader) n[r.status]++;
  return n;
}

function slettFil(sti: string) {
  try {
    const f = new File(sti);
    if (f.exists) f.delete();
  } catch {
    // Fila er alt borte — ikke noe å gjøre.
  }
}
