"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface AdminTilbakemelding {
  id: string;
  epost: string;
  selskap: string;
  type: "feil" | "onske" | "annet";
  melding: string;
  side: string | null;
  epost_sendt: boolean;
  behandlet_at: string | null;
  created_at: string;
}

const TYPE: Record<AdminTilbakemelding["type"], { tekst: string; klasse: string }> = {
  feil: { tekst: "Feil", klasse: "sperret" },
  onske: { tekst: "Ønske", klasse: "ny" },
  annet: { tekst: "Annet", klasse: "" },
};

type Filter = "ubehandlet" | "alle";

function tidspunkt(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TilbakemeldingListe({ rader }: { rader: AdminTilbakemelding[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ubehandlet");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ubehandlet = rader.filter((r) => !r.behandlet_at);
  const synlige = filter === "ubehandlet" ? ubehandlet : rader;

  async function marker(id: string, behandlet: boolean) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/devello/tilbakemeldinger/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ behandlet }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke oppdatere.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`button ${filter === "ubehandlet" ? "" : "secondary"}`}
            onClick={() => setFilter("ubehandlet")}
          >
            Ubehandlet ({ubehandlet.length})
          </button>
          <button
            className={`button ${filter === "alle" ? "" : "secondary"}`}
            onClick={() => setFilter("alle")}
          >
            Alle ({rader.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="banner error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {synlige.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {filter === "ubehandlet" ? "Ingen ubehandlede tilbakemeldinger." : "Ingen tilbakemeldinger ennå."}
          </p>
        </div>
      ) : (
        <div className="tilbakemelding-liste">
          {synlige.map((r) => (
            <div key={r.id} className={`card tilbakemelding${r.behandlet_at ? " behandlet" : ""}`}>
              <div className="row-between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`pill ${TYPE[r.type].klasse}`}>{TYPE[r.type].tekst}</span>
                    <strong>{r.selskap}</strong>
                    {!r.epost_sendt && <span className="pill sperret">E-post ikke sendt</span>}
                  </div>
                  <div className="muted tiny" style={{ marginTop: 4 }}>
                    <a href={`mailto:${r.epost}`}>{r.epost}</a>
                    {" · "}
                    {tidspunkt(r.created_at)}
                    {r.side && <> · {r.side}</>}
                  </div>
                </div>
                <button
                  className="button secondary"
                  disabled={busy === r.id}
                  onClick={() => marker(r.id, !r.behandlet_at)}
                >
                  {r.behandlet_at ? "Angre" : "Marker behandlet"}
                </button>
              </div>
              <p className="tilbakemelding-tekst">{r.melding}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
