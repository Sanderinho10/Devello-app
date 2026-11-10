"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExcelDrop } from "@/components/ExcelDrop";
import { KlikkbarRad } from "@/components/KlikkbarRad";
import { Modal } from "@/components/Modal";
import type { PriceListWithCount } from "./page";
import { PRICE_KIND_HELP, PRICE_KIND_LABELS, formatDate, type PriceItemKind } from "@/lib/types";

const KINDS: PriceItemKind[] = ["punktpris", "materiell", "time"];

/**
 * Prislistene som én tabell, gruppert etter type, som i Go. Agenten henter
 * fra de aktive listene av typen tilbudet krever; en type uten aktiv liste
 * får en advarsel i sin gruppe. «Ny prisliste» åpner én popup der typen
 * velges, med Excel-import valgfritt.
 */
export function PriceLists({ lister }: { lister: PriceListWithCount[] }) {
  const router = useRouter();
  const [ny, setNy] = useState<PriceItemKind | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleActive(list: PriceListWithCount) {
    setBusy(list.id);
    await fetch("/api/price-lists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: list.id, active: !list.active }),
    });
    setBusy(null);
    router.refresh();
  }

  async function remove(list: PriceListWithCount) {
    const message =
      list.item_count > 0 ? `Slett «${list.name}» og de ${list.item_count} prisradene i listen?` : `Slett «${list.name}»?`;
    if (!window.confirm(message)) return;
    setBusy(list.id);
    await fetch(`/api/price-lists?id=${list.id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  return (
    <>
      <div className="verktoylinje" style={{ marginTop: 0 }}>
        <button type="button" className="button" onClick={() => setNy("punktpris")}>
          Ny prisliste
        </button>
        <span className="verktoylinje-hoyre tiny muted">
          {lister.filter((l) => l.active).length} aktive av {lister.length}
        </span>
      </div>

      <div className="card allow-overflow">
        <table className="table klikkbar tabell-mobil">
          <thead>
            <tr>
              <th>Liste</th>
              <th className="num">Rader</th>
              <th>Status</th>
              <th>Opprettet</th>
              <th aria-label="Handlinger" />
            </tr>
          </thead>
          {KINDS.map((kind) => {
            const rader = lister.filter((l) => l.kind === kind);
            const harAktiv = rader.some((l) => l.active);
            return (
              <tbody key={kind}>
                <tr className="gruppe-rad">
                  <td colSpan={4} title={PRICE_KIND_HELP[kind]}>
                    {PRICE_KIND_LABELS[kind]}
                  </td>
                  <td className="handling">
                    <button type="button" className="button ghost" onClick={() => setNy(kind)}>
                      + Ny
                    </button>
                  </td>
                </tr>
                {!harAktiv && (
                  <tr>
                    <td colSpan={5} className="tiny" style={{ color: "var(--warning, #b25000)" }}>
                      {rader.length === 0 ? "Ingen liste." : "Ingen aktiv liste."} Agenten kan ikke lage tilbud som trenger{" "}
                      {PRICE_KIND_LABELS[kind].toLowerCase()}.
                    </td>
                  </tr>
                )}
                {rader.map((list) => (
                  <KlikkbarRad key={list.id} href={`/selskap/innstillinger/prisfil/${list.id}`}>
                    <td className="hoved">
                      <strong>{list.name}</strong>
                      {list.description && <div className="tiny muted">{list.description}</div>}
                    </td>
                    <td className="num meta">{list.item_count.toLocaleString("nb-NO")}</td>
                    <td className="meta">
                      <span className={`pill ${list.active ? "ferdig" : ""}`}>{list.active ? "Aktiv" : "Inaktiv"}</span>
                    </td>
                    <td className="meta tiny muted">{formatDate(list.created_at)}</td>
                    <td className="handling">
                      <span className="celle-knapper">
                        <button type="button" className="button ghost" onClick={() => toggleActive(list)} disabled={busy !== null}>
                          {list.active ? "Deaktiver" : "Aktiver"}
                        </button>
                        <button type="button" className="button ghost" onClick={() => remove(list)} disabled={busy !== null}>
                          Slett
                        </button>
                      </span>
                    </td>
                  </KlikkbarRad>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      <NyListe type={ny} onClose={() => setNy(null)} />
    </>
  );
}

function NyListe({ type, onClose }: { type: PriceItemKind | null; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<PriceItemKind>("punktpris");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [forrige, setForrige] = useState<PriceItemKind | null>(null);

  // Ny popup: typen den ble åpnet fra, og tomme felt.
  if (type !== forrige) {
    setForrige(type);
    if (type) {
      setKind(type);
      setName("");
      setDescription("");
      setFile(null);
      setError(null);
      setDetails([]);
    }
  }

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
      onClose();
      router.refresh();
      if (payload.imported > 0) router.push(`/selskap/innstillinger/prisfil/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={type !== null} onClose={() => !busy && onClose()} title="Ny prisliste">
      <form onSubmit={create}>
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
            <span className="kontakt-rad-etikett">Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as PriceItemKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {PRICE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="kontakt-rad">
            <span />
            <span className="hint" style={{ marginTop: -4 }}>
              {PRICE_KIND_HELP[kind]}
            </span>
          </div>
          <label className="kontakt-rad">
            <span className="kontakt-rad-etikett">Navn</span>
            <input
              className="input"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${PRICE_KIND_LABELS[kind]} ${new Date().getFullYear()}`}
            />
          </label>
          <label className="kontakt-rad">
            <span className="kontakt-rad-etikett">Beskrivelse</span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valgfritt — f.eks. «Næringskunder»"
            />
          </label>
          <div className="kontakt-rad topp">
            <span className="kontakt-rad-etikett">Fra Excel</span>
            <ExcelDrop file={file} onFile={setFile} templateHref={`/api/price-lists/template?kind=${kind}`} />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button className="button" type="submit" disabled={busy || !name.trim()}>
            {busy ? (file ? "Leser inn filen…" : "Oppretter…") : file ? "Opprett og importer" : "Opprett tom liste"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
