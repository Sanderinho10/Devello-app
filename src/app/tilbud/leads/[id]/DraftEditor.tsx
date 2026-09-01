"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SendSjolv } from "./SendSjolv";
import Link from "next/link";
import { PriceItemPicker } from "@/components/PriceItemPicker";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import {
  QUOTE_TYPE_HELP,
  QUOTE_TYPE_LABELS,
  type QuoteConfidence,
  computeTotals,
  formatNok,
  lineTotal,
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

/** Det vinduet for manuell sending trenger for å vise tilbudet fram. */
interface SendSjolvData {
  mottaker: string | null;
  mottakerNavn: string | null;
  emne: string;
  tekst: string;
  harPdf: boolean;
  outlookFeil: string | null;
}

export function DraftEditor({
  lead,
  draft,
  brand,
  address,
  priceItems,
  harPostkasse,
}: {
  lead: Lead;
  draft: Draft;
  brand: Partial<CompanyBrand> | null;
  /** Avsenderadressen, fra selskapet — samme kilde som PDF-en bruker. */
  address: { line: string | null; postalCode: string | null; city: string | null };
  priceItems: PriceListItem[];
  /** Har selskapet en Microsoft 365-postkasse koblet til? */
  harPostkasse: boolean;
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
  const [sendt, setSendt] = useState(draft.sent_at !== null);

  /**
   * Vinduet for manuell sending. Satt når bekreft ikke fikk lagt kladden i
   * Outlook — enten fordi ingen postkasse er koblet til, eller fordi
   * koblingen svikta i det øyeblikket.
   */
  /** Hva vinduet viste sist, og for hvilken versjon av utkastet. */
  const [sisteSending, setSisteSending] = useState<{
    nokkel: string;
    data: SendSjolvData;
  } | null>(null);

  const [sendSjolv, setSendSjolv] = useState<SendSjolvData | null>(null);

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
      // Et sendt tilbud lagres ikke — det er låst, og PDF-en skal vise det som
      // faktisk gikk ut, ikke det som står i skjemaet.
      if (!sendt) await save(quoteType, currentSnapshot());

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

      // Ingen kladd i Outlook: da må mennesket sende selv, og vinduet har
      // alt de trenger. Det låser ingenting — krysser de ut, står utkastet
      // som før.
      if (payload.manuell) {
        const data: SendSjolvData = {
          mottaker: payload.mottaker ?? null,
          mottakerNavn: payload.mottaker_navn ?? null,
          emne: payload.emne ?? subject,
          tekst: payload.tekst ?? body,
          harPdf: Boolean(payload.har_pdf),
          outlookFeil: payload.outlook_feil ?? null,
        };
        setSendSjolv(data);
        setSisteSending({ nokkel: tilstandsnokkel(), data });
      }
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

  /**
   * Seksjonene er underoverskriftene i tilbudet — «Gulvvarme», «Bad»,
   * «Materiell». De styrer hvordan tilbudet er delt opp på PDF-en, med egen
   * delsum per seksjon når det er mer enn én. Derfor må de kunne endres av
   * den som skriver tilbudet, og ikke bare av agenten som foreslo dem.
   */
  function updateSectionTitle(sectionIndex: number, title: string) {
    setDocument((current) =>
      !current
        ? current
        : {
            ...current,
            sections: current.sections.map((section, si) =>
              si !== sectionIndex ? section : { ...section, title },
            ),
          },
    );
  }

  function addSection() {
    setDocument((current) =>
      !current
        ? current
        : { ...current, sections: [...current.sections, { title: "", lines: [] }] },
    );
  }

  function removeSection(sectionIndex: number) {
    if (!document) return;
    const section = document.sections[sectionIndex];

    // Den siste seksjonen blir stående. Et dokument uten seksjoner har ingen
    // steder å legge poster, og da er tilbudet tomt uten at noen ba om det.
    if (document.sections.length <= 1) return;

    // Poster som forsvinner skal ikke forsvinne stille.
    if (
      section.lines.length > 0 &&
      !window.confirm(
        `«${section.title || "Seksjonen"}» har ${section.lines.length} ${
          section.lines.length === 1 ? "post" : "poster"
        }. Fjern seksjonen med postene?`,
      )
    ) {
      return;
    }

    setDocument((current) =>
      !current
        ? current
        : { ...current, sections: current.sections.filter((_, si) => si !== sectionIndex) },
    );
  }

  /** Prisen raden ville hatt fra prisfilen, hvis den peker på en rad der. */
  function katalogpris(line: QuoteLine): number | null {
    const rad = priceItems.find((item) => item.id === line.price_item_id);
    return rad ? Number(rad.unit_price) : null;
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

  // Bare mens noe pågår. Det som skal låse et tilbud er at det er sendt, og
  // det håndteres av fieldset-en rundt hele redigeringen — og server-siden
  // avviser generering på et sendt tilbud uansett. Å låse på «bekreftet» ville
  // stengt typebryteren første gang man trykker «Send selv», midt i flyten der
  // man nettopp har fått beskjed om at man gjerne kan rette mer.
  const locked = busy !== null;

  /**
   * «Send selv» — hele flyten for et selskap uten postkasse.
   *
   * Én knapp, ikke to. Uten Outlook er det ingen kladd å bekrefte og siden å
   * sende: det er én handling, og den gjør tilbudet klart og viser det fram.
   *
   * Trykker man på nytt uten å ha endret noe, lager vi ikke PDF-en om igjen —
   * vinduet viser det samme som sist. Har man rettet en linje i mellomtiden,
   * går det gjennom bekreft på nytt og vinduet får med endringen.
   */
  async function sendSjolvFlyt() {
    const naa = tilstandsnokkel();
    if (sisteSending && sisteSending.nokkel === naa) {
      setSendSjolv(sisteSending.data);
      return;
    }
    await confirm();
  }

  /**
   * Alt som havner i tilbudet, som én streng. Er den lik forrige gang, er det
   * ingenting nytt å lage.
   */
  function tilstandsnokkel(): string {
    return JSON.stringify({ quoteType, subject, body, document });
  }

  async function markerSendt() {
    setBusy("bekrefter");
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/sendt`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke markere som sendt");
      setSendt(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {sendt && (
        <div className="banner success" style={{ marginBottom: 18 }}>
          <strong>Tilbudet er sendt.</strong> Utkastet er låst, så det som ligger
          her er det kunden fikk.{" "}
          {wantsDocument && (
            <button className="linkish" onClick={previewPdf}>
              Åpne PDF-en
            </button>
          )}
        </div>
      )}

      {/*
        Alt under er skrudd av i ett grep når tilbudet er sendt. En disabled
        fieldset slår av hvert skjemafelt inni seg — det er hele poenget med
        elementet, og det er tryggere enn tjue disabled-attributter der den
        tjueførste blir glemt neste gang noen legger til et felt.
      */}
      <fieldset className="stack editor-felt" disabled={sendt}>
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

      {/*
        Bare når det faktisk finnes en kladd. Uten postkasse er det ingen
        kladd, og et grønt felt som påstår at den er opprettet er verre enn
        ingen beskjed — man tror jobben er gjort.
      */}
      {confirmed && webLink && (
        <div className="banner success">
          Kladden er opprettet i Outlook. Du sender selv.{" "}
          <a
            href={webLink}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline" }}
          >
            Åpne kladden
          </a>
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
                <div className="seksjon-topp">
                  <input
                    className="input seksjon-tittel"
                    value={section.title}
                    placeholder="Overskrift"
                    aria-label="Overskrift på seksjonen"
                    onChange={(e) => updateSectionTitle(sectionIndex, e.target.value)}
                  />
                  {document.sections.length > 1 && (
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => removeSection(sectionIndex)}
                    >
                      Fjern
                    </button>
                  )}
                </div>

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
                      <th className="num" style={{ width: 90 }}>
                        Rabatt
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
                              draggable={!sendt}
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
                            {/*
                              Prisen kommer fra prisfilen, men kan overstyres for
                              denne ene jobben — en rabatt, et påslag, en avtalt
                              pris. Overstyringen påvirker bare dette tilbudet:
                              neste generering slår opp prisfilen på nytt, og
                              beløpet herfra går aldri inn i agentens kontekst.
                            */}
                            <input
                              className="cell-input num"
                              type="number"
                              min="0"
                              step="1"
                              value={line.unit_price}
                              onChange={(e) => {
                                const pris = Number(e.target.value);
                                updateLine(sectionIndex, lineIndex, {
                                  unit_price: pris,
                                  unit_price_manual: pris !== katalogpris(line),
                                });
                              }}
                            />
                            <div className="tiny muted">per {line.unit}</div>
                            {line.unit_price_manual && (
                              <button
                                type="button"
                                className="cell-reset"
                                title="Sett tilbake til prisen i prisfilen"
                                onClick={() =>
                                  updateLine(sectionIndex, lineIndex, {
                                    unit_price: katalogpris(line) ?? line.unit_price,
                                    unit_price_manual: false,
                                  })
                                }
                              >
                                endret · tilbakestill
                              </button>
                            )}
                          </td>
                          <td className="num">
                            {/*
                              Rabatt i prosent, per rad. Tomt felt er ingen
                              rabatt. Kolonnen kommer med i PDF-en bare når
                              minst én rad har den — se harRabatt.
                            */}
                            <input
                              className="cell-input num"
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              placeholder="–"
                              aria-label="Rabatt i prosent"
                              value={line.discount_pct ? line.discount_pct : ""}
                              onChange={(e) => {
                                const pct = Number(e.target.value);
                                updateLine(sectionIndex, lineIndex, {
                                  discount_pct:
                                    pct > 0 ? Math.min(100, pct) : undefined,
                                });
                              }}
                            />
                            <div className="tiny muted">%</div>
                          </td>
                          <td className="num">
                            <strong>{formatNok(lineTotal(line))}</strong>
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
                        <td colSpan={7} className="muted tiny" style={{ padding: "14px 0" }}>
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
                    {quoteType === "fastpris" && (
                      // På fastpris avgjør overskriften hvilken prisliste
                      // seksjonen henter fra — «arbeid» og «timer» gir
                      // timepriser, «materiell» og «utstyr» gir materiell, og
                      // ellers avgjør rekkefølgen. Det er en regel man ikke
                      // kan se, så den står her i stedet for å overraske.
                      <span className="hint">
                        Henter fra {available[0].kind === "time" ? "timeprislisten" : "materiellisten"}.
                        Skriv «arbeid» eller «materiell» i overskriften for å styre det.
                      </span>
                    )}
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

          <button type="button" className="button ghost" onClick={addSection}>
            + Legg til seksjon
          </button>

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
          {!harPostkasse
            ? wantsDocument
              ? "Vi lager PDF-en og gir deg tekst og mottaker. Du sender fra din egen e-post."
              : "Vi gjør teksten klar. Du sender fra din egen e-post."
            : wantsDocument
              ? "Bekreft lager kladd i Outlook med PDF-en vedlagt. Du sender selv."
              : "Bekreft lager kladd i Outlook. Du sender selv."}
        </span>
        {harPostkasse && confirmed && webLink && (
          <button
            type="button"
            className="button secondary"
            onClick={markerSendt}
            disabled={busy !== null}
          >
            Marker som sendt
          </button>
        )}

        {/*
          Uten postkasse er dette den eneste knappen. Å skille «bekreft» fra
          «send» ga to knapper for det som er én handling — gjør tilbudet klart
          og vis det fram — og den første av dem gjorde ingenting man kunne se.
        */}
        <button
          className="button"
          onClick={harPostkasse ? confirm : sendSjolvFlyt}
          disabled={busy !== null}
        >
          {busy === "bekrefter"
            ? harPostkasse
              ? "Lager kladd…"
              : wantsDocument
                ? "Lager PDF…"
                : "Gjør klar…"
            : harPostkasse
              ? confirmed
                ? "Oppdater kladd"
                : "Bekreft og lag kladd"
              : "Send selv"}
        </button>
        </div>
      </fieldset>

      {sendSjolv && (
        <SendSjolv
          draftId={draft.id}
          mottaker={sendSjolv.mottaker}
          mottakerNavn={sendSjolv.mottakerNavn}
          emne={sendSjolv.emne}
          tekst={sendSjolv.tekst}
          harPdf={sendSjolv.harPdf}
          outlookFeil={sendSjolv.outlookFeil}
          onFullfoert={() => {
            setSendSjolv(null);
            setSendt(true);
            router.refresh();
          }}
          onLukk={() => setSendSjolv(null)}
        />
      )}
    </>
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
