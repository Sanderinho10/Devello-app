# Skjema: tilbudsdata.json

Ett objekt per lead — agentens eneste leveranse. Feltene speiler
redigeringssiden i plattformen 1:1; plattformen rendrer dem som redigerbare
felt. Se `skjema/eksempel-punktpris.json` for et komplett utfylt eksempel.

```jsonc
{
  "lead_id": "lead-01-marit-aasen",        // filnavn/ID for leadet
  "status": "utkast",                       // "utkast" | "bekreftet" | "trenger_avklaring"
  "tilbudstype": "punktpris",               // "punktpris" | "fastpris" | "tid_og_materiell"
  "typebegrunnelse": "…",                   // 1–3 setninger, vises i typeboksen øverst

  "tittel": "…",                            // TITTEL-feltet
  "kunde": "…",                             // KUNDE-feltet (navn)
  "adresse": "…",                           // ADRESSE-feltet ("" hvis ukjent)
  "innledning": "…",                        // INNLEDNING-feltet

  "poster": [                               // POSTER-tabellen
    {
      "kilde": "punktprisliste",            // "punktprisliste" | "materielliste" | "timeprisliste"
      "kode": "P010",                       // prislistens kode, null hvis lista mangler koder
      "beskrivelse": "…",                   // kan tilpasses jobben — prisen kan ikke
      "antall": 8,                          // null ved tid og materiell (satser)
      "enhet": "stk",
      "enhetspris_eks_mva": 890,            // ALLTID ordrett fra prislisten
      "sum_eks_mva": 7120                   // antall × enhetspris; null ved tid og materiell
    }
  ],

  "sum_eks_mva": 16040,                     // null ved tid og materiell
  "mva_prosent": 25,                        // fra innstillinger
  "mva_belop": 4010,                        // null ved tid og materiell
  "total_inkl_mva": 20050,                  // null ved tid og materiell

  "estimat_timer": null,                    // kun tid og materiell: {"fra": 2, "til": 4} eller null

  "forutsetninger": [                       // FORUTSETNINGER — én linje per element
    "…"
  ],

  "epost": {
    "emne": "…",                            // EMNE-feltet
    "tekst": "…"                            // E-POSTTEKST-feltet, inkl. signatur fra innstillinger
  },

  "ikke_funnet": [],                        // poster som manglet i prisfilen
  "merknader": []                           // korte beskjeder til brukeren i plattformen
}
```

## Regler

- Tall er tall (ikke strenger), i hele kroner eks. mva der prislisten er i hele
  kroner. Ingen tusenskilletegn i JSON.
- `poster[].enhetspris_eks_mva` skal alltid kunne slås opp ordrett i en aktiv
  prisliste. Poster brukeren selv legger til eller endrer i plattform-UI-et er
  brukerens ansvar — agenten leverer aldri en pris utenfor prislistene.
- Ved `tilbudstype: "tid_og_materiell"`: `antall`, `sum_eks_mva`, `mva_belop`
  og `total_inkl_mva` er `null`; postene er satser.
- `status: "trenger_avklaring"` brukes når omfanget er ukjent — da fylles bare
  `lead_id`, `status`, `epost` (med det ene avklaringsspørsmålet) og evt.
  `merknader` ut. Plattformen viser det som avklaringskladd, ikke tilbud.
- `status: "bekreftet"` settes av plattformen ved «Bekreft og lag kladd» —
  aldri av agenten på eget initiativ.
