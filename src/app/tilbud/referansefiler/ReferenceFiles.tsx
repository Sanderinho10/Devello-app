"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileDrop } from "@/components/FileDrop";
import { Modal } from "@/components/Modal";
import {
  QUOTE_TYPE_HELP,
  QUOTE_TYPE_LABELS,
  formatDate,
  type QuoteType,
  type ReferenceQuote,
} from "@/lib/types";

const TYPES: QuoteType[] = ["punktpris", "fastpris", "tid_og_materiell"];

const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Referansefilene er en samling filer merket med tilbudstype — ikke noe mer.
 *
 * Tittelen kommer fra filnavnet, så det eneste brukeren må ta stilling til er
 * hvilken type tilbudet var. Alt annet ville vært et skjema å fylle ut.
 */
export function ReferenceFiles({ items }: { items: ReferenceQuote[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<QuoteType>("punktpris");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setFile(null);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("type", type);
      data.set("file", file);

      const res = await fetch("/api/reference-quotes", {
        method: "POST",
        body: data,
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke laste opp");

      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ReferenceQuote) {
    if (!window.confirm(`Slett «${item.title}»?`)) return;
    await fetch(`/api/reference-quotes?id=${item.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <strong>
            {items.length} {items.length === 1 ? "fil" : "filer"}
          </strong>
          <button className="button" onClick={() => setOpen(true)}>
            Legg til nytt tilbud
          </button>
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
                <th>Fil</th>
                <th style={{ width: 170 }}>Tilbudstype</th>
                <th style={{ width: 150 }}>Lagt inn</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a
                      href={`/api/reference-quotes/${item.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 550, textDecoration: "underline" }}
                    >
                      {item.file_name ?? item.title}
                    </a>
                  </td>
                  <td>
                    <span className="pill">{QUOTE_TYPE_LABELS[item.type]}</span>
                  </td>
                  <td className="muted tiny">{formatDate(item.created_at)}</td>
                  <td>
                    <button className="button danger" onClick={() => remove(item)}>
                      Slett
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={close} title="Legg til nytt tilbud">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          <div className="field">
            <span className="label">Fil</span>
            <FileDrop
              file={file}
              onFile={setFile}
              extensions={["pdf", "doc", "docx"]}
              accept={ACCEPT}
              label="Dra inn tilbudet, eller"
              rejectHint="Vi tar imot PDF og Word."
              autoFocus
            />
          </div>

          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">Tilbudstype</span>
            <select
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as QuoteType)}
            >
              {TYPES.map((option) => (
                <option key={option} value={option}>
                  {QUOTE_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
            <span className="hint">{QUOTE_TYPE_HELP[type]}</span>
          </label>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy || !file}>
              {busy ? "Laster opp…" : "Legg til"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
