"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { OrdreValg } from "@/components/OrdreSok";
import { HendingDialog, type Forslag } from "@/app/kalender/HendingDialog";
import type { KalenderHending, Kollega } from "@/lib/kalender/hent";
import { isoDato, leggTilDagar, mandag, startPaaDag, tidTekst } from "@/lib/kalender/tid";

/**
 * Når og hvem på ordren: oppdragene fra kalenderen, kommende først.
 * «Planlegg» åpner samme skjema som i kalenderen, med ordren valgt.
 */
export function OrdrePlan({ ordre, laast }: { ordre: OrdreValg; laast: boolean }) {
  const [hendingar, setHendingar] = useState<KalenderHending[] | null>(null);
  const [kolleger, setKolleger] = useState<Kollega[]>([]);
  const [kanRedigere, setKanRedigere] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ hending?: KalenderHending; forslag?: Forslag } | null>(null);

  const hent = useCallback(async () => {
    try {
      const res = await fetch(`/api/kalender?ordre=${ordre.id}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke hente kalenderen");
      setHendingar(payload.hendingar);
      setKolleger(payload.kolleger);
      setKanRedigere(payload.kan_redigere);
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    }
  }, [ordre.id]);

  useEffect(() => {
    void hent();
  }, [hent]);

  const no = new Date();
  const kommande = (hendingar ?? []).filter((h) => new Date(h.ends_at) >= no);
  const tidlegare = (hendingar ?? []).filter((h) => new Date(h.ends_at) < no).reverse();

  function planlegg() {
    // I morgon 07–15 som utgangspunkt.
    const dag = leggTilDagar(startPaaDag(new Date()), 1);
    const start = new Date(dag);
    start.setHours(7);
    const slutt = new Date(dag);
    slutt.setHours(15);
    setDialog({ forslag: { kind: "oppdrag", start, slutt, ordre } });
  }

  const rad = (h: KalenderHending) => {
    const start = new Date(h.starts_at);
    return (
      <button key={h.id} type="button" className="lead-row kal-ordre-rad" onClick={() => setDialog({ hending: h })}>
        <div className="lead-main">
          <div>
            <span className={`kal-prikk ${h.kind}`} />{" "}
            {new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" }).format(start)} ·{" "}
            {tidTekst({ start, slutt: new Date(h.ends_at), heileDagen: h.all_day })}
          </div>
          <div className="tiny muted">{h.deltakarar.map((d) => d.navn).join(", ") || "Ingen montør valgt"}</div>
        </div>
      </button>
    );
  };

  return (
    <div className="card ordre-hendelser">
      <div className="card-header">
        <span className="label" style={{ marginBottom: 0 }}>
          Planlagt
        </span>
        <div className="row" style={{ gap: 6 }}>
          {kommande[0] && (
            <Link className="button ghost" href={`/kalender?uke=${isoDato(mandag(new Date(kommande[0].starts_at)))}`}>
              Kalender
            </Link>
          )}
          {kanRedigere && !laast && (
            <button type="button" className="button secondary" onClick={planlegg}>
              Planlegg
            </button>
          )}
        </div>
      </div>
      {feil && <div className="banner error">{feil}</div>}
      {hendingar === null ? (
        <div className="empty">Henter…</div>
      ) : hendingar.length === 0 ? (
        <div className="empty">Ikke satt opp i kalenderen ennå.</div>
      ) : (
        <div className="lead-list">
          {kommande.map(rad)}
          {tidlegare.length > 0 && (
            <details className="kal-tidlegare">
              <summary className="tiny muted">{tidlegare.length} tidligere</summary>
              {tidlegare.map(rad)}
            </details>
          )}
        </div>
      )}

      <HendingDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onLagra={() => {
          setDialog(null);
          void hent();
        }}
        kolleger={kolleger}
        hending={dialog?.hending}
        forslag={dialog?.forslag}
        kanRedigere={kanRedigere}
      />
    </div>
  );
}
