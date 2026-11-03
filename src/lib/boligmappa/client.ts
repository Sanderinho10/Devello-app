import type { SupabaseClient } from "@supabase/supabase-js";
import { boligmappaUrlar, refreshBoligmappaTokens, type BoligmappaMiljo } from "./oauth";

/**
 * Boligmappa Proff API — det vi bruker.
 *
 * Adressesøk → eiendommer på adressen → plant (firmaets arbeidsflate på
 * eiendommen) → filer. Tokens ligger i boligmappa_connections bak service
 * role og fornyes her når det er under to minutter igjen. Svarer Boligmappa
 * 401 etter fornying, settes koplinga i feil med beskjed om å logge inn på
 * nytt.
 *
 * Dokumentasjonen skriver bare «Authorization: {token}». Vi prøver Bearer
 * først og faller tilbake til rå token ved 401 — og husker per prosess hva
 * som virket.
 */

export class BoligmappaFeil extends Error {
  // Egen feltdeklarasjon, ikke «public status» i konstruktøren: Node sin
  // strip-only TypeScript (scripts/nattjobb.ts) støtter ikke parameter
  // properties, og denne modulen lastes derfra.
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BoligmappaFeil";
    this.status = status;
  }
}

/** En gate fra /search/streets — slik Boligmappa sin egen søkekomponent leser den. */
export interface BmGate {
  id: string;
  streetName: string;
  postalCode: string | null;
  postalPlace: string | null;
  municipalityName: string | null;
}

/** En adresse fra /streets/{id}/addresses. id-en er den /addresses/{id}/properties tar. */
export interface BmAdresse {
  id: string;
  streetName: string | null;
  houseNumber: string | null;
  houseSubNumber: string | null;
  postalCode: string | null;
  postalPlace: string | null;
  raw: Record<string, unknown>;
}

export interface BmEigedom {
  boligmappaNumber: string;
  propertyType: string | null;
  unitNumber: string | null;
  address: string | null;
  cadastre: { knr?: string; gnr?: string; bnr?: string; fnr?: string; snr?: string } | null;
  raw: Record<string, unknown>;
}

export interface BmType {
  id: number;
  name: string;
}

export interface BmTyper {
  documentTypes: BmType[];
  chapterTags: BmType[];
  professionTypes: BmType[];
}

interface Kopling {
  id: string;
  company_id: string;
  environment: string;
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
  status: string;
}

let authScheme: "bearer" | "raw" = "bearer";
const typeCache = new Map<string, { henta: number; typer: BmTyper }>();

