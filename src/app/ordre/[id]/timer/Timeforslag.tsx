"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { TimeforslagUt } from "@/lib/kalender/hent-timeforslag";

/**
 * Forslag frå kalenderen: «Noah var sett opp her måndag 10–15 — før 5 t?»
 *
 * Eitt trykk fører timane med timetypen montøren brukte sist. «Juster»
 * fyller skjemaet over i staden, til dømes for å trekkje frå lunsj.
 * Forslaget forsvinn så snart det er ført noko på dagen.
 */
export function Timeforslag({
  orderId,
  erAdmin,
  onJuster,
}: {
  orderId: string;
  erAdmin: boolean;
  onJuster: (f: TimeforslagUt) => void;
}) {
  const router = useRouter();
  const [forslag, setForslag] = useState<TimeforslagUt[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hent = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/timeforslag`);
      if (!res.ok) return;
      const payload = (await res.json()) as { forslag: TimeforslagUt[] };
      setForslag(payload.forslag);
    } catch {
      // Forslaga er ei hjelp; utan dei fører ein som før.
    }
  }, [orderId]);

  useEffect(() => {
    void hent();
  }, [hent]);

  const nokkel = (f: TimeforslagUt) => `${f.user_id}|${f.work_date}`;

  async function foer(f: TimeforslagUt) {
    setBusy(nokkel(f));
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_date: f.work_date,
          price_item_id: f.price_item_id,
          hours: f.timar,
          ...(erAdmin ? { user_id: f.user_id } : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke føre timene");
      setForslag((liste) => liste.filter((x) => nokkel(x) !== nokkel(f)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (forslag.length === 0) return null;

  const dag = (d: string) =>
    new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));
  const kl = (iso: string) => new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const t = (n: number) => `${n.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} t`;

  return (
    <div className="card timeforslag">
      <div className="card-header">
        <span className="label" style={{ marginBottom: 0 }}>
          Forslag fra kalenderen
        </span>
        <span className="tiny muted">Planlagt, men ingen timer ført</span>
      </div>
      {error && <div className="banner error">{error}</div>}
      {forslag.map((f) => (
        <div key={nokkel(f)} className="timeforslag-rad">
          <div className="timeforslag-tekst">
            <strong>{erAdmin ? `${f.user_name} · ` : ""}{dag(f.work_date)}</strong>{" "}
            <span className="muted">
              {kl(f.fra)}–{kl(f.til)}
              {f.time_type_name ? ` · ${f.time_type_name}` : ""}
            </span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="button ghost" onClick={() => onJuster(f)} disabled={busy !== null}>
              Juster
            </button>
            <button type="button" className="button" onClick={() => foer(f)} disabled={busy !== null || !f.price_item_id}>
              {busy === nokkel(f) ? "Fører…" : `Før ${t(f.timar)}`}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
