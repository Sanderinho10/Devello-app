import type { Lager, UtboksRad } from "./typer";

/**
 * Nettleserutgaven av utbokslageret: localStorage. Bare til forhåndsvisning
 * under utvikling (npm run web). Appen som gis ut bruker SQLite (lager.ts).
 */

const NOKKEL = "devello-montor-utboks";

function les(): UtboksRad[] {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(NOKKEL) ?? "[]") as UtboksRad[];
  } catch {
    return [];
  }
}

function skriv(rader: UtboksRad[]) {
  globalThis.localStorage?.setItem(NOKKEL, JSON.stringify(rader));
}

export const lager: Lager = {
  async lesAlle() {
    return les().sort((a, b) => (a.laga_kl < b.laga_kl ? -1 : a.laga_kl > b.laga_kl ? 1 : a.id - b.id));
  },
  async settInn(rad) {
    const rader = les();
    const id = rader.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    skriv([...rader, { ...rad, id }]);
    return id;
  },
  async oppdater(id, felt) {
    skriv(les().map((r) => (r.id === id ? { ...r, ...felt } : r)));
  },
  async slett(id) {
    skriv(les().filter((r) => r.id !== id));
  },
};
