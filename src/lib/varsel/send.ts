import type { SupabaseClient } from "@supabase/supabase-js";
import { epostRamme, sendEpost } from "@/lib/epost/send";
import { kvenSkalVarslast, varselTekst, type HendingForVarsel } from "@/lib/kalender/varsel";

/**
 * Sender varsel om kalenderendringar til montørane.
 *
 * Kvart varsel blir først lagra i user_notifications — det er sanninga, og
 * appen viser lista. Så går det ut på éin kanal:
 *   - push til appen når brukaren har registrert eit Expo-token
 *   - e-post elles, så montøren utan app òg får vite det
 *
 * Feil i push eller e-post skal aldri stoppe kalenderen: alt blir logga og
 * svelgt. Kallaren køyrer dette i after(), etter at svaret er sendt.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMelding {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
}

/** Sender til Expo. Returnerer tokena Expo seier ikkje lenger finst, så dei kan slettast. */
export async function sendPush(meldingar: PushMelding[]): Promise<{ sendt: Set<string>; ugyldige: string[] }> {
  const sendt = new Set<string>();
  const ugyldige: string[] = [];
  // Expo tek inntil 100 meldingar per kall.
  for (let i = 0; i < meldingar.length; i += 100) {
    const bolk = meldingar.slice(i, i + 100);
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(bolk) });
    const payload = (await res.json().catch(() => ({}))) as {
      data?: { status: "ok" | "error"; details?: { error?: string } }[];
      errors?: { message?: string }[];
    };
    if (!res.ok || !payload.data) {
      throw new Error(`Push gikk ikke ut (${res.status}): ${payload.errors?.[0]?.message ?? "ukjent feil fra Expo"}`);
    }
    payload.data.forEach((svar, j) => {
      const token = bolk[j].to;
      if (svar.status === "ok") sendt.add(token);
      else if (svar.details?.error === "DeviceNotRegistered") ugyldige.push(token);
    });
  }
  return { sendt, ugyldige };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Varsle dei som er berørte av at ein avtale gjekk frå `foer` til `etter`
 * (null = finst ikkje). Gjer ingenting når ingen skal varslast.
 */
export async function varsleKalenderendring(
  admin: SupabaseClient,
  input: {
    companyId: string;
    avsenderId: string;
    eventId: string;
    foer: HendingForVarsel | null;
    etter: HendingForVarsel | null;
  },
): Promise<void> {
  try {
    const mottakarar = kvenSkalVarslast(input.foer, input.etter, input.avsenderId);
    if (mottakarar.length === 0) return;

    const ids = [...new Set(mottakarar.map((m) => m.userId))];
    const [{ data: brukarar }, { data: tokens }, { data: avsendar }] = await Promise.all([
      admin.from("users").select("id, email, full_name").in("id", ids),
      admin.from("push_tokens").select("token, user_id").in("user_id", ids),
      admin.from("users").select("full_name, email").eq("id", input.avsenderId).maybeSingle(),
    ]);
    const tokensPerBrukar = new Map<string, string[]>();
    for (const t of tokens ?? []) {
      tokensPerBrukar.set(t.user_id, [...(tokensPerBrukar.get(t.user_id) ?? []), t.token as string]);
    }
    const fraNamn = (avsendar?.full_name as string | null)?.trim() || (avsendar?.email as string | undefined) || "Devello";

    const rader = mottakarar.map((m) => {
      // «Fjerna» skildrar avtalen slik han var; dei andre slik han er no.
      const h = (m.kind === "fjerna_oppdrag" ? input.foer : input.etter) ?? input.foer!;
      const { title, body } = varselTekst(m.kind, h);
      return { m, h, title, body, kanal: [] as string[] };
    });

    // Push til dei som har appen.
    const push = rader.flatMap((r) =>
      (tokensPerBrukar.get(r.m.userId) ?? []).map((to) => ({
        to,
        title: r.title,
        body: r.body,
        sound: "default" as const,
        data: { type: r.m.kind, event_id: input.eventId, order_id: r.h.order_id },
      })),
    );
    if (push.length) {
      try {
        const { sendt, ugyldige } = await sendPush(push);
        for (const r of rader) {
          if ((tokensPerBrukar.get(r.m.userId) ?? []).some((t) => sendt.has(t))) r.kanal.push("push");
        }
        if (ugyldige.length) await admin.from("push_tokens").delete().in("token", ugyldige);
      } catch (err) {
        console.error("[varsel] push feilet:", err instanceof Error ? err.message : err);
      }
    }

    // E-post til dei push ikkje nådde.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.devello.no";
    for (const r of rader) {
      if (r.kanal.length) continue;
      const brukar = (brukarar ?? []).find((b) => b.id === r.m.userId);
      if (!brukar?.email) continue;
      try {
        const lenke = r.h.order_id && r.m.kind !== "fjerna_oppdrag" ? `${appUrl}/ordre/${r.h.order_id}` : `${appUrl}/kalender`;
        const { html, tekst } = epostRamme({
          overskrift: escape(r.title),
          avsnitt: [escape(r.body), `Lagt inn av ${escape(fraNamn)}.`],
          knapp: { tekst: r.h.order_id && r.m.kind !== "fjerna_oppdrag" ? "Åpne ordren" : "Åpne kalenderen", url: lenke },
          fot: "Du får denne fordi du er satt opp i kalenderen i Devello. Med montørappen kommer varselet som push i stedet.",
        });
        await sendEpost({ til: brukar.email as string, emne: r.title, html, tekst });
        r.kanal.push("epost");
      } catch (err) {
        console.error("[varsel] e-post feilet:", err instanceof Error ? err.message : err);
      }
    }

    const { error } = await admin.from("user_notifications").insert(
      rader.map((r) => ({
        company_id: input.companyId,
        user_id: r.m.userId,
        kind: r.m.kind,
        title: r.title,
        body: r.body,
        event_id: r.m.kind === "fjerna_oppdrag" && !input.etter ? null : input.eventId,
        order_id: r.h.order_id,
        sendt_via: r.kanal,
      })),
    );
    if (error) console.error("[varsel] kunne ikke lagre varsel:", error.message);
  } catch (err) {
    console.error("[varsel] feilet:", err instanceof Error ? err.message : err);
  }
}
