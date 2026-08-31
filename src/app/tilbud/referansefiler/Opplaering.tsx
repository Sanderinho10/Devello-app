import type { Opplaering } from "@/lib/opplaering/status";

/**
 * Hvor godt lært opp agenten er.
 *
 * Tallet alene er til å bli motløs av — det er linjene under som gjør det til
 * noe man kan handle på. «55 %» sier ingenting; «15 bekreftede tilbud igjen»
 * sier hva man skal gjøre i morgen.
 *
 * Målene er ikke en målstrek. De er der kurven flater ut, og det står med rene
 * ord, ellers ser åtte av åtte referansefiler ut som en fullført oppgave mens
 * tallet fortsatt sier 75.
 */
export function Opplaeringskort({ status }: { status: Opplaering }) {
  return (
    <div className="card card-pad opplaering">
      <div className="row-between opplaering-topp">
        <div>
          <span className="label" style={{ marginBottom: 2 }}>
            Opplæring
          </span>
          <strong>{status.merkelapp}</strong>
        </div>
        <div className="opplaering-tal">{status.prosent}&nbsp;%</div>
      </div>

      <div className="forbruk-bar" style={{ marginTop: 4 }}>
        <div className="forbruk-fyll" style={{ width: `${status.prosent}%` }} />
      </div>

      <div className="opplaering-ledd">
        {status.ledd.map((ledd) => (
          <div key={ledd.navn} className="opplaering-rad">
            <span>{ledd.navn}</span>
            <span className="opplaering-antall">
              {ledd.antall}
              <span className="muted"> / {ledd.maal}</span>
            </span>
            <span className="opplaering-strek">
              <span style={{ width: `${(ledd.oppnaadd / ledd.vekt) * 100}%` }} />
            </span>
          </div>
        ))}
      </div>

      {status.neste.length > 0 && (
        <ul className="opplaering-neste">
          {status.neste.map((steg) => (
            <li key={steg}>{steg}</li>
          ))}
        </ul>
      )}

      <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
        Tallene til høyre er der kurven flater ut, ikke en målstrek — mer
        materiale hjelper alltid litt til. Vi holder tallet med vilje lavt: en
        agent som sier 100&nbsp;% mens utkastene fortsatt må rettes, er en agent
        ingen stoler på.
      </p>
    </div>
  );
}
