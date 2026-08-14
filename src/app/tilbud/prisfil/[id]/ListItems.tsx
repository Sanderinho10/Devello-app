"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExcelDrop } from "@/components/ExcelDrop";
import {
  formatNok,
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
    code: "",
    name: "",
    description: "",
    unit: DEFAULT_UNIT[list.kind],
    unit_price: "",
  });
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/price-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_list_id: list.id,
          ...form,
          unit_price: Number(form.unit_price),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setForm({
        code: "",
        name: "",
        description: "",
        unit: DEFAULT_UNIT[list.kind],
        unit_price: "",
      });
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
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <strong>Importer fra Excel</strong>
          <span className="tiny muted">
            {items.length > 0 ? "Legg til eller erstatt radene" : "Fyll listen fra en fil"}
          </span>
        </div>
        <form className="card-pad" onSubmit={importFile}>
          {imported !== null && (
            <div className="banner success">
              Importerte {imported} {imported === 1 ? "rad" : "rader"}.
            </div>
          )}

          <ExcelDrop
            file={file}
            onFile={setFile}
            templateHref={`/api/price-lists/template?kind=${list.kind}`}
          />

          {items.length > 0 && (
            <label className="row" style={{ marginTop: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              <span className="tiny">
                Erstatt de {items.length} eksisterende radene i stedet for å legge til
              </span>
            </label>
          )}

          <button
            className="button"
            type="submit"
            disabled={busy || !file}
            style={{ marginTop: 14 }}
          >
            {busy ? "Leser inn filen…" : replace ? "Erstatt rader" : "Importer rader"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <strong>Ny prisrad</strong>
        </div>
        <form className="card-pad" onSubmit={save}>
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
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Montering stikkontakt, dobbel"
              />
            </label>
            <label className="field">
              <span className="label">Kode (valgfritt)</span>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="EL-104"
              />
            </label>
          </div>

          <label className="field">
            <span className="label">Beskrivelse (valgfritt)</span>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Hjelper agenten å velge rett post"
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <span className="label">Enhet</span>
              <input
                className="input"
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="label">Enhetspris eks. mva</span>
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                required
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              />
            </label>
          </div>

          <button className="button" type="submit" disabled={busy}>
            {busy ? "Lagrer…" : "Legg til"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <strong>
            {items.length} {items.length === 1 ? "prisrad" : "prisrader"}
          </strong>
          {items.length > 8 && (
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder="Søk i listen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            {items.length === 0 ? (
              <>
                <div className="empty-title">Listen er tom</div>
                <div>Legg inn prisrader over for å ta den i bruk.</div>
              </>
            ) : (
              <>Ingen rader matcher «{query}».</>
            )}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Navn</th>
                <th>Enhet</th>
                <th className="num">Enhetspris</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 550 }}>
                      {item.name}
                      {item.code && (
                        <span className="picker-code" style={{ marginLeft: 7 }}>
                          {item.code}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div className="tiny muted">{item.description}</div>
                    )}
                  </td>
                  <td className="muted">{item.unit}</td>
                  <td className="num">{formatNok(Number(item.unit_price))}</td>
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