export async function boligmappaClient(admin: SupabaseClient, companyId: string) {
  const { data } = await admin
    .from("boligmappa_connections")
    .select("id, company_id, environment, access_token, refresh_token, expires_at, status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) throw new BoligmappaFeil("Boligmappa er ikke koblet til. Koble til under Selskap → Innstillinger → Ordre.", 400);
  const kopling = data as Kopling;
  const urls = boligmappaUrlar((kopling.environment as BoligmappaMiljo) ?? "production");

  async function token(tving = false): Promise<string> {
    const utloeper = kopling.expires_at ? new Date(kopling.expires_at).getTime() : 0;
    if (!tving && kopling.access_token && utloeper - Date.now() > 120_000) return kopling.access_token;
    try {
      const t = await refreshBoligmappaTokens(kopling.refresh_token);
      kopling.access_token = t.access_token;
      kopling.refresh_token = t.refresh_token ?? kopling.refresh_token;
      kopling.expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
      await admin
        .from("boligmappa_connections")
        .update({
          access_token: kopling.access_token,
          refresh_token: kopling.refresh_token,
          expires_at: kopling.expires_at,
          status: "aktiv",
          status_reason: null,
        })
        .eq("id", kopling.id);
      return kopling.access_token;
    } catch (err) {
      const m = "Logg inn i Boligmappa på nytt under Selskap → Innstillinger → Ordre.";
      await admin.from("boligmappa_connections").update({ status: "feil", status_reason: m }).eq("id", kopling.id);
      throw new BoligmappaFeil(`${m} (${err instanceof Error ? err.message : String(err)})`, 401);
    }
  }

  async function kall(method: string, path: string, body?: unknown, forsok = 0): Promise<Response> {
    const t = await token(forsok === 1);
    const res = await fetch(`${urls.api}${path}`, {
      method,
      headers: {
        Authorization: authScheme === "bearer" ? `Bearer ${t}` : t,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (process.env.NODE_ENV !== "production") console.log(`[boligmappa] ${method} ${path} → ${res.status}`);
    if (res.status === 401 && forsok === 0) {
      // Først: bytt skjema (Bearer ↔ rå). Så: friskt token.
      authScheme = authScheme === "bearer" ? "raw" : "bearer";
      const res2 = await fetch(`${urls.api}${path}`, {
        method,
        headers: {
          Authorization: authScheme === "bearer" ? `Bearer ${t}` : t,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res2.status !== 401) return res2;
      authScheme = authScheme === "bearer" ? "raw" : "bearer";
      return kall(method, path, body, 1);
    }
    if (res.status === 401) {
      const m = "Logg inn i Boligmappa på nytt under Selskap → Innstillinger → Ordre.";
      await admin.from("boligmappa_connections").update({ status: "feil", status_reason: m }).eq("id", kopling.id);
      throw new BoligmappaFeil(m, 401);
    }
    return res;
  }

  async function json<T>(method: string, path: string, body?: unknown, tillat: number[] = []): Promise<{ status: number; data: T | null }> {
    const res = await kall(method, path, body);
    const tekst = await res.text();
    if (!res.ok && !tillat.includes(res.status)) {
      throw new BoligmappaFeil(forklar(res.status, tekst, path), res.status);
    }
    if (!tekst.trim()) return { status: res.status, data: null };
    try {
      return { status: res.status, data: JSON.parse(tekst) as T };
    } catch {
      throw new BoligmappaFeil(`Boligmappa svarte med noe som ikke er JSON på ${path}`, 502);
    }
  }

  return {
    /**
     * Adressesøket går i to steg, slik Boligmappa sin egen søkekomponent
     * (@boligmappa/web-component-search) gjør det: først gatene som
     * matcher teksten, så adressene på gaten. /search/addresses gir
     * bruksenheter med egne id-er, og de tar ikke /addresses/{id}/properties.
     * Gater med postnummer 0000 eller uten poststed er filtrert bort, som
     * i komponenten.
     */
    async sokGater(q: string): Promise<BmGate[]> {
      const sti = `/search/streets?q=${encodeURIComponent(q)}&pagesize=10&page=1`;
      const { data } = await json<unknown>("GET", sti);
      return listeEllerForklar(data, sti)
        .map((o) => ({
          id: String(o.id ?? ""),
          streetName: String(o.streetName ?? o.street ?? ""),
          postalCode: str(o.postalCode),
          postalPlace: str(o.postalPlace),
          municipalityName: str(o.municipalityName),
        }))
        .filter((g) => g.id && g.streetName && g.postalCode !== "0000" && g.postalPlace);
    },

    async adresserPaaGate(streetId: string): Promise<BmAdresse[]> {
      const ut: BmAdresse[] = [];
      for (let side = 1; side <= 5; side++) {
        const sti = `/streets/${encodeURIComponent(streetId)}/addresses?pagesize=100&page=${side}`;
        const { data } = await json<unknown>("GET", sti);
        const del = listeEllerForklar(data, sti).map((o) => ({
          id: String(o.id ?? ""),
          streetName: str(o.streetName),
          houseNumber: str(o.houseNumber),
          houseSubNumber: str(o.houseSubNumber),
          postalCode: str(o.postalCode),
          postalPlace: str(o.postalPlace),
          raw: o,
        }));
        ut.push(...del.filter((a) => a.id));
        if (del.length < 100) break;
      }
      return ut;
    },

    async eigedomar(addressId: string): Promise<BmEigedom[]> {
      const sti = `/addresses/${encodeURIComponent(addressId)}/properties`;
      const { data } = await json<unknown>("GET", sti);
      return listeEllerForklar(data, sti).map((o) => ({
        boligmappaNumber: String(o.boligmappaNumber ?? ""),
        propertyType: str(o.propertyType),
        unitNumber: str(o.unitNumber),
        address: typeof o.address === "string" ? o.address : adresseTekst(o.address),
        cadastre: (o.cadastre && typeof o.cadastre === "object" ? o.cadastre : null) as BmEigedom["cadastre"],
        raw: o,
      }));
    },

    /** Plant for eiendommen: opprett, eller hent den som finnes (409). */
    async finnEllerOpprettPlant(boligmappaNumber: string): Promise<number> {
      // Svarene er pakket som { success, response: {…} } (verifisert mot
      // staging for adresser og eiendommer); objekt() pakker ut.
      const opprett = await json<unknown>("POST", "/plants", { boligmappaNumber }, [409]);
      if (opprett.status !== 409) {
        const id = plantId(objekt(opprett.data));
        if (id !== null) return id;
      }
      const hent = await json<unknown>("GET", `/plants/${encodeURIComponent(boligmappaNumber)}`);
      const id = plantId(objekt(hent.data));
      if (id === null) {
        throw new BoligmappaFeil(
          `Boligmappa svarte uten plant-id. POST /plants → ${opprett.status}: ${kort(opprett.data)}; GET /plants/${boligmappaNumber} → ${hent.status}: ${kort(hent.data)}`,
          502,
        );
      }
      return id;
    },

    async typer(): Promise<BmTyper> {
      const key = urls.api;
      const hit = typeCache.get(key);
      if (hit && Date.now() - hit.henta < 3_600_000) return hit.typer;
      const [d, c, p] = await Promise.all([
        json<unknown>("GET", "/types/documentTypes"),
        json<unknown>("GET", "/types/chapterTags"),
        json<unknown>("GET", "/types/professionTypes"),
      ]);
      const typer = { documentTypes: tilTypar(d.data), chapterTags: tilTypar(c.data), professionTypes: tilTypar(p.data) };
      typeCache.set(key, { henta: Date.now(), typer });
      return typer;
    },

    /** Registrerer fila og laster opp bytes til uploadLink. Svarer med Boligmappas fil-id. */
    async lastOppFil(
      boligmappaNumber: string,
      meta: {
        fileName: string;
        title: string;
        description: string;
        orderNumber: string;
        chapterTagId: number;
        professionTypeId: number;
        documentTypeId: number;
      },
      bytes: Buffer,
      contentType: string,
    ): Promise<string> {
      const { data: raa } = await json<unknown>("POST", `/plants/${encodeURIComponent(boligmappaNumber)}/files`, {
        fileName: meta.fileName,
        title: meta.title,
        description: meta.description,
        orderNumber: meta.orderNumber,
        isVisibleInBoligmappa: true,
        chapterTags: [{ id: meta.chapterTagId }],
        professionType: { id: meta.professionTypeId },
        documentType: { id: meta.documentTypeId },
        rooms: [],
      });
      const data = objekt(raa);
      const id = data?.id !== undefined ? String(data.id) : data?.fileId !== undefined ? String(data.fileId) : null;
      const uploadLink = str(data?.uploadLink ?? data?.uploadUrl ?? data?.url);
      if (!id || !uploadLink) {
        throw new BoligmappaFeil(`Boligmappa svarte uten opplastingslenke: ${kort(raa)}`, 502);
      }
      const put = await fetch(uploadLink, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes) });
      if (!put.ok) throw new BoligmappaFeil(`Opplastingen til Boligmappa feilet (${put.status}).`, 502);
      return id;
    },
  };
}

function forklar(status: number, tekst: string, hvor: string): string {
  if (status === 403) return "Boligmappa-brukeren har ikke tilgang til dette. Sjekk rettighetene i Boligmappa Bedrift.";
  if (status === 404) return `Boligmappa fant ikke ${hvor}.`;
  if (status === 429) return "Boligmappa begrenser antall kall akkurat nå. Prøv igjen om litt.";
  const kort = tekst.replace(/\s+/g, " ").slice(0, 200);
  return `Boligmappa svarte ${status}${kort ? `: ${kort}` : ""}`;
}

const LISTENØKLAR = ["data", "items", "results", "result", "value", "response", "addresses", "properties", "content"];

/** Ett objekt ut av svaret: { success, response: {…} } → {…}; en liste → første. */
function objekt(svar: unknown): Record<string, unknown> | null {
  if (!svar || typeof svar !== "object") return null;
  if (Array.isArray(svar)) return (svar[0] as Record<string, unknown>) ?? null;
  const o = svar as Record<string, unknown>;
  for (const k of ["response", "data", "result"]) {
    const indre = o[k];
    if (Array.isArray(indre)) return (indre[0] as Record<string, unknown>) ?? null;
    if (indre && typeof indre === "object") return indre as Record<string, unknown>;
  }
  return o;
}

function plantId(o: Record<string, unknown> | null): number | null {
  if (!o) return null;
  const id = Number(o.plantId ?? o.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** De første 300 tegnene av et svar, til feilmeldinger. */
function kort(svar: unknown): string {
  if (svar === null || svar === undefined) return "(tomt)";
  try {
    return JSON.stringify(svar).slice(0, 300);
  } catch {
    return String(svar).slice(0, 300);
  }
}

function liste(svar: unknown): Record<string, unknown>[] {
  if (Array.isArray(svar)) return svar as Record<string, unknown>[];
  if (svar && typeof svar === "object") {
    const o = svar as Record<string, unknown>;
    for (const k of LISTENØKLAR) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    // Ett nivå til: { data: { addresses: [...] } } og { response: { items: [...] } }.
    for (const k of LISTENØKLAR) {
      const indre = o[k];
      if (indre && typeof indre === "object" && !Array.isArray(indre)) {
        const i = indre as Record<string, unknown>;
        for (const k2 of LISTENØKLAR) if (Array.isArray(i[k2])) return i[k2] as Record<string, unknown>[];
      }
    }
  }
  return [];
}

/**
 * Som liste(), men et svar med innhold vi ikke kjenner formen på blir en
 * feil som sier hva Boligmappa sendte — ikke et stille «Ingen treff».
 * Tom liste og tomt svar er fortsatt ingen treff.
 */
function listeEllerForklar(svar: unknown, sti: string): Record<string, unknown>[] {
  const ut = liste(svar);
  if (ut.length > 0 || svar === null || svar === undefined) return ut;
  if (Array.isArray(svar)) return ut;
  if (svar && typeof svar === "object") {
    const o = svar as Record<string, unknown>;
    const tomListe = LISTENØKLAR.some((k) => Array.isArray(o[k]));
    if (tomListe) return ut;
    const kort = JSON.stringify(svar).slice(0, 300);
    throw new BoligmappaFeil(`Boligmappa svarte i et format vi ikke kjenner på ${sti}: ${kort}`, 502);
  }
  return ut;
}

function tilTypar(svar: unknown): BmType[] {
  return liste(svar)
    .map((o) => ({ id: Number(o.id), name: String(o.name ?? o.title ?? "") }))
    .filter((t) => Number.isFinite(t.id) && t.name);
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function adresseTekst(a: unknown): string | null {
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const linje = [o.streetName ?? o.street, o.houseNumber, o.houseSubNumber].filter(Boolean).join(" ");
  const sted = [o.postalCode ?? o.postCode ?? o.zipCode, o.postalPlace ?? o.city].filter(Boolean).join(" ");
  return [linje, sted].filter(Boolean).join(", ") || null;
}

/** Velger typen etter navn — eksakt først, så «inneholder», så første. */
export function velgType(typer: BmType[], namn: string, fallback?: string): BmType | null {
  const n = namn.trim().toLowerCase();
  return (
    typer.find((t) => t.name.trim().toLowerCase() === n) ??
    typer.find((t) => t.name.toLowerCase().includes(n)) ??
    (fallback ? typer.find((t) => t.name.toLowerCase().includes(fallback.toLowerCase())) ?? null : null) ??
    typer[0] ??
    null
  );
}
