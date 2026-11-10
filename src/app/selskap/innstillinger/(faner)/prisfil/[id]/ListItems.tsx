"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExcelDrop } from "@/components/ExcelDrop";
import { Modal } from "@/components/Modal";
import { Vaskepanel } from "./Vaskepanel";
import { PrisCelle } from "@/components/PrisCelle";
import {
  KodeVelger,
  TOMT_KODEVALG,
  kategorinavnFor,
  kodeFor,
  validerKodevalg,
  type KodeValg,
} from "@/components/KodeVelger";
import {
  type PriceItemKind,
  type PriceList,
  type PriceListItem,
} from "@/lib/types";

/** Fornuftig standardenhet per type, så feltet sjelden må røres. */
const DEFAULT_UNIT: Record<PriceItemKind, string> = {
  punktpris: "stk",
  materiell: "stk",
  time: "time",
};

export function ListItems({
  list,
  items,
}: {
  list: PriceList;
  items: PriceListItem[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    unit: DEFAULT_UNIT[list.kind],
    unit_price: "",
  });
  const [kodevalg, setKodevalg] = useState<KodeValg>(TOMT_KODEVALG);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const [importUtenPris, setImportUtenPris] = useState(0);
  const [nyRad, setNyRad] = useState(false);
  const [importer, setImporter] = useState(false);

  const shown = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return items;
    return items.filter((item) => {
      const haystack = [item.name, item.code, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [items, query]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setDetails([]);
    const problem = validerKodevalg(kodevalg, items, false);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/price-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_list_id: list.id,
          ...form,
          code: kodeFor(kodevalg),
          kategori_navn: kategorinavnFor(kodevalg),
          unit_price: Number(form.unit_price),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setKodevalg(TOMT_KODEVALG);
      setForm({
        name: "",
        description: "",
        unit: DEFAULT_UNIT[list.kind],
        unit_price: "",
      });
      setNyRad(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/price-items?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function importFile(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (
      replace &&
      items.length > 0 &&
      !window.confirm(
        `Erstatt de ${items.length} eksisterende radene i «${list.name}» med innholdet i filen?`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setDetails([]);
    setImported(null);
    setImportUtenPris(0);
    try {
      const data = new FormData();
      data.set("price_list_id", list.id);
      data.set("file", file);
      data.set("mode", replace ? "replace" : "append");

      const res = await fetch("/api/price-lists/import", { method: "POST", body: data });
      const payload = await res.json();
      if (!res.ok) {
        setDetails(payload.details ?? []);
        throw new Error(payload.error ?? "Importen feilet");
      }
      setImported(payload.imported);
      setImportUtenPris(payload.utenPris ?? 0);
      setFile(null);
      setImporter(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function aapne(hva: "rad" | "import") {
    setError(null);
    setDetails([]);
    if (hva === "rad") setNyRad(true);
    else setImporter(true);
  }

  return (
    <div className="stack">
      {/* Står øverst med vilje: det som ser rart ut skal møte deg før
          importknappen, ikke etter at du har lagt til enda en rad. */}
      <Vaskepanel items={items} onVelgRad={setQuery} />

      {imported !== null && (
        <div className="banner success">
          Importerte {imported} {imported === 1 ? "rad" : "rader"}.
          {importUtenPris > 0 && <> {importUtenPris} av dem har ingen pris — se gjennomgangen øverst.</>}
        </div>
      )}

      <div className="verktoylinje" style={{ margin: 0 }}>
        <button type="button" className="button" onClick={() => aapne("rad")}>
          Ny prisrad
        </button>
        <button type="button" className="button secondary" onClick={() => aapne("import")}>
          Importer fra Excel
        </button>
        <div className="verktoylinje-hoyre">
          <span className="tiny muted">
            {query ? `${shown.length} av ` : ""}
            {items.length} {items.length === 1 ? "rad" : "rader"}
          </span>
          <input className="input" type="search" placeholder="Søk i listen" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="card allow-overflow">
        {shown.length === 0 ? (
          <div className="empty">
            {items.length === 0 ? (
              <>
                <div className="empty-title">Listen er tom</div>
                <div>Legg inn prisrader, eller importer dem fra Excel.</div>
              </>
            ) : (
              <>Ingen rader matcher «{query}».</>
            )}
          </div>
        ) : (
          <table className="table tabell-mobil">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Kode</th>
                <th>Navn</th>
                <th>Enhet</th>
                <th className="num">Enhetspris</th>
                <th aria-label="Handlinger" />
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  <td className="meta">{item.code ? <span className="picker-code">{item.code}</span> : <span className="muted">—</span>}</td>
                  <td className="hoved">
                    <div style={{ fontWeight: 550 }}>{item.name}</div>
                    {item.description && <div className="tiny muted">{item.description}</div>}
                  </td>
                  <td className="meta muted">{item.unit}</td>
                  <td className="num belop">
                    <PrisCelle id={item.id} pris={Number(item.unit_price)} onLagra={() => router.refresh()} />
                  </td>
                  <td className="handling">
                    <button type="button" className="button ghost" onClick={() => remove(item.id)}>
                      Slett
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={nyRad} onClose={() => !busy && setNyRad(false)} title="Ny prisrad" size="wide">
        <form onSubmit={save}>
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
          <div className="kontakt-panel ny-post-panel">
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Navn</span>
              <input
                className="input"
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Montering stikkontakt, dobbel"
              />
            </label>
            {/* Kodene er kategorier — B er bad, EL er elbillader. Raden legges
                inn under de andre i kategorien sin, ikke nederst. */}
            <div className="kontakt-rad topp">
              <span className="kontakt-rad-etikett">Kode</span>
              <div>
                <KodeVelger rader={items} verdi={kodevalg} onChange={setKodevalg} paakrevd={false} />
              </div>
            </div>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Beskrivelse</span>
              <input
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Valgfritt — hjelper agenten å velge rett post"
              />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Enhet</span>
              <span className="kort-felt">
                <input className="input" required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </span>
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Pris eks. mva</span>
              <span className="kort-felt">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                />
              </span>
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setNyRad(false)} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Lagrer…" : "Legg til"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={importer} onClose={() => !busy && setImporter(false)} title="Importer fra Excel">
        <form onSubmit={importFile}>
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
          <ExcelDrop file={file} onFile={setFile} templateHref={`/api/price-lists/template?kind=${list.kind}`} />
          {items.length > 0 && (
            <label className="ny-post-lagre" style={{ marginTop: 14 }}>
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span>Erstatt de {items.length} eksisterende radene i stedet for å legge til</span>
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setImporter(false)} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy || !file}>
              {busy ? "Leser inn filen…" : replace ? "Erstatt rader" : "Importer rader"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
