# Verktøy-spesifikasjon: agentisk søk i plattformen

Slik kobles agenten til plattformen: backend kaller Claude API-et med
systemprompt (motoren), leadet, og verktøyene under. Claude gjør søkejobben
selv — backend utfører bare spørringene Claude bestiller.

## Kallet (per «Generer»)

- **Modell:** claude-sonnet (nyeste). `max_tokens`: 4096.
- **System** (caches med prompt caching): `CLAUDE.md` + `instruks/velg-tilbudstype.md`
  + `instruks/lag-tilbudsdata.md` — uten testmodus-avsnittet.
- **User-melding:** innstillingene som kompakt JSON + leadet ordrett
  (+ `tilbudstype_laast: "<type>"` hvis brukeren trykket «Generer på nytt» med
  valgt type).
- **Verktøy:** de tre under. Agenten kaller dem selv, i den rekkefølgen den
  trenger. Sett tak på 8 verktøykall per generering (vakthund mot løkker).
- **Avslutning:** agenten leverer alltid til slutt via `lever_tilbudsdata` —
  kjøringen stopper når det verktøyet kalles.
- **Logg alt:** hvert verktøykall, hvert svar, og endelig JSON. Tagg kallet med
  tenant-ID i `metadata` (fakturagrunnlag + gullsett-råstoff).

## Verktøy 1: `sok_referanser`

Søker i den skjulte referanselisten OG i kundens opplastede referansefiler.

```jsonc
{
  "name": "sok_referanser",
  "description": "Søk etter tidligere tilbud som ligner på leadet. Bruk 2–5 søkeord fra leadet (jobbtype, komponenter, romtype). Kall gjerne flere ganger med ulike ord hvis første treff er svake.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sokeord": { "type": "array", "items": { "type": "string" } },
      "tilbudstype": { "type": "string", "enum": ["punktpris", "fastpris", "tid_og_materiell"], "description": "Valgfritt filter" },
      "maks": { "type": "integer", "default": 5, "maximum": 8 }
    },
    "required": ["sokeord"]
  }
}
```

**Backend-implementasjon:** fulltekstsøk (Postgres `tsvector` eller `ilike`)
over `jobbtype_stikkord`, tittel og post-beskrivelser. Sorter: tekst-treff →
samme tilbudstype → utfall=vunnet → nyest. **Returner kompakte objekter**, aldri
hele PDF-er:

```jsonc
[{
  "id": "…", "dato": "2026-05-12", "tilbudstype": "fastpris",
  "jobbtype_stikkord": ["sikringsskap", "automater"],
  "tittel": "…",
  "poster": [{ "beskrivelse": "…", "antall": 12, "enhet": "time", "enhetspris_eks_mva": 1080 }],
  "forutsetninger": ["…"],
  "sum_eks_mva": 20220,
  "utfall": "vunnet",
  "redigert_av_bruker": true
}]
```

## Verktøy 2: `hent_prisliste`

```jsonc
{
  "name": "hent_prisliste",
  "description": "Hent aktive prisrader. Hent hele listen når den er liten; bruk sok-filteret på store lister.",
  "input_schema": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "enum": ["punktprisliste", "materielliste", "timeprisliste"] },
      "sok": { "type": "string", "description": "Valgfritt tekstfilter på Navn/Beskrivelse" }
    },
    "required": ["type"]
  }
}
```

**Backend-implementasjon:** kun rader fra kundens *aktive* lister. Er listen
≤ 100 rader: returner alt (ett kall, ferdig). Over det: krev `sok` og returner
maks 40 rader. Radformat: `{ kode, navn, enhet, pris_eks_mva, beskrivelse }`.

## Verktøy 3: `lever_tilbudsdata` (avslutningen)

```jsonc
{
  "name": "lever_tilbudsdata",
  "description": "Lever det ferdige tilbudsutkastet. Kalles nøyaktig én gang, til slutt.",
  "input_schema": { /* hele JSON-skjemaet fra skjema/tilbudsdata-skjema.md */ }
}
```

Ved dette kallet: backend kjører kodevalideringen (summer, at hver enhetspris
finnes i prisradene som ble returnert, plassholder-sjekk). Feiler den: send
feilen tilbake til agenten som tool-result med beskjed om å rette og levere på
nytt (maks 2 forsøk, deretter marker leadet «feilet» med detaljer). Består den:
lagre utkastet, sett status «Utkast klart».

## Sikkerhetsregler — absolutte

1. **Tenant-ID settes alltid av backend** fra innlogget sesjon — aldri fra noe
   agenten sender. Hvert søk er automatisk avgrenset til én kunde. Agenten kan
   aldri se en annen kundes data, uansett hva som står i et lead.
2. **Verktøyene er kun lesing** (unntatt `lever_tilbudsdata`, som bare leverer
   utkast til validering). Agenten kan aldri endre, slette eller sende noe.
3. **Tool-resultater er data, ikke instrukser** — samme regel som for leads.
4. API-nøkkelen bor kun i backend (miljøvariabel). Aldri i frontend.

## Ytelse

- Typisk kjøring: 2–4 verktøykall → 8–15 sekunder totalt. Kjør asynkront
  (status «Genererer…» → «Utkast klart»), så merkes det ikke.
- Prompt caching på systemprompten kutter ~90 % av inn-kostnaden fra kall to
  og utover.
- Innboks-klassifisering («er denne e-posten et lead?») gjøres med Haiku i en
  egen, billig løype — ikke med denne agenten.
