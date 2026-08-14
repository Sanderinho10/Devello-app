"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  QUOTE_TYPE_HELP,
  QUOTE_TYPE_LABELS,
  formatDate,
  type QuoteType,
  type ReferenceQuote,
} from "@/lib/types";

const TYPES: QuoteType[] = ["punktpris", "fastpris", "tid_og_materiell"];

export function ReferenceFiles({ items }: { items: ReferenceQuote[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<QuoteType>("punktpris");
  const [jobDescription, setJobDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("title", title);
      data.set("type", type);
      data.set("job_description", jobDescription);
      if (file) data.set("file", file);

      const res = await fetch("/api/reference-quotes", { method: "POST", body: data });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");

      setTitle("");
      setJobDescription("");
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/reference-quotes?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <strong>Last opp referansetilbud</strong>
        </div>
        <form className="card-pad" onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          <label className="field">
            <span className="label">Tittel</span>
            <input
              className="input"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tilbud — stikkontakter rekkehus Bjørkeveien"
            />
          </label>

          <label className="field">
            <span className="label">Tilbudstype</span>
            <div className="type-switch">
              {TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`type-option${option === type ? " active" : ""}`}
                  onClick={() => setType(option)}
                >
                  {QUOTE_TYPE_LABELS[option]}
                </button>
              ))}
            </div>
            <span className="hint">{QUOTE_TYPE_HELP[type]}</span>
          </label>

          <label className="field">
            <span className="label">Hva slags jobb gjaldt tilbudet?</span>
            <textarea
              className="textarea"
              style={{ minHeight: 80 }}
              required
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Montering av stikkontakter og takpunkt i nybygg. Standardiserte enheter, kjent omfang."
            />
            <span className="hint">
              Dette er teksten klassifiseringen matcher nye forespørsler mot. Skriv
              den så den beskriver jobbtypen, ikke bare kunden.
            </span>
          </label>

          <label className="field">
            <span className="label">Fil (valgfritt)</span>
            <input
              className="input"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <button className="button" type="submit" disabled={busy}>
            {busy ? "Lagrer…" : "Legg til"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <strong>{items.length} referansefiler</strong>
        </div>
        {items.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen referansefiler ennå</div>
            <div>
              Uten referanser må agenten gjette tilbudstype ut fra omfanget alene.
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tittel</th>
                <th>Type</th>
                <th>Lagt inn</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 550 }}>{item.title}</div>
                    {item.job_description && (
                      <div className="tiny muted">{item.job_description}</div>
                    )}
                    {item.file_name && (
                      <div className="tiny muted">📎 {item.file_name}</div>
                    )}
                  </td>
                  <td>
                    <span className="pill">{QUOTE_TYPE_LABELS[item.type]}</span>
                  </td>
                  <td className="muted tiny">{formatDate(item.created_at)}</td>
                  <td>
                    <button className="button danger" onClick={() => remove(item.id)}>
                      Slett
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
