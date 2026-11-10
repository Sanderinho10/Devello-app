import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "./api";
import type { Bilete, FilLenke, KalenderHending, MaterialEntry, Meg, OrderNote, OrderStatus, OrdreIApp, OrdreIListe, SokTreff, TimeEntry, Timeforslag, VarselSvar } from "./typer";
import { useUtboksForOrdre } from "./utboks/db";
import type { BiletePayload, MateriellPayload, NotatPayload, StatusPayload, TimePayload, UtboksRad } from "./utboks/typer";

/**
 * react-query-hooks. Lesing går alltid via disse; persisteren i
 * root-layouten gjør at det som er hentet sist vises uten dekning.
 */

export const nokler = {
  meg: ["meg"] as const,
  ordrar: ["ordrar"] as const,
  ordre: (id: string) => ["ordre", id] as const,
  sok: (q: string) => ["sok", q] as const,
  fil: (ordreId: string, docId: string) => ["fil", ordreId, docId] as const,
  kalender: (alle: boolean) => ["kalender", alle ? "alle" : "mine"] as const,
  timeforslag: ["timeforslag"] as const,
  varsel: ["varsel"] as const,
};

export function useMeg() {
  return useQuery({
    queryKey: nokler.meg,
    queryFn: () => api<Meg>("/api/app/meg"),
    staleTime: 5 * 60 * 1000,
    retry: (antall, feil) => antall < 1 && !(feil instanceof Error && feil.name === "ApiFeil"),
  });
}

export function useOrdrar() {
  return useQuery({
    queryKey: nokler.ordrar,
    queryFn: async () => (await api<{ ordrar: OrdreIListe[] }>("/api/app/ordrar?status=aktive&limit=200")).ordrar,
  });
}

export function useOrdre(id: string) {
  return useQuery({
    queryKey: nokler.ordre(id),
    queryFn: () => api<OrdreIApp>(`/api/app/ordrar/${id}`),
    enabled: !!id,
  });
}

/** Programmet: i dag og 14 dager fram. alle = hele firmaets kalender. */
export function useKalender(alle: boolean) {
  return useQuery({
    queryKey: nokler.kalender(alle),
    queryFn: async () => {
      const fra = new Date();
      fra.setHours(0, 0, 0, 0);
      const til = new Date(fra);
      til.setDate(til.getDate() + 14);
      const q = `fra=${encodeURIComponent(fra.toISOString())}&til=${encodeURIComponent(til.toISOString())}${alle ? "&alle=1" : ""}`;
      return (await api<{ hendingar: KalenderHending[] }>(`/api/app/kalender?${q}`)).hendingar;
    },
  });
}

/** Oppdrag de siste 7 dagene uten timer ført — «før 5 t?». */
export function useTimeforslag() {
  return useQuery({
    queryKey: nokler.timeforslag,
    queryFn: async () => (await api<{ forslag: Timeforslag[] }>("/api/app/timeforslag")).forslag,
  });
}

/**
 * Varslene til den innloggede, nyeste først, med antall uleste. Hentes på
 * nytt hvert minutt mens appen er åpen — push kommer ikke alltid fram.
 */
export function useVarsel() {
  return useQuery({
    queryKey: nokler.varsel,
    queryFn: () => api<VarselSvar>("/api/app/varsel?limit=50"),
    // Alltid ferskt når appen åpnes eller kommer i forgrunnen — tallet på merket skal stemme.
    staleTime: 0,
    refetchInterval: 60 * 1000,
  });
}

/**
 * Merker varsler som lest: i lista med en gang, så på serveren. Går kallet
 * ikke fram (ingen dekning), står de som uleste igjen ved neste henting.
 */
export function useMerkLest() {
  const qc = useQueryClient();
  return (ids: string[]) => {
    if (!ids.length) return;
    const lest = new Set(ids);
    const naa = new Date().toISOString();
    qc.setQueryData<VarselSvar>(nokler.varsel, (gammel) => {
      if (!gammel) return gammel;
      const varsel = gammel.varsel.map((v) => (lest.has(v.id) && !v.read_at ? { ...v, read_at: naa } : v));
      const nyLest = gammel.varsel.filter((v) => lest.has(v.id) && !v.read_at).length;
      return { varsel, ulest: Math.max(0, gammel.ulest - nyLest) };
    });
    api("/api/app/varsel/lest", { method: "POST", body: { ids } })
      .catch(() => {})
      .finally(() => qc.invalidateQueries({ queryKey: nokler.varsel }));
  };
}

/** Katalogsøk. Kalleren debouncer; her bare minst to tegn. */
export function useSok(q: string) {
  const sporring = q.trim();
  return useQuery({
    queryKey: nokler.sok(sporring),
    queryFn: async () => (await api<{ items: SokTreff[] }>(`/api/grossist/sok?q=${encodeURIComponent(sporring)}&limit=30`)).items,
    enabled: sporring.length >= 2,
    staleTime: 5 * 60 * 1000,
    networkMode: "online",
    retry: false,
  });
}

/** Signert lenke til et bilde. Lenka lever 300 s; vi holder den i 4 min. */
export function useFilLenke(ordreId: string, docId: string | null) {
  return useQuery({
    queryKey: nokler.fil(ordreId, docId ?? ""),
    queryFn: async () => (await api<FilLenke>(`/api/orders/${ordreId}/dokumenter/${docId}/fil?format=json`)).url,
    enabled: !!docId,
    staleTime: 4 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
    networkMode: "online",
    retry: false,
  });
}

// --- server + utboks slått sammen -----------------------------------------

/** Ekstra på rader som ennå ikke er sendt. */
export interface UtboksMerke {
  _utboks?: UtboksRad;
}

