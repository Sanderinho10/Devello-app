import type { QueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { File, UploadType } from "expo-file-system";
import { AppState } from "react-native";
import { API_URL, fornySesjon, hentToken, kall, NettFeil } from "../api";
import { supabase } from "../supabase";
import { alle, nullstillSender, oppdater, settNoteIdPaaBilete, slett } from "./db";
import { handterSvar, planleggNeste } from "./planlegg";
import type { BiletePayload, MateriellPayload, NotatPayload, StatusPayload, Svar, TimePayload, UtboksRad } from "./typer";

/**
 * Motoren: sender utboksen, én rad om gangen, i rekkefølge.
 *
 * Starter ved app-start, når nettet kommer tilbake, når appen kommer i
 * forgrunnen, og etter hver ny rad. Bare én kjøring om gangen — kommer det
 * et nytt startsignal midt i en kjøring, tas én runde til etterpå.
 */

let queryClient: QueryClient | null = null;
let kjoerer = false;
let enTil = false;
let tidsur: ReturnType<typeof setTimeout> | null = null;

export function settQueryClient(qc: QueryClient) {
  queryClient = qc;
}

/** Kobler opp startsignalene. Returnerer en opprydder. Kalles én gang fra root-layouten. */
export function startMotor(): () => void {
  nullstillSender().then(() => kjoer());
  const nett = NetInfo.addEventListener((s) => {
    if (s.isConnected) kjoer();
  });
  const app = AppState.addEventListener("change", (tilstand) => {
    if (tilstand === "active") kjoer();
  });
  return () => {
    nett();
    app.remove();
    if (tidsur) clearTimeout(tidsur);
  };
}

function planleggKjoering(ms: number) {
  if (tidsur) clearTimeout(tidsur);
  tidsur = setTimeout(() => {
    tidsur = null;
    kjoer();
  }, Math.max(1000, ms));
}

export async function kjoer(): Promise<void> {
  if (kjoerer) {
    enTil = true;
    return;
  }
  kjoerer = true;
  let refreshForsoek = 0;
  try {
    for (;;) {
      const plan = planleggNeste(await alle(), new Date());
      if (!plan.rad) {
        if (plan.ventMs !== null) planleggKjoering(plan.ventMs);
        break;
      }
      const rad = plan.rad;
      await oppdater(rad.id, { status: "sender" });

      const svar = await send(rad);
      const vedtak = handterSvar(rad, svar, new Date());

      if (vedtak.handling === "ferdig") {
        if (rad.type === "notat" && vedtak.server_id) await settNoteIdPaaBilete(rad.client_id, vedtak.server_id);
        await oppdater(rad.id, { server_id: vedtak.server_id, status: "sender" });
        await slett(rad.id);
        queryClient?.invalidateQueries({ queryKey: ["ordre", rad.ordre_id] });
        queryClient?.invalidateQueries({ queryKey: ["ordrar"] });
        continue;
      }
      if (vedtak.handling === "feil") {
        await oppdater(rad.id, { status: "feil", feil: vedtak.feil });
        continue;
      }
      if (vedtak.handling === "refresh") {
        // kall() har alt prøvd én refresh. Én gang til her; feiler den, eller
        // svarer serveren 401 igjen etterpå, er sesjonen død.
        if (refreshForsoek++ < 1 && (await fornySesjon())) {
          await oppdater(rad.id, { status: "venter" });
          continue;
        }
        await oppdater(rad.id, { status: "venter", feil: "Logg inn på nytt" });
        await supabase.auth.signOut();
        break;
      }
      // venter — backoff
      await oppdater(rad.id, {
        status: "venter",
        forsok: vedtak.forsok,
        neste_forsok_kl: vedtak.neste_forsok_kl,
        feil: vedtak.feil,
      });
      if (svar.slag === "nett") {
        // Ingen dekning: ikke gå løs på resten. NetInfo eller tidsuret starter oss igjen.
        planleggKjoering(new Date(vedtak.neste_forsok_kl).getTime() - Date.now());
        break;
      }
    }
  } finally {
    kjoerer = false;
    if (enTil) {
      enTil = false;
      kjoer();
    }
  }
}

// --- sending per type ------------------------------------------------------

function tilSvar(status: number, json: unknown): Svar {
  const o = (json && typeof json === "object" ? json : {}) as { error?: unknown; id?: unknown };
  return {
    slag: "http",
    status,
    melding: typeof o.error === "string" ? o.error : null,
    server_id: typeof o.id === "string" ? o.id : null,
  };
}

async function send(rad: UtboksRad): Promise<Svar> {
  try {
    switch (rad.type) {
      case "time": {
        const p = JSON.parse(rad.payload) as TimePayload;
        const s = await kall(`/api/orders/${rad.ordre_id}/timer`, {
          method: "POST",
          body: { work_date: p.work_date, price_item_id: p.price_item_id, hours: p.hours, note: p.note, client_id: rad.client_id },
        });
        return tilSvar(s.status, s.json);
      }
      case "materiell": {
        const p = JSON.parse(rad.payload) as MateriellPayload;
        const body = p.supplier_item_id
          ? { supplier_item_id: p.supplier_item_id, quantity: p.quantity, note: p.note, client_id: rad.client_id }
          : {
              name: p.name,
              unit: p.unit,
              quantity: p.quantity,
              cost_price: p.cost_price,
              sale_price: p.sale_price,
              note: p.note,
              client_id: rad.client_id,
            };
        const s = await kall(`/api/orders/${rad.ordre_id}/materiell`, { method: "POST", body });
        return tilSvar(s.status, s.json);
      }
      case "notat": {
        const p = JSON.parse(rad.payload) as NotatPayload;
        const s = await kall(`/api/orders/${rad.ordre_id}/notat`, {
          method: "POST",
          body: { text: p.text, client_id: rad.client_id },
        });
        return tilSvar(s.status, s.json);
      }
      case "status": {
        const p = JSON.parse(rad.payload) as StatusPayload;
        const s = await kall(`/api/orders/${rad.ordre_id}`, { method: "PATCH", body: { status: p.status } });
        return tilSvar(s.status, s.json);
      }
      case "bilete":
        return sendBilete(rad);
    }
  } catch (e) {
    if (e instanceof NettFeil) return { slag: "nett" };
    return { slag: "http", status: 0, melding: e instanceof Error ? e.message : "Ukjent feil", server_id: null };
  }
}

/**
 * Bildet lastes opp som multipart rett fra fila på disk — aldri via minnet.
 * Status 0 med melding = lokal feil som ikke skal prøves igjen (fila er borte).
 */
async function sendBilete(rad: UtboksRad, proevdRefresh = false): Promise<Svar> {
  const p = JSON.parse(rad.payload) as BiletePayload;
  if (!rad.fil_sti) return { slag: "http", status: 400, melding: "Bildet mangler fil.", server_id: null };
  const fil = new File(rad.fil_sti);
  if (!fil.exists) return { slag: "http", status: 400, melding: "Bildet finnes ikke lenger på telefonen.", server_id: null };
  if (!p.note_id) return { slag: "http", status: 400, melding: "Notatet bildet hører til er ikke sendt.", server_id: null };

  const token = await hentToken();
  const parametre: Record<string, string> = { title: p.title, note_id: p.note_id, client_id: rad.client_id };
  let res: { status: number; body: string };
  try {
    res = await fil.upload(`${API_URL}/api/orders/${rad.ordre_id}/dokumenter`, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      mimeType: p.mime,
      parameters: parametre,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    return { slag: "nett" };
  }
  if (res.status === 401 && !proevdRefresh && (await fornySesjon())) return sendBilete(rad, true);
  let json: unknown = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = null;
  }
  return tilSvar(res.status, json);
}
