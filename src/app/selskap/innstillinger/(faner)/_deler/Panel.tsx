/**
 * Byggeklossene i innstillingene, som skjemaene i Go: et panel med tittel,
 * rader med etiketten til venstre og feltet til høyre, og en lagrelinje
 * nederst som sier om noe er endret.
 */

export function Panel({
  tittel,
  hint,
  hoyre,
  children,
  flat = false,
  bunn,
}: {
  tittel: string;
  hint?: React.ReactNode;
  /** Status eller knapp oppe til høyre. */
  hoyre?: React.ReactNode;
  children: React.ReactNode;
  /** Uten indre luft — for tabeller som går kant i kant. */
  flat?: boolean;
  /** Nederst i panelet, kant i kant: lagrelinja. */
  bunn?: React.ReactNode;
}) {
  return (
    <section className="card allow-overflow inst-panel">
      <div className="inst-panel-topp">
        <div>
          <strong>{tittel}</strong>
          {hint && <div className="tiny muted">{hint}</div>}
        </div>
        {hoyre && <div className="inst-panel-hoyre">{hoyre}</div>}
      </div>
      <div className={flat ? "inst-panel-flat" : "inst-panel-innhold"}>{children}</div>
      {bunn}
    </section>
  );
}

/** Én rad: etiketten til venstre, feltet til høyre, hjelpetekst under feltet. */
export function Rad({
  etikett,
  hint,
  children,
  topp = false,
  smal = false,
  som = "label",
}: {
  etikett: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  /** Etiketten øverst — for tekstfelt og opplasting. */
  topp?: boolean;
  /** Smalt felt: tall, datoer, korte koder. */
  smal?: boolean;
  /** «div» når raden har flere klikkbare ting enn ett felt. */
  som?: "label" | "div";
}) {
  const Tag = som;
  return (
    <Tag className={`inst-rad${topp ? " topp" : ""}`}>
      <span className="inst-rad-etikett">{etikett}</span>
      <span className="inst-rad-felt">
        {smal ? <span className="inst-smal">{children}</span> : children}
        {hint && <span className="hint">{hint}</span>}
      </span>
    </Tag>
  );
}

/** Skillelinje med overskrift mellom grupper av rader i samme panel. */
export function Skille({ children }: { children: React.ReactNode }) {
  return <div className="inst-skille">{children}</div>;
}

/**
 * Lagrelinja nederst i et skjema: status til venstre, Angre og Lagre til
 * høyre. Lagre er av til noe er endret.
 */
export function Lagrelinje({
  endret,
  busy,
  lagret,
  onAngre,
  kanEndre = true,
  ikkeAdmin = "Bare administratorer kan endre dette.",
  etikett = "Lagre",
  flytende = false,
}: {
  endret: boolean;
  busy: boolean;
  lagret: boolean;
  onAngre?: () => void;
  kanEndre?: boolean;
  ikkeAdmin?: string;
  etikett?: string;
  /** Under flere paneler: står fast nederst i vinduet. */
  flytende?: boolean;
}) {
  // Flytende linje står fast nederst bare mens noe er ulagret; ellers ligger
  // den på plass under skjemaet og dekker ikke innholdet.
  const klasse = `inst-lagre${flytende ? ` flytende${endret ? " fast" : ""}` : ""}`;
  if (!kanEndre) {
    return (
      <div className={klasse}>
        <span className="tiny muted">{ikkeAdmin}</span>
      </div>
    );
  }
  return (
    <div className={klasse}>
      <span className={`tiny ${endret ? "inst-endret" : "muted"}`}>
        {busy ? "Lagrer…" : endret ? "Ulagrede endringer" : lagret ? "Lagret" : ""}
      </span>
      <span className="spacer" />
      {onAngre && endret && (
        <button type="button" className="button secondary" onClick={onAngre} disabled={busy}>
          Angre
        </button>
      )}
      <button type="submit" className="button" disabled={busy || !endret}>
        {busy ? "Lagrer…" : etikett}
      </button>
    </div>
  );
}
