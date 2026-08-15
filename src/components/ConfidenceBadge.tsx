"use client";

import {
  CONFIDENCE_LABELS,
  QUOTE_TYPE_LABELS,
  type QuoteConfidence,
  type QuoteType,
} from "@/lib/types";

/**
 * Fargeprikk som sier hvor mye utkastet tåler, med begrunnelsen bak en hover.
 *
 * Begrunnelsen sto tidligere åpent over utkastet og tok plassen til det man
 * faktisk skulle lese. Den er verdt å ha, men ikke verdt å se hver gang —
 * fargen holder i det daglige, teksten er der når man lurer.
 *
 * Boblen åpnes også på tastaturfokus, ikke bare hover, så den ikke er
 * utilgjengelig for den som ikke bruker mus.
 */
export function ConfidenceBadge({
  level,
  note,
  classificationNote,
  suggestedType,
}: {
  level: QuoteConfidence;
  /** Signalene bak vurderingen, én per linje. */
  note: string | null;
  /** Modellens egen begrunnelse for typevalget. */
  classificationNote: string | null;
  suggestedType: QuoteType;
}) {
  const reasons = (note ?? "").split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <span className={`confidence ${level}`} tabIndex={0} role="note">
      <span className="confidence-dot" aria-hidden="true" />
      {CONFIDENCE_LABELS[level]}

      <span className="confidence-tip">
        <strong>{CONFIDENCE_LABELS[level]}</strong>

        {reasons.length > 0 && (
          <ul>
            {reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        )}

        {classificationNote && (
          <span className="confidence-tip-note">
            Agenten foreslo <strong>{QUOTE_TYPE_LABELS[suggestedType]}</strong>:{" "}
            {classificationNote}
          </span>
        )}
      </span>
    </span>
  );
}
