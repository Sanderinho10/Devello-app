import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { useSyncExternalStore } from "react";
import type { Payload, UtboksRad, UtboksStatus, UtboksType } from "./typer";

/**
 * Utboksen i SQLite. Ingenting forsvinner om appen blir drept midt i en
 * sending: raden ligger til serveren har svart 200/201.
 *
 * En kopi av alle radene holdes i minnet og deles ut via useUtboks(), så
 * fanene kan vise «Sendes …» uten å spørre databasen på hver render.
 * Hver skriving går gjennom denne fila og oppdaterer kopien.
 */

const SKJEMA = `
  CREATE TABLE IF NOT EXISTS utboks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    ordre_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    fil_sti TEXT,
    avhengig_av TEXT,
    status TEXT NOT NULL DEFAULT 'venter',
    feil TEXT,
    forsok INTEGER NOT NULL DEFAULT 0,
    laga_kl TEXT NOT NULL,
    neste_forsok_kl TEXT,
    server_id TEXT
  );
  CREATE INDEX IF NOT EXISTS utboks_ordre ON utboks(ordre_id);
`;

let dbPromise: Promise<SQLiteDatabase> | null = null;

function db(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await openDatabaseAsync("utboks.db");
      await d.execAsync("PRAGMA journal_mode = WAL;");
      await d.execAsync(SKJEMA);
      return d;
    })();
  }
  return dbPromise;
}

// --- kopi i minnet + lyttere ----------------------------------------------

let kopi: UtboksRad[] = [];
let lastet = false;
const lyttere = new Set<() => void>();

function varsle() {
  for (const l of lyttere) l();
}

async function lesAlle(): Promise<UtboksRad[]> {
  const d = await db();
  kopi = await d.getAllAsync<UtboksRad>("SELECT * FROM utboks ORDER BY laga_kl, id");
  lastet = true;
  varsle();
  return kopi;
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

/** Alle radene i utboksen, oppdatert ved hver skriving. Tom til databasen er lest. */
export function useUtboks(): UtboksRad[] {
  return useSyncExternalStore(abonner, hentKopi, hentKopi);
}

/** Radene for én ordre, i opprettelsesrekkefølge. */
export function useUtboksForOrdre(ordreId: string): UtboksRad[] {
  const alle = useUtboks();
  return alle.filter((r) => r.ordre_id === ordreId);
}

// --- skriving --------------------------------------------------------------

export async function alle(): Promise<UtboksRad[]> {
  return lastet ? kopi : lesAlle();
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
  const d = await db();
  const clientId = ny.client_id ?? nyClientId();
  const lagaKl = new Date().toISOString();
  const res = await d.runAsync(
    "INSERT INTO utboks (client_id, ordre_id, type, payload, fil_sti, avhengig_av, status, laga_kl) VALUES (?, ?, ?, ?, ?, ?, 'venter', ?)",
    clientId,
    ny.ordre_id,
    ny.type,
    JSON.stringify(ny.payload),
    ny.fil_sti ?? null,
    ny.avhengig_av ?? null,
    lagaKl,
  );
  await lesAlle();
  const rad = kopi.find((r) => r.id === res.lastInsertRowId);
  if (!rad) throw new Error("Raden ble ikke lagret.");
  return rad;
}

export async function oppdater(
  id: number,
  felt: Partial<Pick<UtboksRad, "status" | "feil" | "forsok" | "neste_forsok_kl" | "server_id" | "payload">>,
): Promise<void> {
  const d = await db();
  const kolonner = Object.keys(felt) as (keyof typeof felt)[];
  if (!kolonner.length) return;
  await d.runAsync(
    `UPDATE utboks SET ${kolonner.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...kolonner.map((k) => felt[k] ?? null),
    id,
  );
  await lesAlle();
}

/** Sletter raden og bildefila om den finnes. */
export async function slett(id: number): Promise<void> {
  const rad = kopi.find((r) => r.id === id) ?? (await alle()).find((r) => r.id === id);
  const d = await db();
  await d.runAsync("DELETE FROM utboks WHERE id = ?", id);
  if (rad?.fil_sti) slettFil(rad.fil_sti);
  await lesAlle();
}

/** Notatet er sendt: legg server-ID-en inn i bildene som venter på det. */
export async function settNoteIdPaaBilete(avhengigAv: string, noteId: string): Promise<void> {
  const d = await db();
  const bilder = (await alle()).filter((r) => r.type === "bilete" && r.avhengig_av === avhengigAv);
  for (const b of bilder) {
    const payload = JSON.parse(b.payload) as Record<string, unknown>;
    await d.runAsync("UPDATE utboks SET payload = ? WHERE id = ?", JSON.stringify({ ...payload, note_id: noteId }), b.id);
  }
  if (bilder.length) await lesAlle();
}

/** Brukeren trykket «Prøv igjen»: tilbake i køen uten backoff. */
export async function proevIgjen(id: number): Promise<void> {
  await oppdater(id, { status: "venter", feil: null, forsok: 0, neste_forsok_kl: null });
}

/** Rader som sto i «sender» da appen døde: tilbake til «venter». Kalles ved oppstart. */
export async function nullstillSender(): Promise<void> {
  const d = await db();
  await d.runAsync("UPDATE utboks SET status = 'venter' WHERE status = 'sender'");
  await lesAlle();
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
