import { supabase } from "./supabase";

/**
 * fetch-wrapper mot nettappens API.
 *
 * - Base-URL fra EXPO_PUBLIC_API_URL, Bearer-token fra Supabase-sesjonen
 *   hentet rett før hvert kall.
 * - 401 → prøv å fornye sesjonen én gang, så logg ut.
 * - Feil fra serveren → ApiFeil { status, melding } med serverens egen
 *   tekst (bokmål, kan vises som den er). Nettverksfeil → NettFeil.
 */

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** En server som ikke svarer skal gi «Ingen dekning», ikke en evig spinner. */
const TIDSGRENSE_MS = 20_000;

export class ApiFeil extends Error {
  status: number;
  melding: string;
  constructor(status: number, melding: string) {
    super(melding);
    this.name = "ApiFeil";
    this.status = status;
    this.melding = melding;
  }
}

export class NettFeil extends Error {
  constructor() {
    super("Ingen dekning");
    this.name = "NettFeil";
  }
}

export async function hentToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Forny sesjonen. Usant når det ikke gikk — da er refresh-tokenet dødt og
 * brukeren må logge inn på nytt.
 */
export async function fornySesjon(): Promise<boolean> {
  const { data, error } = await supabase.auth.refreshSession();
  return !error && !!data.session;
}

export interface Svar {
  status: number;
  /** Parsed JSON, eller null når kroppen ikke var JSON. */
  json: unknown;
}

function feilmelding(json: unknown, status: number): string {
  if (json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string") {
    return (json as { error: string }).error;
  }
  return `Serveren svarte ${status}.`;
}

/**
 * Rått kall: kaster bare NettFeil. 4xx/5xx kommer tilbake som status, så
 * utboks-motoren kan bestemme selv. Prøver refresh én gang på 401.
 */
export async function kall(
  sti: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  proevdRefresh = false,
): Promise<Svar> {
  const token = await hentToken();
  const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  let res: Response;
  const avbryt = new AbortController();
  const tidsur = setTimeout(() => avbryt.abort(), TIDSGRENSE_MS);
  try {
    res = await fetch(`${API_URL}${sti}`, { method: init.method ?? "GET", headers, body, signal: avbryt.signal });
  } catch {
    throw new NettFeil();
  } finally {
    clearTimeout(tidsur);
  }

  if (res.status === 401 && !proevdRefresh && (await fornySesjon())) {
    return kall(sti, init, true);
  }

  let json: unknown = null;
  const tekst = await res.text();
  if (tekst) {
    try {
      json = JSON.parse(tekst);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json };
}

/** Vanlig kall: JSON inn, typet JSON ut, ApiFeil på alt som ikke er 2xx. */
export async function api<T>(sti: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const svar = await kall(sti, init);
  if (svar.status === 401) {
    // Refresh feilet — sesjonen er død. Logg ut så innloggingen vises.
    await supabase.auth.signOut();
    throw new ApiFeil(401, "Ikke innlogget");
  }
  if (svar.status < 200 || svar.status >= 300) {
    throw new ApiFeil(svar.status, feilmelding(svar.json, svar.status));
  }
  return svar.json as T;
}

/** Teksten montøren skal se for en feil — serverens egen, eller «Ingen dekning». */
export function feilTekst(feil: unknown): string {
  if (feil instanceof ApiFeil) return feil.melding;
  if (feil instanceof NettFeil) return "Ingen dekning";
  if (feil instanceof Error && feil.message) return feil.message;
  return "Noe gikk galt.";
}