export type TimeRad = TimeEntry & { user_name: string } & UtboksMerke;
export type MateriellRad = MaterialEntry & UtboksMerke;
export type BileteRad = Bilete & { lokal_uri?: string } & UtboksMerke;
export type NotatRad = OrderNote & { user_name: string; bilete: BileteRad[] } & UtboksMerke;

export interface OrdreMedUtboks {
  ordre: OrdreIApp["ordre"] | undefined;
  timer: TimeRad[];
  materiell: MateriellRad[];
  notat: NotatRad[];
  lovlege_overgangar: OrderStatus[];
  /** Statusendring som ligger i utboksen — vises som gjeldende til den er sendt. */
  ventendeStatus: UtboksRad | null;
}

/**
 * Datakilden for fanene: serverdata + utboks-rader for denne ordren.
 * Utboks-radene ligger øverst (nyest først) med _utboks satt, så lista
 * kan vise «Sendes» eller «Feilet».
 */
export function useOrdreMedUtboks(id: string) {
  const meg = useMeg().data;
  const sporring = useOrdre(id);
  const utboks = useUtboksForOrdre(id);
  const data = sporring.data;

  const sammenslaatt = useMemo<OrdreMedUtboks>(() => {
    const bruker = meg?.user;
    const navn = bruker?.full_name || bruker?.email || "Meg";
    // Rader serveren alt har (samme client_id) vises én gang — fra serveren.
    const paaServer = new Set<string>();
    for (const liste of [data?.timer, data?.materiell, data?.notat]) {
      for (const r of liste ?? []) if (r.client_id) paaServer.add(r.client_id);
    }
    const nyest = [...utboks].reverse().filter((r) => r.type === "bilete" || r.type === "status" || !paaServer.has(r.client_id));

    const timer: TimeRad[] = nyest
      .filter((r) => r.type === "time")
      .map((r) => {
        const p = JSON.parse(r.payload) as TimePayload;
        return {
          id: r.client_id,
          company_id: "",
          order_id: id,
          user_id: bruker?.id ?? "",
          user_name: navn,
          work_date: p.work_date,
          price_item_id: p.price_item_id,
          time_type_name: p.time_type_name,
          unit_price: p.unit_price,
          hours: p.hours,
          note: p.note,
          billable: true,
          created_by: bruker?.id ?? null,
          created_at: r.laga_kl,
          updated_at: r.laga_kl,
          invoice_draft_id: null,
          client_id: r.client_id,
          _utboks: r,
        };
      });

    const materiell: MateriellRad[] = nyest
      .filter((r) => r.type === "materiell")
      .map((r) => {
        const p = JSON.parse(r.payload) as MateriellPayload;
        return {
          id: r.client_id,
          company_id: "",
          order_id: id,
          source: "manuell",
          supplier_item_id: p.supplier_item_id,
          item_no: p.item_no,
          name: p.name,
          unit: p.unit,
          quantity: p.quantity,
          cost_price: p.cost_price,
          markup_pct: meg?.company.materials_markup_pct ?? 0,
          sale_price: p.sale_price ?? 0,
          note: p.note,
          billable: true,
          registered_by: bruker?.id ?? null,
          registered_at: r.laga_kl,
          updated_at: r.laga_kl,
          invoice_line_id: null,
          replaced_by: null,
          invoice_draft_id: null,
          client_id: r.client_id,
          _utboks: r,
        };
      });

    const bilderIUtboks = utboks.filter((r) => r.type === "bilete");
    const lokaleBilder = (notatClientId: string): BileteRad[] =>
      bilderIUtboks
        .filter((b) => b.avhengig_av === notatClientId)
        .map((b) => {
          const p = JSON.parse(b.payload) as BiletePayload;
          return { id: b.client_id, title: p.title, file_name: p.file_name, created_at: b.laga_kl, note_id: null, lokal_uri: b.fil_sti ?? undefined, _utboks: b };
        });

    const notat: NotatRad[] = nyest
      .filter((r) => r.type === "notat")
      .map((r) => {
        const p = JSON.parse(r.payload) as NotatPayload;
        return {
          id: r.client_id,
          company_id: "",
          order_id: id,
          user_id: bruker?.id ?? "",
          user_name: navn,
          text: p.text,
          client_id: r.client_id,
          created_at: r.laga_kl,
          updated_at: r.laga_kl,
          bilete: lokaleBilder(r.client_id),
          _utboks: r,
        };
      });

    // Bilder som venter på et notat som alt er sendt: legg dem på server-notatet.
    const serverNotat: NotatRad[] = (data?.notat ?? []).map((n) => {
      const ventende = n.client_id ? lokaleBilder(n.client_id) : [];
      return { ...n, bilete: [...ventende, ...n.bilete] };
    });

    const ventendeStatus = nyest.find((r) => r.type === "status" && r.status !== "feil") ?? null;
    let ordre = data?.ordre;
    if (ordre && ventendeStatus) {
      ordre = { ...ordre, status: (JSON.parse(ventendeStatus.payload) as StatusPayload).status };
    }

    return {
      ordre,
      timer: [...timer, ...(data?.timer ?? [])],
      materiell: [...materiell, ...(data?.materiell ?? [])],
      notat: [...notat, ...serverNotat],
      lovlege_overgangar: ventendeStatus ? [] : (data?.lovlege_overgangar ?? []),
      ventendeStatus,
    };
  }, [data, utboks, id, meg]);

  return { ...sporring, sammenslaatt };
}

export function useInvaliderOrdre() {
  const qc = useQueryClient();
  return (id: string) => {
    qc.invalidateQueries({ queryKey: nokler.ordre(id) });
    qc.invalidateQueries({ queryKey: nokler.ordrar });
  };
}
