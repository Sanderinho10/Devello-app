"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUOTE_TYPE_HELP,
  QUOTE_TYPE_LABELS,
  computeTotals,
  formatNok,
  hasDocument,
  type CompanyBrand,
  type Draft,
  type Lead,
  type QuoteDocument,
  type QuoteType,
} from "@/lib/types";

const ALL_TYPES: QuoteType[] = ["punktpris", "fastpris", "tid_og_materiell"];

export function DraftEditor({
  lead,
  draft,
  brand,
}: {
  lead: Lead;
  draft: Draft;
  brand: Partial<CompanyBrand> | null;
}) {
  const router = useRouter();

  const [quoteType, setQuoteType] = useState<QuoteType>(draft.quote_type);
  const [subject, setSubject] = useState(draft.email_subject);
  const [body, setBody] = useState(draft.email_body);
  const [document, setDocument] = useState<QuoteDocument | null>(draft.document);

  const [busy, setBusy] = useState<null | "lagrar" | "bekreftar" | "regenererer">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(draft.confirmed_at !== null);
  const [webLink, setWebLink] = useState(draft.outlook_web_link);

  const wantsDocument = hasDocument(quoteType);
  const totals = useMemo(
    () => (document ? computeTotals(document) : null),
    [document],
  );

  /**
   * Byter brukaren type, må innhaldet genererast på nytt — eit punktpris-dokument
   * kan ikkje gjenbrukast som ein tid-og-materiell-tekst.
   */
  async function changeType(next: QuoteType) {
    if (next === quoteType) return;
    setQuoteType(next);
    setBusy("regenererer");
    setError(null);
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, quote_type: next }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikkje generere på nytt");
      setSubject(payload.draft.email_subject);
      setBody(payload.draft.email_body);
      setDocument(payload.draft.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setQuoteType(draft.quote_type);
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy("bekreftar");
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_type: quoteType,
          email_subject: subject,
          email_body: body,
          document: wantsDocument ? document : null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikkje lage kladd");
      setConfirmed(true);
      setWebLink(payload.web_link ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function updateDocument(patch: Partial<QuoteDocument>) {
    setDocument((current) => (current ? { ...current, ...patch } : current));
  }

  function updateLine(
    sectionIndex: number,
    lineIndex: number,
    patch: Partial<QuoteDocument["sections"][number]["lines"][number]>,
  ) {
    setDocument((current) => {
      if (!current) return current;
      const sections = current.sections.map((section, si) =>
        si !== sectionIndex
          ? section
          : {
              ...section,
              lines: section.lines.map((line, li) =>
                li !== lineIndex ? line : { ...line, ...patch },
              ),
            },
      );
      return { ...current, sections };
    });
  }

  function removeLine(sectionIndex: number, lineIndex: number) {
    setDocument((current) => {
      if (!current) return current;
      const sections = current.sections.map((section, si) =>
        si !== sectionIndex
          ? section
          : { ...section, lines: section.lines.filter((_, li) => li !== lineIndex) },
      );
      return { ...current, sections };
    });
  }

  return (
    <div className="stack">
      {/* Type-bryter: agentens forslag, redigerbart før bekreft */}
      <div className="card card-pad">
        <span className="label">Tilbudstype</span>
        <div className="type-switch">
          {ALL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`type-option${type === quoteType ? " active" : ""}`}
              onClick={() => changeType(type)}
              disabled={busy !== null || confirmed}
            >
              {QUOTE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <div className="suggestion-note">
          <span>◆</span>
          <span>
            {draft.classification_note ? (
              <>
                Agenten foreslo <strong>{QUOTE_TYPE_LABELS[draft.quote_type]}</strong>:{" "}
                {draft.classification_note}
              </>
            ) : (
              QUOTE_TYPE_HELP[quoteType]
            )}
          </span>
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      {confirmed && (
        <div className="banner success">
          Kladden er oppretta i Outlook.{" "}
          {webLink && (
            <a href={webLink} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              Opne kladden
            </a>
          )}{" "}
          Du sender sjølv.
        </div>
      )}

      {busy === "regenererer" && (
        <div className="banner info">Genererer utkast på nytt for ny type…</div>
      )}

      {!wantsDocument && (
        <div className="banner info">
          Tid og materiell gir ingen PDF. Heile tilbodet ligg i e-postteksten, og
          teksten blir lagt rett inn i Outlook-kladden ved bekreft.
        </div>
      )}

      {/* Dokument-forhandsvisning for punktpris og fastpris */}
      {wantsDocument && document && (
        <div className="doc-preview">
          <div className="doc-head">
            <div style={{ fontSize: 17, fontWeight: 600 }}>
              {brand?.contact_name ?? ""}
            </div>
            <div className="doc-sender">
              {brand?.address_line && <div>{brand.address_line}</div>}
              {(brand?.postal_code || brand?.city) && (
                <div>{[brand.postal_code, brand.city].filter(Boolean).join(" ")}</div>
              )}
              {brand?.contact_email && <div>{brand.contact_email}</div>}
              {brand?.contact_phone && <div>{brand.contact_phone}</div>}
            </div>
          </div>

          <label className="field">
            <span className="label">Tittel</span>
            <input
              className="input"
              value={document.title}
              onChange={(e) => updateDocument({ title: e.target.value })}
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <span className="label">Kunde</span>
              <input
                className="input"
                value={document.customer.name}
                onChange={(e) =>
                  updateDocument({
                    customer: { ...document.customer, name: e.target.value },
                  })
                }
              />
            </label>
            <label className="field">
              <span className="label">Adresse</span>
              <input
                className="input"
                value={document.customer.address ?? ""}
                onChange={(e) =>
                  updateDocument({
                    customer: { ...document.customer, address: e.target.value },
                  })
                }
              />
            </label>
          </div>

          <label className="field">
            <span className="label">Innleiing</span>
            <textarea
              className="textarea"
              style={{ minHeight: 80 }}
              value={document.intro}
              onChange={(e) => updateDocument({ intro: e.target.value })}
            />
          </label>

          {document.sections.map((section, sectionIndex) => (
            <div key={sectionIndex} style={{ marginBottom: 18 }}>
              <span className="label">
                {document.sections.length > 1 ? section.title : "Postar"}
              </span>
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Post</th>
                    <th className="num" style={{ width: 100 }}>
                      Antal
                    </th>
                    <th className="num" style={{ width: 130 }}>
                      Einingspris
                    </th>
                    <th className="num" style={{ width: 120 }}>
                      Sum
                    </th>
                    <th style={{ width: 34 }} />
                  </tr>
                </thead>
                <tbody>
                  {section.lines.map((line, lineIndex) => (
                    <tr key={lineIndex}>
                      <td>
                        <input
                          className="cell-input"
                          value={line.description}
                          onChange={(e) =>
                            updateLine(sectionIndex, lineIndex, {
                              description: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        <input
                          className="cell-input num"
                          type="number"
                          min="0"
                          step="0.5"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(sectionIndex, lineIndex, {
                              quantity: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        {/* Einingsprisen kjem frå prisfila og er ikkje redigerbar her —
                            skal prisen endrast, endrar ein prisfila. */}
                        <span className="muted">{formatNok(line.unit_price)}</span>
                        <div className="tiny muted">per {line.unit}</div>
                      </td>
                      <td className="num">
                        <strong>{formatNok(line.quantity * line.unit_price)}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button danger"
                          title="Fjern post"
                          onClick={() => removeLine(sectionIndex, lineIndex)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {totals && (
            <div className="doc-totals">
              <div className="doc-total-row">
                <span>Sum eks. mva</span>
                <span>{formatNok(totals.subtotal)}</span>
              </div>
              <div className="doc-total-row">
                <span>Mva {document.vat_rate} %</span>
                <span>{formatNok(totals.vat)}</span>
              </div>
              <div className="doc-total-row grand">
                <span>Total</span>
                <span>{formatNok(totals.total)}</span>
              </div>
            </div>
          )}

          <label className="field" style={{ marginTop: 26 }}>
            <span className="label">Føresetnader</span>
            <textarea
              className="textarea"
              style={{ minHeight: 90 }}
              value={document.assumptions.join("\n")}
              onChange={(e) =>
                updateDocument({
                  assumptions: e.target.value.split("\n").filter((l) => l.trim()),
                })
              }
            />
            <span className="hint">Éi linje per føresetnad.</span>
          </label>
        </div>
      )}

      {/* E-posttekst */}
      <div className="card card-pad">
        <label className="field">
          <span className="label">Emne</span>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="label">E-posttekst</span>
          <textarea
            className={`textarea${wantsDocument ? "" : " tall"}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {wantsDocument && (
            <span className="hint">
              Teksten følgjer med som melding når PDF-en blir lagt ved.
            </span>
          )}
        </label>
      </div>

      <div className="action-bar">
        {wantsDocument && (
          <a
            className="button secondary"
            href={`/api/drafts/${draft.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Forhandsvis PDF
          </a>
        )}
        <span className="spacer" />
        <span className="muted tiny">
          {wantsDocument
            ? "Bekreft lagar kladd i Outlook med PDF-en vedlagt. Du sender sjølv."
            : "Bekreft lagar kladd i Outlook. Du sender sjølv."}
        </span>
        <button className="button" onClick={confirm} disabled={busy !== null}>
          {busy === "bekreftar"
            ? "Lagar kladd…"
            : confirmed
              ? "Oppdater kladd"
              : "Bekreft og lag kladd"}
        </button>
      </div>
    </div>
  );
}
