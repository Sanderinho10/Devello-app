"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExcelDrop } from "@/components/ExcelDrop";
import type { PriceListWithCount } from "./page";
import {
  PRICE_KIND_HELP,
  PRICE_KIND_LABELS,
  type PriceItemKind,
} from "@/lib/types";

const KINDS: PriceItemKind[] = ["punktpris", "materiell", "time"];

/**
 * Oversikt over prislister, gruppert etter type.
 *
 * En type kan ha flere lister. Agenten henter fra de aktive listene av den
 * typen tilbudet krever — hvilken liste innenfor typen den velger, blir styrt
 * fra agent-innstillingene.
 */
export function PriceLists({
  punktpris,
  materiell,
  time,
}: {
  punktpris: PriceListWithCount[];
  materiell: PriceListWithCount[];
  time: PriceListWithCount[];
}) {
  const groups: Record<PriceItemKind, PriceListWithCount[]> = {
    punktpris,
    materiell,
    time,
  };

  return (
    <div className="stack">
      {KINDS.map((kind) => (
        <KindSection key={kind} kind={kind} lists={groups[kind]} />
      ))}
    </div>
  );
}

function KindSection({
  kind,
  lists,
}: {
  kind: PriceItemKind;
  lists: PriceListWithCount[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDetails([]);
    try {
      const data = new FormData();
      data.set("kind", kind);
      data.set("name", name);
      data.set("description", description);
      if (file) data.set("file", file);

      const res = await fetch("/api/price-lists", { method: "POST", body: data });
      const payload = await res.json();
      if (!res.ok) {
        setDetails(payload.details ?? []);
        throw new Error(payload.error ?? "Kunne ikke opprette listen");
      }
      setName("");
      setDescription("");
      setFile(null);
      setAdding(false);
      router.refresh();
      if (payload.imported > 0) router.push(`/tilbud/prisfil/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(list: PriceListWithCount) {
    await fetch("/api/price-lists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: list.id, active: !list.active }),
    });
    router.refresh();
  }

  async function remove(list: PriceListWithCount) {
    const message =
      list.item_count > 0
        ? `Slett «${list.name}» og de ${list.item_count} prisradene i listen?`
        : `Slett «${list.name}»?`;
    if (!window.confirm(message)) return;
    await fetch(`/api/price-lists?id=${list.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <strong>{PRICE_KIND_LABELS[kind]}</strong>
          <div className="tiny muted">{PRICE_KIND_HELP[kind]}</div>
        </div>
        <button
          className="button secondary"
          onClick={() => setAdding((current) => !current)}
        >
          {adding ? "Avbryt" : "Ny liste"}
        </button>
      </div>

      {adding && (
        <form className="card-pad" onSubmit={create} style={{ background: "var(--surface-sunken)" }}>
          {error && (
            <div className="banner error">
              <div>{error}</div>
              {details.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {details.slice(0, 8).map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                  {details.length > 8 && <li>… og {details.length - 8} til.</li>}
                </ul>
              )}
            </div>
          )}
          <div className="grid-2">
            <label className="field">
              <span className="label">Navn</span>
              <input
                className="input"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${PRICE_KIND_LABELS[kind]} 2026`}
              />
            </label>
            <label className="field">
              <span className="label">Beskrivelse (valgfritt)</span>
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="F.eks. «Næringskunder» eller «Gjelder fra 1. januar»"
              />
            </label>
          </div>
          <div className="field">
            <span className="label">Prisrader fra Excel (valgfritt)</span>
            <ExcelDrop
              file={file}
              onFile={setFile}
              templateHref={`/api/price-lists/template?kind=${kind}`}
            />
          </div>

          <button className="button" type="submit" disabled={busy}>
            {busy
              ? file
                ? "Leser inn filen…"
                : "Oppretter…"
              : file
                ? "Opprett og importer"
                : "Opprett tom liste"}
          </button>
        </form>
      )}

      {lists.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Ingen {PRICE_KIND_LABELS[kind].toLowerCase()}</div>
          <div>
            Uten en aktiv liste av denne typen kan ikke agenten lage tilbud som
            trenger den.
          </div>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Liste</th>
              <th className="num">Rader</th>
              <th>Status</th>
              <th style={{ width: 150 }} />
            </tr>
          </thead>
          <tbody>
            {lists.map((list) => (
              <tr key={list.id}>
                <td>
                  <Link
                    href={`/tilbud/prisfil/${list.id}`}
                    style={{ fontWeight: 550, textDecoration: "underline" }}
                  >
                    {list.name}
                  </Link>
                  {list.description && (
                    <div className="tiny muted">{list.description}</div>
                  )}
                </td>
                <td className="num">{list.item_count}</td>
                <td>
                  <span className={`pill ${list.active ? "bekrefta" : ""}`}>
                    {list.active ? "Aktiv" : "Inaktiv"}
                  </span>
                </td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button className="button ghost" onClick={() => toggleActive(list)}>
                      {list.active ? "Deaktiver" : "Aktiver"}
                    </button>
                    <button className="button danger" onClick={() => remove(list)}>
                      Slett
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
