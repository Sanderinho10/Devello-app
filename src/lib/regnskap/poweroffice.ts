import JSZip from "jszip";
import { requireEnv } from "@/lib/supabase/admin";

/**
 * PowerOffice Go API v2 — bare lesing.
 *
 * Vi henter inngående fakturaer og laster ned EHF-XML-en. Ingenting skrives
 * til Go: regnskapet bor der, og Devello er ikke fakturamottak.
 *
 * Autentisering er OAuth 2.0 client credentials. Application key og
 * subscription key er Devello sine (én per miljø, i env). Client key er per
 * kunde: kunden aktiverer utvidelsen i Go (Meny → Innstillinger →
 * Utvidelser → Legg til utvidelse → Egendefinert utvidelse, med Devello sin
 * application key) og får en client key de gir oss. Den er hemmelig og
 * ligger i accounting_connections.client_key, som ingen nettleser kan lese.
 *
 * Alt som er spesifikt for Go står her. Tripletex (steg 6) får sin egen
 * fil; sync.ts skal ikke vite hvilket system det snakker med.
 */

export type PogoMiljo = "production" | "demo";

export interface PogoKopling {
  id: string;
  environment: PogoMiljo;
  client_key: string;
}

/** IncomingInvoiceListItemDto — feltene vi bruker. PascalCase som i Swagger. */
export interface PogoInngaaandeFaktura {
  Id: string;
  VoucherNo: number | null;
  VoucherType: string;
  VoucherDate: string | null;
  DueDate: string | null;
  InvoiceNo: string | null;
  SupplierId: string | null;
  SupplierNo: string | null;
  TotalAmount: number | null;
  NetAmount: number | null;
  CurrencyCode: string | null;
  PurchaseOrderReference: string | null;
  ProjectCode: string | null;
  CustomMatchingReference: string | null;
  ExternalImportReference: string | null;
  IsReversed: boolean | null;
  CreatedDateTimeOffset: string | null;
  LastChangedDateTimeOffset: string | null;
  /** Hele objektet slik Go ga det, for raw-kolonnen. */
  raw: Record<string, unknown>;
}

export interface PogoDokumentasjon {
  VoucherId: string | null;
  VoucherNo: number | null;
  HasEhf: boolean;
  HasPdf: boolean;
  IsImported: boolean;
}

export interface PogoLeverandoer {
  Id: string;
  Number: string | null;
  Name: string | null;
  OrganizationNumber: string | null;
}

export class PogoFeil extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "PogoFeil";
  }
}

function base(miljo: PogoMiljo): { api: string; token: string } {
  return miljo === "demo"
    ? { api: "https://goapi.poweroffice.net/Demo/v2", token: "https://goapi.poweroffice.net/Demo/OAuth/Token" }
    : { api: "https://goapi.poweroffice.net/v2", token: "https://goapi.poweroffice.net/OAuth/Token" };
}

function noeklar(miljo: PogoMiljo): { applicationKey: string; subscriptionKey: string } {
  return miljo === "demo"
    ? {
        applicationKey: requireEnv("POGO_DEMO_APPLICATION_KEY"),
        subscriptionKey: requireEnv("POGO_DEMO_SUBSCRIPTION_KEY"),
      }
    : {
        applicationKey: requireEnv("POGO_APPLICATION_KEY"),
        subscriptionKey: requireEnv("POGO_SUBSCRIPTION_KEY"),
      };
}

/** Application key for et miljø — vises i UI, den er ikke hemmelig. */
export function pogoApplicationKey(miljo: PogoMiljo): string | null {
  const navn = miljo === "demo" ? "POGO_DEMO_APPLICATION_KEY" : "POGO_APPLICATION_KEY";
  return process.env[navn] ?? null;
}

// Token per kopling, i minnet. Gyldig 20 minutter; vi fornyer når det er
// under ett minutt igjen, eller når Go svarer 401.
const tokenCache = new Map<string, { token: string; utloeper: number }>();

