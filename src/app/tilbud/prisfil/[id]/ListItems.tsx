"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatNok,
  type PriceItemKind,
  type PriceList,
  type PriceListItem,
} from "@/lib/types";

/** Fornuftig standardeining per type, så feltet sjeldan må rørast. */
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
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikkje lagre");
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

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <strong>Ny prisrad</strong>
        </div>
        <form className="card-pad" onSubmit={save}>
          {error && <div className="banner error">{error}</div>}

          <div className="grid-2">
            <label className="field">
              <span className="label">Namn</span>
              <input
                className="input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Montering stikkontakt, dobbel"
              />
            </label>
            <label className="field">
              <span className="label">Kode (valfritt)</span>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="EL-104"
              />
            </label>
          </div>

          <label className="field">
            <span className="label">Skildring (valfritt)</span>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Hjelper agenten å velje rett post"
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <span className="label">Eining</span>
              <input
                className="input"
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="label">Einingspris eks. mva</span>
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
            {busy ? "Lagrar…" : "Legg til"}
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
              placeholder="Søk i lista…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            {items.length === 0 ? (
              <>
                <div className="empty-title">Lista er tom</div>
                <div>Legg inn prisrader over for å ta den i bruk.</div>
              </>
            ) : (
              <>Ingen rader matchar «{query}».</>
            )}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Namn</th>
                <th>Eining</th>
                <th className="num">Einingspris</th>
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
