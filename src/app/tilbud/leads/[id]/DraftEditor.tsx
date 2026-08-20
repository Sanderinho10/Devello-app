"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PriceItemPicker } from "@/components/PriceItemPicker";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import {
  QUOTE_TYPE_HELP,
  QUOTE_TYPE_LABELS,
  type QuoteConfidence,
  computeTotals,
  formatNok,
  hasDocument,
  type CompanyBrand,
  type Draft,
  type Lead,
  type PriceItemKind,
  type PriceListItem,
  type QuoteDocument,
  type QuoteLine,
  type QuoteType,
} from "@/lib/types";

const ALL_TYPES: QuoteType[] = ["punktpris", "fastpris", "tid_og_materiell"];

interface DragRef {
  section: number;
  line: number;
}

interface Snapshot {
  email_subject: string;
  email_body: string;
  document: QuoteDocument | null;
  confidence: QuoteConfidence;
  confidence_note: string | null;
}

export function DraftEditor({
  lead,
  draft,
  brand,
  address,
  priceItems,
}: {
  lead: Lead;
  draft: Draft;
  brand: Partial<CompanyBrand> | null;
  /** Avsenderadressen, fra selskapet — samme kilde som PDF-en bruker. */
  address: { line: string | null; postalCode: string | null; city: string | null };
  priceItems: PriceListItem[];
}) {
  const router = useRouter();

  const [quoteType, setQuoteType] = useState<QuoteType>(draft.quote_type);
  const [subject, setSubject] = useState(draft.email_subject);
  const [body, setBody] = useState(draft.email_body);
  const [document, setDocument] = useState<QuoteDocument | null>(draft.document);

  const [confidence, setConfidence] = useState<QuoteConfidence>(draft.confidence);
  const [confidenceNote, setConfidenceNote] = useState(draft.confidence_note);

  const [busy, setBusy] = useState<null | "bekrefter" | "regenererer" | "lagrer">(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(draft.confirmed_at !== null);
  const [webLink, setWebLink] = useState(draft.outlook_web_link);

  const [dragging, setDragging] = useState<DragRef | null>(null);
  const [dragOver, setDragOver] = useState<DragRef | null>(null);

  /**
   * Utkast vi allerede har sett i denne økten, per type.
   *
   * Uten denne koster hvert klikk på type-bryteren et modellkall — også når man
   * bare skal se tilbake på noe man allerede har generert. Cachen holder også på
   * redigeringer som ikke er lagret ennå, så et bytte fram og tilbake ikke
   * kaster arbeid.
   */
  const [seen, setSeen] = useState<Partial<Record<QuoteType, Snapshot>>>({
    [draft.quote_type]: {
      email_subject: draft.email_subject,
      email_body: draft.email_body,
      document: draft.document,
      confidence: draft.confidence,
      confidence_note: draft.confidence_note,
    },
  });

  const wantsDocument = hasDocument(quoteType);
  const totals = useMemo(
    () => (document ? computeTotals(document) : null),
    [document],
  );

  /**
   * Bytter brukeren type, må innholdet genereres på nytt — et punktpris-dokument
   * kan ikke gjenbrukes som en tid-og-materiell-tekst.
   */
  function currentSnapshot(): Snapshot {
    return {
      email_subject: subject,
      email_body: body,
      document,
      confidence,
      confidence_note: confidenceNote,
    };
  }

  function apply(snapshot: Snapshot) {
    setSubject(snapshot.email_subject);
    setBody(snapshot.email_body);
    setDocument(snapshot.document);
    setConfidence(snapshot.confidence);
    setConfidenceNote(snapshot.confidence_note);
  }

  async function changeType(next: QuoteType) {
    if (next === quoteType) return;

    // Ta vare på det vi står med, så redigeringer overlever et bytte.
    const keep = currentSnapshot();
    setSeen((current) => ({ ...current, [quoteType]: keep }));

    const cached = seen[next];
    if (cached) {
      setQuoteType(next);
      apply(cached);
      // Databasen må følge med, ellers viser PDF-en og bekreft feil type.
      void save(next, cached);
      return;
    }

    await generate(next, false);
  }

  /** Lagrer uten modellkall. Holder databasen i takt med det som står på skjermen. */
  async function save(type: QuoteType, snapshot: Snapshot) {
    try {
      await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_type: type,
          email_subject: snapshot.email_subject,
          email_body: snapshot.email_body,
          document: hasDocument(type) ? snapshot.document : null,
        }),
      });
    } catch {
      // Lagring i bakgrunnen. Feiler den, får brukeren beskjed ved bekreft,
      // som er den handlingen som faktisk må være korrekt.
    }
  }

  /**
   * PDF-ruten leser fra databasen, så vi lagrer før vi henter.
   *
   * Fanen åpnes med én gang, mens klikket fortsatt gjelder — venter vi til
   * PDF-en er ferdig, blir den blokkert som en popup. Og vi henter den med
   * fetch i stedet for å peke fanen rett på ruta, slik at en feil havner som
   * en melding i appen og ikke som en tom fane brukeren må tolke selv.
   */
  async function previewPdf() {
    const tab = window.open("", "_blank");
    setBusy("lagrer");
    setError(null);
    try {
      await save(quoteType, currentSnapshot());

      const res = await fetch(`/api/drafts/${draft.id}/pdf`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Kunne ikke lage PDF (${res.status})`);
      }

      const url = URL.createObjectURL(await res.blob());
      if (tab) {
        tab.location.href = url;
      } else {
        // Nettleseren stoppet fanen. Last ned i stedet for å gi opp.
        const link = window.document.createElement("a");
        link.href = url;
        link.download = "tilbud.pdf";
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /**
   * force = true tvinger et nytt modellkall. Uten det får vi et lagret utkast
   * tilbake hvis typen er generert for dette leadet før.
   */
  async function generate(type: QuoteType, force: boolean) {
    const previousType = quoteType;
    setQuoteType(type);
    setBusy("regenererer");
    setError(null);
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, quote_type: type, force }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke generere");

      const snapshot: Snapshot = {
        email_subject: payload.draft.email_subject,
        email_body: payload.draft.email_body,
        document: payload.draft.document,
        confidence: payload.draft.confidence,
        confidence_note: payload.draft.confidence_note,
      };
      apply(snapshot);
      setSeen((current) => ({ ...current, [type]: snapshot }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setQuoteType(previousType);
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy("bekrefter");
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
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lage kladd");
      setConfirmed(true);
      setWebLink(payload.web_link ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  // ---------------------------------------------------------------- dokument --

  function updateDocument(patch: Partial<QuoteDocument>) {
    setDocument((current) => (current ? { ...current, ...patch } : current));
  }

  /** Alle endringer på poster går gjennom denne, så formen holder seg. */
  function updateSectionLines(
    sectionIndex: number,
    transform: (lines: QuoteLine[]) => QuoteLine[],
  ) {
    setDocument((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section, si) =>
          si !== sectionIndex ? section : { ...section, lines: transform(section.lines) },
        ),
      };
    });
  }

  function updateLine(
    sectionIndex: number,
    lineIndex: number,
    patch: Partial<QuoteLine>,
  ) {
    updateSectionLines(sectionIndex, (lines) =>
      lines.map((line, li) => (li !== lineIndex ? line : { ...line, ...patch })),
    );
  }

  function removeLine(sectionIndex: number, lineIndex: number) {
    updateSectionLines(sectionIndex, (lines) =>
      lines.filter((_, li) => li !== lineIndex),
    );
  }

  function moveLine(sectionIndex: number, from: number, to: number) {
    if (from === to) return;
    updateSectionLines(sectionIndex, (lines) => {
      const next = [...lines];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /**
   * Nye poster kommer fra prisfilen, ikke fra fritekst. Samme regel som for agenten:
   * skal en pris endres, endrer man prisfilen — da gjelder den for alle tilbud.
   */
  function addLine(sectionIndex: number, priceItemId: string) {
    const item = priceItems.find((candidate) => candidate.id === priceItemId);
    if (!item) return;
    updateSectionLines(sectionIndex, (lines) => [
      ...lines,
      {
        price_item_id: item.id,
        description: item.name,
        quantity: 1,
        unit: item.unit,
        unit_price: Number(item.unit_price),
      },
    ]);
  }

  const locked = confirmed || busy !== null;

  return (
    <div className="stack">
      {/* Type-bryter: agentens forslag, redigerbart før bekreft */}
      <div className="card card-pad allow-overflow">
        <div className="row-between" style={{ marginBottom: 8 }}>
          <span className="label" style={{ marginBottom: 0 }}>
            Tilbudstype
          </span>
          <ConfidenceBadge
            level={confidence}
            note={confidenceNote}
            classificationNote={draft.typebegrunnelse}
            suggestedType={draft.quote_type}
          />
        </div>
        <div className="type-switch">
          {ALL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`type-option${type === quoteType ? " active" : ""}`}
              onClick={() => changeType(type)}
              disabled={locked}
            >
              {QUOTE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <span className="hint">{QUOTE_TYPE_HELP[quoteType]}</span>
      </div>

      {error && <div className="banner error">{error}</div>}

      {/* Agentens beskjeder. Den kan ikke spørre — dette er kanalen dens. */}
      {draft.merknader.length > 0 && (
        <div className="banner warning">
          <strong>Fra agenten:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {draft.merknader.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {draft.agent_status === "trenger_avklaring" && (
        <div className="banner info">
          <strong>Avklaringskladd.</strong> Jobben var for ukjent til å prise —
          e-postteksten under stiller ett avklaringsspørsmål i stedet for å
          gjette et tilbud. Rediger og send den, eller velg en type og trykk
          «Generer på nytt» hvis du vet mer enn leadet sier.
        </div>
      )}

      {confirmed && (
        <div className="banner success">
          Kladden er opprettet i Outlook.{" "}
          {webLink && (
            <a href={webLink} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              Åpne kladden
            </a>
          )}{" "}
          Du sender selv.
        </div>
      )}

      {busy === "regenererer" && (
        <div className="banner info">Genererer utkast på nytt for ny type…</div>
      )}

      {!wantsDocument && (
        <div className="banner info">
          Tid og materiell gir ingen PDF. Hele tilbudet ligger i e-postteksten, og
          teksten blir lagt rett inn i Outlook-kladden ved bekreft.
        </div>
      )}

      {/* Dokument-forhåndsvisning for punktpris og fastpris */}
      {draft.agent_status !== "trenger_avklaring" && wantsDocument && document && (
        <div className="doc-preview">
          <div className="doc-head">
            <div style={{ fontSize: 17, fontWeight: 600 }}>
              {brand?.contact_name ?? ""}
            </div>
            <div className="doc-sender">
              {address?.line && <div>{address.line}</div>}
              {(address?.postalCode || address?.city) && (
                <div>{[address.postalCode, address.city].filter(Boolean).join(" ")}</div>
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

          {document.sections.map((section, sectionIndex) => {
            const available = itemsForSection(
              quoteType,
              sectionIndex,
              section.title,
              priceItems,
            );

            return (
              <div key={sectionIndex} style={{ marginBottom: 22 }}>
                <span className="label">
                  {document.sections.length > 1 ? section.title : "Poster"}
                </span>

                <table className="doc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }} />
                      <th>Post</th>
                      <th className="num" style={{ width: 100 }}>
                        Antall
                      </th>
                      <th className="num" style={{ width: 130 }}>
                        Enhetspris
                      </th>
                      <th className="num" style={{ width: 120 }}>
                        Sum
                      </th>
                      <th style={{ width: 34 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {section.lines.map((line, lineIndex) => {
                      const isDragTarget =
                        dragOver?.section === sectionIndex &&
                        dragOver?.line === lineIndex &&
                        dragging?.section === sectionIndex &&
                        dragging?.line !== lineIndex;

                      return (
                        <tr
                          key={lineIndex}
                          className={isDragTarget ? "drag-over" : undefined}
                          onDragOver={(event) => {
                            if (dragging?.section !== sectionIndex) return;
                            event.preventDefault();
                            setDragOver({ section: sectionIndex, line: lineIndex });
                          }}
                          onDrop={(event) => {
                            if (dragging?.section !== sectionIndex) return;
                            event.preventDefault();
                            moveLine(sectionIndex, dragging.line, lineIndex);
                            setDragging(null);
                            setDragOver(null);
                          }}
                        >
                          <td>
                            {/* Bare håndtaket er draggbart — ellers kan man ikke
                                markere tekst i feltene på raden. */}
                            <span
                              className="grip"
                              role="button"
                              tabIndex={0}
                              aria-label={`Flytt post ${lineIndex + 1} av ${section.lines.length}`}
                              title="Dra for å flytte, eller bruk piltastene"
                              draggable
                              onDragStart={() =>
                                setDragging({ section: sectionIndex, line: lineIndex })
                              }
                              onDragEnd={() => {
                                setDragging(null);
                                setDragOver(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "ArrowUp" && lineIndex > 0) {
                                  event.preventDefault();
                                  moveLine(sectionIndex, lineIndex, lineIndex - 1);
                                }
                                if (
                                  event.key === "ArrowDown" &&
                                  lineIndex < section.lines.length - 1
                                ) {
                                  event.preventDefault();
                                  moveLine(sectionIndex, lineIndex, lineIndex + 1);
                                }
                              }}
                            >
                              ⠿
                            </span>
                          </td>
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
                            {/* Enhetsprisen kommer fra prisfilen og er ikke redigerbar
                                her — skal prisen endres, endrer man prisfilen. */}
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
                              aria-label={`Fjern ${line.description}`}
                              onClick={() => removeLine(sectionIndex, lineIndex)}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {section.lines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted tiny" style={{ padding: "14px 0" }}>
                          Ingen poster i denne seksjonen.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {available.length > 0 ? (
                  <div className="add-line">
                    <PriceItemPicker
                      items={available}
                      onSelect={(item) => addLine(sectionIndex, item.id)}
                    />
                  </div>
                ) : (
                  <p className="hint">
                    Ingen passende prisrader.{" "}
                    <Link href="/tilbud/prisfil" style={{ textDecoration: "underline" }}>
                      Legg dem inn under Prisfil
                    </Link>{" "}
                    for å kunne bruke dem her.
                  </p>
                )}
              </div>
            );
          })}

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
            <span className="label">Forutsetninger</span>
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
            <span className="hint">Én linje per forutsetning.</span>
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
              Teksten følger med som melding når PDF-en blir lagt ved.
            </span>
          )}
        </label>
      </div>

      <div className="action-bar">
        {wantsDocument && (
          <button
            type="button"
            className="button secondary"
            onClick={previewPdf}
            disabled={busy !== null}
          >
            {busy === "lagrer" ? "Lager PDF…" : "Forhåndsvis PDF"}
          </button>
        )}
        <span className="spacer" />
        <span className="muted tiny">
          {wantsDocument
            ? "Bekreft lager kladd i Outlook med PDF-en vedlagt. Du sender selv."
            : "Bekreft lager kladd i Outlook. Du sender selv."}
        </span>
        <button className="button" onClick={confirm} disabled={busy !== null}>
          {busy === "bekrefter"
            ? "Lager kladd…"
            : confirmed
              ? "Oppdater kladd"
              : "Bekreft og lag kladd"}
        </button>
      </div>
    </div>
  );
}

/**
 * Hva prisrader som passer i en gitt seksjon.
 *
 * Punktpris har én seksjon med buntede priser. Fastpris har materiell og arbeid
 * hver for seg — vi leser seksjonstittelen først, og faller tilbake på rekkefølgen
 * hvis modellen har kalt seksjonene noe annet enn ventet.
 */
function itemsForSection(
  quoteType: QuoteType,
  sectionIndex: number,
  sectionTitle: string,
  items: PriceListItem[],
): PriceListItem[] {
  if (quoteType === "punktpris") {
    return items.filter((item) => item.kind === "punktpris");
  }

  let wanted: PriceItemKind;
  if (/arbeid|time|timer/i.test(sectionTitle)) {
    wanted = "time";
  } else if (/materiell|material|utstyr/i.test(sectionTitle)) {
    wanted = "materiell";
  } else {
    wanted = sectionIndex === 0 ? "materiell" : "time";
  }

  return items.filter((item) => item.kind === wanted);
}
