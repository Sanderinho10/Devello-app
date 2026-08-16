# Referanseliste (skjult for brukeren)

Automatisk logg over bekreftede tilbud. Dette er agentens hukommelse — i
plattformen ser brukeren den aldri, og den redigeres aldri for hånd.

## Når det skrives hit

Hver gang et tilbud bekreftes med «Bekreft og lag kladd» i plattformen (i test:
«bekreft» fra utvikleren i chatten), lagres én oppføring:

```
referanseliste/<lead-id>.json
```

Innholdet er den endelige `tilbudsdata.json` (etter brukerens redigeringer —
det er fasiten, ikke agentens første utkast) pluss metadata:

```jsonc
{
  "tilbudsdata": { … },                    // hele det bekreftede tilbudet
  "meta": {
    "bekreftet_dato": "2026-08-16",
    "jobbtype_stikkord": ["stikkontakt", "takpunkt", "ny kurs", "kjellerstue"],
    "kundetype": "forbruker",
    "redigert_av_bruker": true,            // ble utkastet endret før bekreftelse?
    "utfall": null                         // null | "vunnet" | "tapt" — settes senere
  }
}
```

## Regler

- **Alt lagres, ingenting slettes.** Optimalisering skjer ved henting, ikke ved
  sletting.
- **Henting per nytt lead: de 3–5 mest relevante.** Prioritering: samme
  jobbtype-stikkord > samme tilbudstype > vunnet > nyest. Aldri hele listen inn
  i konteksten.
- Oppføringer der brukeren redigerte mye før bekreftelse er ekstra verdifulle —
  de viser hva agenten bommet på. De er også råmateriale til gullsettet
  (Devellos interne testsett — ikke en del av denne mappen).
- Referansefilene i `kundedata/referansefiler/` er kaldstart; når listen her
  har 15–20 oppføringer, veier den tyngre enn dem.