export function pogoClient(kopling: PogoKopling) {
  const url = base(kopling.environment);
  const { applicationKey, subscriptionKey } = noeklar(kopling.environment);

  async function token(tving = false): Promise<string> {
    const cached = tokenCache.get(kopling.id);
    if (!tving && cached && cached.utloeper - Date.now() > 60_000) return cached.token;

    const res = await fetch(url.token, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${applicationKey}:${kopling.client_key}`).toString("base64")}`,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      const tekst = await res.text().catch(() => "");
      throw new PogoFeil(forklar(res.status, tekst, "token"), res.status);
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    const levetid = (data.expires_in ?? 1200) * 1000;
    tokenCache.set(kopling.id, { token: data.access_token, utloeper: Date.now() + levetid });
    return data.access_token;
  }

  async function raw(
    path: string,
    query?: Record<string, string | number | undefined>,
    forsok = 0,
  ): Promise<Response> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== "") q.set(k, String(v));
    }
    const full = `${url.api}${path}${q.size ? `?${q.toString()}` : ""}`;

    const res = await fetch(full, {
      headers: {
        Authorization: `Bearer ${await token(forsok === 1)}`,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        Accept: "application/json, application/zip, */*",
      },
    });

    // Ett nytt forsøk med friskt token på 401, og ett etter pause på 429.
    if (res.status === 401 && forsok === 0) return raw(path, query, 1);
    if (res.status === 429 && forsok < 2) {
      const vent = Number(res.headers.get("Retry-After")) || 2;
      await new Promise((r) => setTimeout(r, vent * 1000));
      return raw(path, query, forsok + 1);
    }
    if (!res.ok) {
      const tekst = await res.text().catch(() => "");
      throw new PogoFeil(forklar(res.status, tekst, path), res.status);
    }
    return res;
  }

  /**
   * GET med JSON-svar. Go svarer 204 med tom kropp når en liste er tom
   * (en demoklient uten fakturaer, for eksempel) — det er null her, ikke
   * en feil. Alt annet som ikke er JSON er en feil vi sier fra om.
   */
  async function get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T | null> {
    const res = await raw(path, query);
    if (res.status === 204) return null;
    const tekst = await res.text();
    if (!tekst.trim()) return null;
    try {
      return JSON.parse(tekst) as T;
    } catch {
      throw new PogoFeil(
        `PowerOffice Go svarte med noe som ikke er JSON på ${path}: ${tekst.slice(0, 120)}`,
        502,
      );
    }
  }

  return {
    /** Henter et token — «Test tilkobling» bruker denne. */
    token: () => token(true),
    get,

    /**
     * Inngående fakturaer og kreditnotaer, én side om gangen.
     *
     * Svaret fra Go kan komme som en ren liste eller pakket i et objekt
     * med Data/Items; vi tåler begge. Verifiser formen mot demo før prod.
     */
    async hentInngaaandeFakturaer(input: {
      fromDate?: string;
      pageNumber: number;
      pageSize?: number;
    }): Promise<PogoInngaaandeFaktura[]> {
      const svar = await get<unknown>("/IncomingInvoices", {
        fromDate: input.fromDate,
        voucherTypes: "IncomingInvoice,IncomingCreditNote",
        PageNumber: input.pageNumber,
        PageSize: input.pageSize ?? 100,
      });
      return liste(svar).map((o) => ({
        Id: String(felt(o, "Id") ?? ""),
        VoucherNo: talEllerNull(felt(o, "VoucherNo")),
        VoucherType: String(felt(o, "VoucherType") ?? "IncomingInvoice"),
        VoucherDate: strengEllerNull(felt(o, "VoucherDate")),
        DueDate: strengEllerNull(felt(o, "DueDate")),
        InvoiceNo: strengEllerNull(felt(o, "InvoiceNo")),
        SupplierId: strengEllerNull(felt(o, "SupplierId")),
        SupplierNo: strengEllerNull(felt(o, "SupplierNo")),
        TotalAmount: talEllerNull(felt(o, "TotalAmount")),
        NetAmount: talEllerNull(felt(o, "NetAmount")),
        CurrencyCode: strengEllerNull(felt(o, "CurrencyCode")),
        PurchaseOrderReference: strengEllerNull(felt(o, "PurchaseOrderReference")),
        ProjectCode: strengEllerNull(felt(o, "ProjectCode")),
        CustomMatchingReference: strengEllerNull(felt(o, "CustomMatchingReference")),
        ExternalImportReference: strengEllerNull(felt(o, "ExternalImportReference")),
        IsReversed: typeof felt(o, "IsReversed") === "boolean" ? (felt(o, "IsReversed") as boolean) : null,
        CreatedDateTimeOffset: strengEllerNull(felt(o, "CreatedDateTimeOffset")),
        LastChangedDateTimeOffset: strengEllerNull(felt(o, "LastChangedDateTimeOffset")),
        raw: o,
      }));
    },

    async hentDokumentasjonsstatus(voucherId: string): Promise<PogoDokumentasjon> {
      const o = (await get<Record<string, unknown>>("/VoucherDocumentation", { id: voucherId })) ?? {};
      return {
        VoucherId: strengEllerNull(felt(o, "VoucherId")),
        VoucherNo: talEllerNull(felt(o, "VoucherNo")),
        HasEhf: felt(o, "HasEhf") === true,
        HasPdf: felt(o, "HasPdf") === true,
        IsImported: felt(o, "IsImported") === true,
      };
    },

    /** EHF-XML-en, pakket ut av zip-en Go sender. */
    async lastNedEhf(voucherId: string): Promise<string> {
      const res = await raw("/VoucherDocumentation/Download", { id: voucherId, documentationType: "Ehf" });
      const bytes = new Uint8Array(await res.arrayBuffer());
      // Zip (PK) → første .xml. Kommer det rå XML, tar vi det som det er.
      if (bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const zip = await JSZip.loadAsync(bytes);
        const fil = Object.values(zip.files).find((f) => !f.dir && /\.xml$/i.test(f.name))
          ?? Object.values(zip.files).find((f) => !f.dir);
        if (!fil) throw new PogoFeil("Zip-fila fra PowerOffice inneholdt ingen XML.", 502);
        return fil.async("string");
      }
      return new TextDecoder("utf-8").decode(bytes);
    },

    async hentLeverandoer(supplierId: string): Promise<PogoLeverandoer> {
      const o = (await get<Record<string, unknown>>(`/Suppliers/${encodeURIComponent(supplierId)}`)) ?? {};
      return {
        Id: String(felt(o, "Id") ?? supplierId),
        Number: strengEllerNull(felt(o, "Number")),
        Name: strengEllerNull(felt(o, "Name")),
        OrganizationNumber: strengEllerNull(felt(o, "OrganizationNumber")),
      };
    },
  };
}

