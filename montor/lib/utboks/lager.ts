import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import type { Lager, UtboksRad } from "./typer";

/**
 * Utboksen på disk: SQLite. Ingenting forsvinner om appen blir drept midt
 * i en sending — raden ligger til serveren har svart 200/201.
 *
 * lager.web.ts er nettleserutgaven, bare til forhåndsvisning.
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
    server_id TEXT,
    bruker_id TEXT
  );
  CREATE INDEX IF NOT EXISTS utboks_ordre ON utboks(ordre_id);
`;

const KOLONNER = ["status", "feil", "forsok", "neste_forsok_kl", "server_id", "payload", "bruker_id"] as const;

let dbPromise: Promise<SQLiteDatabase> | null = null;

function db(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await openDatabaseAsync("utboks.db");
      await d.execAsync("PRAGMA journal_mode = WAL;");
      await d.execAsync(SKJEMA);
      // Tabeller laget før bruker_id fantes: legg kolonnen til.
      const kolonner = await d.getAllAsync<{ name: string }>("PRAGMA table_info(utboks)");
      if (!kolonner.some((k) => k.name === "bruker_id")) {
        await d.execAsync("ALTER TABLE utboks ADD COLUMN bruker_id TEXT;");
      }
      return d;
    })();
  }
  return dbPromise;
}

export const lager: Lager = {
  async lesAlle() {
    return (await db()).getAllAsync<UtboksRad>("SELECT * FROM utboks ORDER BY laga_kl, id");
  },

  async settInn(rad) {
    const res = await (await db()).runAsync(
      "INSERT INTO utboks (client_id, ordre_id, type, payload, fil_sti, avhengig_av, status, feil, forsok, laga_kl, neste_forsok_kl, server_id, bruker_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      rad.client_id,
      rad.ordre_id,
      rad.type,
      rad.payload,
      rad.fil_sti,
      rad.avhengig_av,
      rad.status,
      rad.feil,
      rad.forsok,
      rad.laga_kl,
      rad.neste_forsok_kl,
      rad.server_id,
      rad.bruker_id,
    );
    return res.lastInsertRowId;
  },

  async oppdater(id, felt) {
    const kolonner = KOLONNER.filter((k) => k in felt);
    if (!kolonner.length) return;
    await (await db()).runAsync(
      `UPDATE utboks SET ${kolonner.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      ...kolonner.map((k) => felt[k] ?? null),
      id,
    );
  },

  async slett(id) {
    await (await db()).runAsync("DELETE FROM utboks WHERE id = ?", id);
  },
};
