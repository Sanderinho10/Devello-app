import NetInfo from "@react-native-community/netinfo";
import type { QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { fornySesjon, NettFeil } from "../api";
import { supabase } from "../supabase";
import { leggSvarICache } from "./cache";
import { alle, fjernSendt, nullstillSender, oppdater, settNoteIdPaaBilete } from "./db";
import { handterSvar, planleggNeste } from "./planlegg";
import { send } from "./send";
import type { Svar, UtboksRad } from "./typer";

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

/** Kobler opp startsignalene. Returnerer en opprydder. Kalles når noen er innlogget. */
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
    tidsur = null;
  };
}

function planleggKjoering(ms: number) {
  if (tidsur) clearTimeout(tidsur);
  tidsur = setTimeout(() => {
    tidsur = null;
    kjoer();
  }, Math.max(1000, ms));
}

async function sendTrygt(rad: UtboksRad): Promise<Svar> {
  try {
    return await send(rad);
  } catch (e) {
    if (e instanceof NettFeil) return { slag: "nett" };
    return { slag: "http", status: 400, melding: e instanceof Error ? e.message : "Ukjent feil", server_id: null };
  }
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

      const svar = await sendTrygt(rad);
      const vedtak = handterSvar(rad, svar, new Date());

      if (vedtak.handling === "ferdig") {
        if (rad.type === "notat" && vedtak.server_id) await settNoteIdPaaBilete(rad.client_id, vedtak.server_id);
        // Svaret inn i lista først, så raden bort fra utboksen: ingen blink.
        if (queryClient && svar.slag === "http") leggSvarICache(queryClient, rad, svar.json);
        await fjernSendt(rad.id);
        queryClient?.invalidateQueries({ queryKey: ["ordre", rad.ordre_id] });
        queryClient?.invalidateQueries({ queryKey: ["ordrar"] });
        if (rad.type === "time") queryClient?.invalidateQueries({ queryKey: ["timeforslag"] });
        if (rad.type === "status") queryClient?.invalidateQueries({ queryKey: ["kalender"] });
        continue;
      }
      if (vedtak.handling === "feil") {
        await oppdater(rad.id, { status: "feil", feil: vedtak.feil });
        continue;
      }
      if (vedtak.handling === "refresh") {
        // send() har alt prøvd én refresh. Én gang til her; feiler den, eller
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
