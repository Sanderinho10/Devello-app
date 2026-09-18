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
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BoligmappaFeil";
  }
}

export interface BmAdresse {
  id: string;
  street: string | null;
  houseNumber: string | null;
  houseSubNumber: string | null;
  postCode: string | null;
  city: string | null;
  detailedAddress: string | null;
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
  if (!data) throw new BoligmappaFeil("Boligmappa er ikke koblet til. Koble til under Ordre → Innstillinger.", 400);
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
      const m = "Logg inn i Boligmappa på nytt under Ordre → Innstillinger.";
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
      const m = "Logg inn i Boligmappa på nytt under Ordre → Innstillinger.";
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
    async sokAdresser(q: string): Promise<BmAdresse[]> {
      const { data } = await json<unknown>("GET", `/search/addresses?q=${encodeURIComponent(q)}&limit=10`);
      return liste(data).map((o) => ({
        id: String(o.id ?? ""),
        street: str(o.street),
        houseNumber: str(o.houseNumber),
        houseSubNumber: str(o.houseSubNumber),
        postCode: str(o.postCode),
        city: str(o.city),
        detailedAddress: str(o.detailedAddress),
        raw: o,
      }));
    },

    async eigedomar(addressId: string): Promise<BmEigedom[]> {
      const { data } = await json<unknown>("GET", `/addresses/${encodeURIComponent(addressId)}/properties`);
      return liste(data).map((o) => ({
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
      const opprett = await json<Record<string, unknown>>("POST", "/plants", { boligmappaNumber }, [409]);
      if (opprett.status !== 409 && opprett.data) {
        const id = Number(opprett.data.plantId ?? opprett.data.id);
        if (Number.isFinite(id)) return id;
      }
      const hent = await json<Record<string, unknown>>("GET", `/plants/${encodeURIComponent(boligmappaNumber)}`);
      const id = Number(hent.data?.plantId ?? hent.data?.id);
      if (!Number.isFinite(id)) throw new BoligmappaFeil("Boligmappa svarte uten plant-id.", 502);
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
      const { data } = await json<Record<string, unknown>>("POST", `/plants/${encodeURIComponent(boligmappaNumber)}/files`, {
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
      const id = data?.id !== undefined ? String(data.id) : null;
      const uploadLink = str(data?.uploadLink);
      if (!id || !uploadLink) throw new BoligmappaFeil("Boligmappa svarte uten opplastingslenke.", 502);
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

function liste(svar: unknown): Record<string, unknown>[] {
  if (Array.isArray(svar)) return svar as Record<string, unknown>[];
  if (svar && typeof svar === "object") {
    const o = svar as Record<string, unknown>;
    for (const k of ["data", "items", "results", "value"]) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  }
  return [];
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
  const linje = [o.street ?? o.streetName, o.houseNumber, o.houseSubNumber].filter(Boolean).join(" ");
  const sted = [o.postCode ?? o.zipCode, o.city].filter(Boolean).join(" ");
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
