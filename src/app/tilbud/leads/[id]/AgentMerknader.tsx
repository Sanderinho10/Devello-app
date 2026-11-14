"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";

/**
 * Agentens beskjeder. Den kan ikke spørre — dette er kanalen dens.
 *
 * Krympet til en trekant med antall, så tre–fire linjer oransje tekst ikke
 * skyver tilbudet nedover hver gang det åpnes. Beskjedene kommer opp i en
 * popup: de er flere linjer lange og skal leses, ikke dytte på siden.
 */
export function AgentMerknader({ merknader }: { merknader: string[] }) {
  const [aapen, setAapen] = useState(false);
  if (merknader.length === 0) return null;

  const tittel =
    merknader.length === 1 ? "1 beskjed fra agenten" : `${merknader.length} beskjeder fra agenten`;

  return (
    <>
      <button
        type="button"
        className="varsel-krympet warning med-tal"
        onClick={() => setAapen(true)}
        title={tittel}
        aria-label={`${tittel} — vis`}
      >
        ⚠<span>{merknader.length}</span>
      </button>
      <Modal open={aapen} onClose={() => setAapen(false)} title="Fra agenten" size="wide">
        <ul className="agent-merknader">
          {merknader.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
