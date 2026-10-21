"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lagrelinje, Panel, Rad } from "./Panel";

/**
 * «Hent leads fra og med» — bare synlig fram til første henting.
 *
 * Standarden er dagen postkassen ble koblet til. De aller fleste vil se på det
 * som kommer inn nå, og en innboks som plutselig fylles med et halvt år gammel
 * post er verre enn en tom liste. Vil de likevel bakover, er det ett felt.
 */
export function FirstFetchFrom({ value }: { value: string }) {
  const router = useRouter();
  const [dato, setDato] = useState(value);
  const [busy, setBusy] = useState(false);
  const [lagret, setLagret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iDag = new Date().toISOString().slice(0, 10);

  async function lagre(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setLagret(false);
    try {
      const res = await fetch("/api/mailbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_fetch_from: dato }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={lagre}>
      <Panel
        tittel="Første henting"
        hint="Gjelder bare den aller første hentingen. Etterpå hentes det som har kommet inn siden sist."
        bunn={<Lagrelinje endret={dato !== value} busy={busy} lagret={lagret} onAngre={() => setDato(value)} />}
      >
        {error && <div className="banner error">{error}</div>}
        <Rad
          etikett="Hent leads fra og med"
          smal
          hint="Velger du langt tilbake, kan det ta noen klikk på «Hent» før hele køen er inne."
        >
          <input
            className="input"
            type="date"
            max={iDag}
            value={dato}
            onChange={(e) => {
              setDato(e.target.value);
              setLagret(false);
            }}
          />
        </Rad>
      </Panel>
    </form>
  );
}
