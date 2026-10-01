"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, type OrderNote } from "@/lib/types";

type Notat = OrderNote & { user_name: string; bilete: { id: string; title: string }[] };

/** Lista over notat: navn, tid, tekst og miniatyrer. Slett eget, eller alt som administrator. */
export function NotatFane({ orderId, userId, erAdmin, notat }: { orderId: string; userId: string; erAdmin: boolean; notat: Notat[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function slett(id: string) {
    if (!window.confirm("Slette notatet? Bildene blir stående på ordren.")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/notat/${id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="label">Notater fra jobben</span>
        <span className="tiny muted">Skrives i montørappen. Her kan de leses og slettes.</span>
      </div>
      {error && <div className="banner error" style={{ margin: 16 }}>{error}</div>}
      {notat.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Ingen notater ennå</div>
          <div>Montøren skriver notat og tar bilder i appen, og de dukker opp her.</div>
        </div>
      ) : (
        <div className="lead-list">
          {notat.map((n) => (
            <div key={n.id} className="lead-row" style={{ alignItems: "flex-start" }}>
              <div className="lead-main">
                <div className="lead-meta">
                  <strong>{n.user_name || "Ukjent"}</strong> · {formatDate(n.created_at)}
                </div>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{n.text}</div>
                {n.bilete.length > 0 && (
                  <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {n.bilete.map((b) => (
                      <a key={b.id} href={`/api/orders/${orderId}/dokumenter/${b.id}/fil`} target="_blank" rel="noreferrer" title={b.title}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/orders/${orderId}/dokumenter/${b.id}/fil`}
                          alt={b.title}
                          style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border, #ddd)" }}
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {(erAdmin || n.user_id === userId) && (
                <button type="button" className="button ghost" disabled={busy !== null} onClick={() => slett(n.id)}>
                  {busy === n.id ? "Sletter…" : "Slett"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
