import type { Opplaering } from "@/lib/opplaering/status";

/**
 * Hvor godt lært opp agenten er.
 *
 * To seksjoner, fordi tallet har to slags kilder: det som er LASTET OPP
 * (grunnlaget, inntil 40 poeng) og det som er MÅLT på de siste tilbudene
 * (utfallet, inntil 60). Skillet vises, ikke bare regnes — den som lurer på
 * hvorfor tallet står stille etter tiende opplasting, skal kunne se svaret:
 * resten av poengene tjenes bare gjennom ekte tilbud.
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

      <div className="opplaering-seksjon">
        <span className="opplaering-tittel">Grunnlag · inntil 40 poeng</span>
        <div className="opplaering-ledd">
          {status.grunnlag.map((ledd) => (
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
      </div>

      <div className="opplaering-seksjon">
        <span className="opplaering-tittel">
          Målt på de siste tilbudene · inntil 60 poeng
        </span>
        {status.maaltPaaUtkast === 0 && status.maaltPaaBekrefta === 0 ? (
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>
            Ikke målt ennå. Denne delen tjenes gjennom ekte tilbud — den kan
            ikke lastes opp.
          </p>
        ) : (
          <div className="opplaering-ledd">
            {status.utfall.map((ledd) => (
              <div key={ledd.navn} className="opplaering-rad">
                <span>{ledd.navn}</span>
                <span className="opplaering-antall">
                  {ledd.av === 0 ? (
                    <span className="muted">venter</span>
                  ) : (
                    <>
                      {ledd.treff}
                      <span className="muted"> av {ledd.av}</span>
                    </>
                  )}
                </span>
                <span className="opplaering-strek">
                  <span style={{ width: `${(ledd.oppnaadd / ledd.vekt) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {status.neste.length > 0 && (
        <ul className="opplaering-neste">
          {status.neste.map((steg) => (
            <li key={steg}>{steg}</li>
          ))}
        </ul>
      )}

      <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
        Prisendringer i utkast teller ikke som retting — prisen er deres
        avgjørelse per jobb, og agenten skal aldri lære av den. Tallet holdes
        med vilje lavt: full pott krever at tilbudene faktisk går ut urørt,
        ikke at mye er lastet opp.
      </p>
    </div>
  );
}