/**
 * Feilene fra Go oversatt til noe kunden kan handle på. Hele svaret går til
 * loggen; det brukeren ser skal si hva som gikk galt.
 */
function forklar(status: number, tekst: string, hvor: string): string {
  if (status === 401) {
    return hvor === "token"
      ? "PowerOffice Go avviste client key. Sjekk at nøkkelen er kopiert riktig, og at utvidelsen fortsatt er aktiv i Go."
      : "PowerOffice Go avviste tilgangen (client key). Koble til på nytt.";
  }
  if (status === 403) {
    const privilegium = /IncomingInvoice/i.test(hvor)
      ? "Inngående faktura (IncomingInvoice)"
      : /VoucherDocumentation/i.test(hvor)
        ? "Bilagsdokumentasjon (VoucherDocumentation)"
        : /Suppliers/i.test(hvor)
          ? "Leverandør (Supplier)"
          : "denne ressursen";
    return `Integrasjonen mangler tilgang til ${privilegium} i PowerOffice Go. Gi utvidelsen lesetilgang og prøv igjen.`;
  }
  if (status === 429) return "PowerOffice Go begrenser antall kall akkurat nå. Prøv igjen om litt.";
  if (status === 404) return `PowerOffice Go fant ikke ${hvor}.`;
  const kort = tekst.replace(/\s+/g, " ").slice(0, 200);
  return `PowerOffice Go svarte ${status}${kort ? `: ${kort}` : ""}`;
}

/** Go bruker PascalCase i v2; vi tåler camelCase i tilfelle. */
function felt(o: Record<string, unknown>, navn: string): unknown {
  if (navn in o) return o[navn];
  const camel = navn[0].toLowerCase() + navn.slice(1);
  return o[camel];
}

function liste(svar: unknown): Record<string, unknown>[] {
  if (Array.isArray(svar)) return svar as Record<string, unknown>[];
  if (svar && typeof svar === "object") {
    const o = svar as Record<string, unknown>;
    for (const k of ["Data", "data", "Items", "items", "Value", "value"]) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    }
  }
  return [];
}

function strengEllerNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function talEllerNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
