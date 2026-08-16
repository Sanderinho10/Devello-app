# Devello Tilbudsagent v2 — START HER

Dette er «reboot»-agenten (august 2026): én standardisert motor som speiler
Devello-plattformen slik den ser ut i dag. Den gamle Cowork-agenten (v1) ligger
urørt i mappen over — de to blandes ikke.

**Viktig premiss:** agenten er en backend-motor, ikke en chatbot. Kunden bruker
bare plattformen: utkastene vises som redigerbare felt der, endringer gjøres i
UI-et, og «Generer på nytt» / «Bekreft og lag kladd» er de eneste knappene som
rører agenten eller resultatet. Chat finnes kun som (1) inntak for
telefonnotater i plattformen og (2) testverktøy for utviklere i denne mappen.

## Kart: mappe ↔ plattform

| Her | I plattformen |
|---|---|
| `leads/` | Leads-siden (arbeidsflaten) |
| `kundedata/prisfil/` | Prisfil-siden (punktprisliste, materielliste, timeprisliste) |
| `kundedata/referansefiler/` | Referansefiler-siden (~20 tidligere tilbud, merket med type) |
| `kundedata/innstillinger.md` | Innstillinger-siden (firma, merkevare, tone, tilleggsinstruks) |
| `referanseliste/` | Den skjulte referanselisten (auto-oppdatert, brukeren ser den aldri) |
| `CLAUDE.md` + `instruks/` | Selve agenten — systemprompten, lik for alle kunder |
| `skjema/` | Tilbudsdata-formatet = feltene i redigerings-UI-et |

## Slik tester du (utvikler, i en Cowork-chat med denne mappen)

Du spiller plattformens rolle:

1. Skriv: **«Les devello-agent/CLAUDE.md og behandle lead-01»** (eller lim inn
   et helt nytt lead / telefonnotat).
2. Agenten leverer `tilbudsdata.json` (lagres i `leads/<lead-id>/`) og viser en
   lesbar oppsummering av det plattformen ville rendret.
3. **«Generer på nytt som fastpris»** simulerer Generer på nytt med låst type.
4. **«Bekreft»** simulerer «Bekreft og lag kladd»: status settes til bekreftet
   og referanselisten får en ny oppføring.

Manuell redigering av enkeltfelt tester du ikke i chat — det er plattformens
jobb og involverer ikke agenten.

Tre testleads følger med — ett per tilbudstype. Fasit står i `leads/LES_MEG.md`.

## Slik portes dette til plattformen

- **Systemprompt** = `CLAUDE.md` + `instruks/velg-tilbudstype.md` +
  `instruks/lag-tilbudsdata.md` (settes én gang, caches). Testmodus-avsnittet
  i `CLAUDE.md` utelates i produksjon.
- **Kontekst per kall** = innstillinger + aktive prisrader + 3–5 referanser
  (fra referansefiler + referanseliste) + leadet. Kompakt JSON, aldri PDF-er.
- **Output** = ett `tilbudsdata.json`-objekt etter `skjema/tilbudsdata-skjema.md`
  — bruk API-ets strukturerte output/tool-call så formatet er garantert.
- **Valideringen** i `instruks/lag-tilbudsdata.md` implementeres også i kode i
  backend (summer, prisoppslag, plassholdere) — koden er dommeren, agenten
  førstelinjen.
- «Generer på nytt» med annen type = samme kall med `tilbudstype` låst.
- «Bekreft og lag kladd» = backend lagrer brukerens endelige versjon, skriver
  referanseliste-oppføring, rendrer PDF, oppretter Outlook-kladd med PDF
  vedlagt. Agenten er ikke involvert.
- `merknader`-feltet i JSON-en er agentens eneste kanal til brukeren — vis det
  i UI-et (f.eks. som varsel på leadet).
- **Logg per lead:** lead inn, agentens utkast, brukerens endelige versjon.
  Diffen er kvalitetsmåleren deres og råmaterialet til gullsettet.

## Hva demo-dataene er

`kundedata/` inneholder den fiktive Førde-demoen fra plattformen (Star Elektro
AS, Storgata 14, org.nr 912345678, nynorsk). I produksjon erstattes alt av det
kunden legger inn via plattformen. Ekte priser skal aldri inn her.
