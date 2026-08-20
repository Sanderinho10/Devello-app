"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { QUOTE_TYPE_LABELS, formatDate, type QuoteType } from "@/lib/types";

export interface LessonRow {
  id: string;
  regel: string;
  begrunnelse: string | null;
  quote_type: QuoteType | null;
  status: "foreslaatt" | "aktiv" | "avvist";
  ganger: number;
  created_at: string;
}

/**
 * Lærdommene agenten har foreslått for seg selv.
 *
 * Retter noen på et utkast før det sendes, ser agenten etterpå på hva som ble
 * endret og spør seg om det sier noe varig om hvordan firmaet vil ha tilbudene
 * sine. Gjør det det, havner forslaget her.
 *
 * Ingenting gjelder før et menneske sier ja. En regel som er lært feil ville
 * påvirket hvert eneste tilbud etterpå — og modellen generaliserer villig fra
 * én hendelse. «Kunden fikk rabatt denne gangen» skal ikke bli «gi alltid
 * rabatt».
 */
export function Lessons({
  lessons,
  isAdmin,
}: {
  lessons: LessonRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function sett(id: string, status: "aktiv" | "avvist" | "foreslaatt") {
    setBusy(id);
    try {
      await fetch("/api/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function slett(id: string) {
    if (!window.confirm("Slett denne lærdommen?")) return;
    setBusy(id);
    try {
      await fetch(`/api/lessons?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const foreslaatt = lessons.filter((l) => l.status === "foreslaatt");
  const aktive = lessons.filter((l) => l.status === "aktiv");

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <strong>Lærdommer</strong>
          <div className="tiny muted">
            Det agenten har lært av rettelsene deres. Gjelder bare dette
            selskapet.
          </div>
        </div>
      </div>

      <div className="card-pad">
        {lessons.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Ingen ennå. Retter dere på et utkast før dere sender, ser agenten
            etterpå om endringen sier noe varig — og foreslår i så fall en regel
            her.
          </p>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {foreslaatt.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 8 }}>
                  Til godkjenning
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {foreslaatt.map((l) => (
                    <Rad
                      key={l.id}
                      lesson={l}
                      busy={busy === l.id}
                      isAdmin={isAdmin}
                      onGodkjenn={() => sett(l.id, "aktiv")}
                      onAvvis={() => sett(l.id, "avvist")}
                    />
                  ))}
                </div>
              </div>
            )}

            {aktive.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 8 }}>
                  Aktive — går inn i hvert tilbud
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {aktive.map((l) => (
                    <Rad
                      key={l.id}
                      lesson={l}
                      busy={busy === l.id}
                      isAdmin={isAdmin}
                      onSlaaAv={() => sett(l.id, "avvist")}
                      onSlett={() => slett(l.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Rad({
  lesson,
  busy,
  isAdmin,
  onGodkjenn,
  onAvvis,
  onSlaaAv,
  onSlett,
}: {
  lesson: LessonRow;
  busy: boolean;
  isAdmin: boolean;
  onGodkjenn?: () => void;
  onAvvis?: () => void;
  onSlaaAv?: () => void;
  onSlett?: () => void;
}) {
  return (
    <div className="file-row" style={{ alignItems: "flex-start", gap: 12 }}>
      <div className="file-row-name" style={{ whiteSpace: "normal" }}>
        <div style={{ fontWeight: 550 }}>{lesson.regel}</div>
        <div className="tiny muted" style={{ marginTop: 2 }}>
          {lesson.quote_type
            ? `Gjelder ${QUOTE_TYPE_LABELS[lesson.quote_type].toLowerCase()}`
            : "Gjelder alle tilbudstyper"}
          {lesson.ganger > 1 && ` · sett ${lesson.ganger} ganger`}
          {" · "}
          {formatDate(lesson.created_at)}
        </div>
        {lesson.begrunnelse && (
          <div className="tiny muted" style={{ marginTop: 4 }}>
            Fra: {lesson.begrunnelse}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {onGodkjenn && (
            <button className="button" disabled={busy} onClick={onGodkjenn}>
              Godkjenn
            </button>
          )}
          {onAvvis && (
            <button className="button ghost" disabled={busy} onClick={onAvvis}>
              Avvis
            </button>
          )}
          {onSlaaAv && (
            <button className="button ghost" disabled={busy} onClick={onSlaaAv}>
              Slå av
            </button>
          )}
          {onSlett && (
            <button className="button danger" disabled={busy} onClick={onSlett}>
              Slett
            </button>
          )}
        </div>
      )}
    </div>
  );
}
