"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatNok, type PriceItemKind, type PriceListItem } from "@/lib/types";

const KIND_LABEL: Record<PriceItemKind, string> = {
  punktpris: "Punktpris",
  materiell: "Materiell",
  time: "Timepris",
};

const KIND_HELP: Record<PriceItemKind, string> = {
  punktpris: "Bunta pris — arbeid og materiell samla. Brukt i punktpris-tilbod.",
  materiell: "Materiellpost. Brukt i fastpris-spesifikasjon.",
  time: "Timepris. Brukt i fastpris og i tid og materiell.",
};

const EMPTY = {
  kind: "punktpris" as PriceItemKind,
  code: "",
  name: "",
  description: "",
  unit: "stk",
  unit_price: "",
};

export function PriceList({ items }: { items: PriceListItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/price-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          unit_price: Number(form.unit_price),
          // Punktpris er bunta; dei andre dekker éin ting kvar.
          includes_labour: form.kind !== "materiell",
          includes_material: form.kind !== "time",
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikkje lagre");
      setForm(EMPTY);
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

  const grouped = (["punktpris", "materiell", "time"] as PriceItemKind[]).map(
    (kind) => ({ kind, rows: items.filter((item) => item.kind === kind) }),
  );

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
              <span className="label">Type</span>
              <select
                className="select"
                value={form.kind}
                onChange={(e) =>
                  setForm({ ...form, kind: e.target.value as PriceItemKind })
                }
              >
                {Object.entries(KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="hint">{KIND_HELP[form.kind]}</span>
            </label>

            <label className="field">
              <span className="label">Kode (valfritt)</span>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
          </div>

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
                placeholder="stk / time / m / m²"
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

      {grouped.map(({ kind, rows }) => (
        <div className="card" key={kind}>
          <div className="card-header">
            <div>
              <strong>{KIND_LABEL[kind]}</strong>
              <div className="tiny muted">{KIND_HELP[kind]}</div>
            </div>
            <span className="muted tiny">{rows.length} rader</span>
          </div>

          {rows.length === 0 ? (
            <div className="empty">Ingen rader av denne typen enno.</div>
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
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{item.name}</div>
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
      ))}
    </div>
  );
}
