# Devello

Tilbudsagent for håndverksbedrifter. Leser innkommende jobbforespørsler fra
Microsoft 365, foreslår tilbudstype, genererer utkast — og lager en **kladd** i
Outlook som mennesket sender selv.

Første kunde: Star Elektro AS.

## Prinsipper som ikke kan forhandles bort

- **Mennesket trykker send selv.** Appen ber aldri om `Mail.Send`. Den lager
  kladder, og et menneske sender dem. Dette er håndhevet i scope-listen, ikke
  bare i koden — se `src/lib/graph/oauth.ts`.
- **Agenten regner aldri.** Alle priser kommer fra strukturerte rader i
  `price_list_items`. Modellen velger post og mengde; summene blir regnet ut i
  `computeTotals()`.
- **Alt blir logget.** Original AI-versjon, hver redigering og den endelige
  versjonen havner i `draft_versions`, uansett om noe ble endret. Det er
  læringsdata.

## Tilbudstypene

| Type | Hva det betyr | Output |
| --- | --- | --- |
| Punktpris | Hver post har én buntet pris som dekker arbeid og materiell. | PDF + kort e-posttekst |
| Fastpris | Materiell og timer hver for seg, summert til én total. Spesifikasjonen viser hva som kommer i tillegg. | PDF + kort e-posttekst |
| Tid og materiell | Løpende regning. Brukt når omfanget er uklart. | Bare tekst, ingen PDF |

Agenten foreslår type ved å matche jobbeskrivelsen mot hvilke typer
referansefiler kunden har lagt inn. Brukeren ser forslaget som en bryter øverst i
utkastet og kan endre det før de bekrefter.

## Kom i gang

Er du ny på prosjektet, start med [docs/utvikleroppsett.md](docs/utvikleroppsett.md)
— den forklarer hvilke tilganger du trenger og hvordan de gis. Under står de
tekniske stegene.

Skal du legge appen ut offentlig (app.devello.no), står hele oppskriften i
[docs/produksjonsoppsett.md](docs/produksjonsoppsett.md) — hosting, domene,
Azure-redirect og sjekklisten før første kunde.

### 1. Avhengigheter

```sh
npm install
```

PDF-genereringen bruker Chromium via `playwright-core`, som ikke følger med
noen nettleser. Hent den:

```sh
npm run install:chromium
```

Bruk dette scriptet framfor `npx playwright install chromium`: det siste henter
siste versjon av `playwright`, som kan peke på en annen Chromium-build enn den
`playwright-core` i prosjektet forventer. Da feiler PDF-en med «Executable
doesn't exist» selv om en nettleser er installert.

Ligger Chromium et annet sted, pek på binærfilen med
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

### 2. Supabase

Prosjektet **Devello database** (`ufzpqztolqxcaumkipfk`) er allerede satt opp med
alle migrasjonene og seed-data for Star Elektro. Skal du bygge et nytt prosjekt
fra bunnen:

```sh
supabase link --project-ref <ref>
supabase db push
```

Eller lim inn migrasjonene i SQL-editoren i rekkefølge, så `seed.sql`.

| Migrasjon | Innhold |
| --- | --- |
| `0001_init.sql` | Tabeller, enums, indekser, triggere |
| `0002_rls.sql` | RLS-policyer og storage-bøtter |
| `0003_dev_auto_join.sql` | **Dev/pilot:** knyttet nye brukere til Star Elektro. Fjernet av `0010`. |
| `0004_hardening.sql` | Oppfølging av security advisor |
| `0005_price_lists.sql` | Prisrader hører til navngitte lister; flere lister per type |
| `0006_one_mailbox_per_company.sql` | Én postkasse per selskap — «koble til på nytt» erstatter i stedet for å duplisere |
| `0007_mailbox_status_readable.sql` | Brukeren kan lese postkassens status, men ikke tokenene (kolonnerettigheter + policy) |
| `0008_manual_leads.sql` | `source`-kolonne: leads kan komme manuelt (telefon), ikke bare på e-post |
| `0009_draft_confidence.sql` | Sikkerhetsnivå per utkast, avledet av referansetilbud og treff i prisfilen |
| `0010_onboarding.sql` | **Fjerner dev auto-join.** Roller, fakturaadresse, prøveperiode, invitasjoner og partnere |
| `0032_ordre.sql` | Ordremodulen: `companies.moduler`, `orders` med løpenummer per selskap, `order_events` |
| `0033_grossistkatalog.sql` | Grossister og varekatalog (EFO/NELFO 4.0), pris per måleenhet, trigramsøk, standardpåslag |
| `0034_timar_og_materiell.sql` | `time_entries` og `material_entries` på ordren, med priser kopiert inn ved føring |
| `0035_regnskapskopling_og_leverandorfakturaer.sql` | Kobling til regnskapssystem (client key skjult for nettleseren), leverandørfakturaer og EHF-linjer, `replaced_by` på materiell |
| `0036_fakturaforslag.sql` | `invoice_drafts` og versjonslogg, `invoice_draft_id` på timer og materiell (låser fakturerte føringer), produktmapping og innstillinger på koplinga |

### 3. Azure

Se [docs/azure-app-registration.md](docs/azure-app-registration.md). Kort: én
multitenant appregistrering, `Mail.Read` + `Mail.ReadWrite`, aldri `Mail.Send`.

### 4. Miljøvariabler

```sh
cp .env.example .env.local
```

Fyll inn Supabase-nøklene, `ANTHROPIC_API_KEY` og Microsoft-verdiene.

> **Windows PowerShell 5.1:** ikke lag filen med `Set-Content -Encoding utf8` —
> den skriver UTF-8 *med* BOM, og de tre bytene gjør at den første variabelen i
> filen ikke blir lest. Symptomet er «Invalid supabaseUrl: Provided URL is malformed»
> selv om URL-en ser rett ut. Bruk `-Encoding ascii`, eller
> `[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))`.

### 5. Kjør

```sh
npm run dev
```

Opprett konto på `/registrer`. Veiviseren tar deg gjennom selskap,
administratorbruker og prøveperiode, og oppretter alt i ett kall til slutt.

Regnskapsførere henter partnerkoden sin på `/partner` — de trenger ingen konto.

Har du konto fra før, logg inn på `/login`.

## Flyten

```
Hent leads          Graph → leads (dedupe på message-id)
  eller
Manuell henvendelse saksbehandleren skriver inn en telefonhenvendelse
   ↓
Generer utkast      klassifiser type → slå opp prisrader → generer dokument + tekst
   ↓                                                        (eller bare tekst)
Rediger             type-bryter, dokumentfelt, e-posttekst
   ↓
Bekreft             PDF → Outlook-kladd med vedlegg → logg endelig versjon
   ↓
Du sender selv
```

## Kart over koden

```
src/
├─ app/
│  ├─ tilbud/                   Agentens faner: leads, prisfil, referansefiler, innstillinger
│  │  └─ leads/[id]/            Utkastredigering — dokument eller tekst etter type
│  ├─ ordre/                    Ordremodulen (bak companies.moduler): ordrer, leverandørfakturaer, grossister, innstillinger
│  │  └─ [id]/                  Ordren som faner: Oversikt, timer/, materiell/, faktura/ — layout.tsx eier header og faner
│  └─ api/
│     ├─ auth/microsoft/        OAuth-flyten mot Entra ID
│     ├─ leads/fetch            «Hent leads»
│     ├─ drafts/generate        Klassifisering + generering
│     ├─ drafts/[id]/           confirm (PDF + Outlook-kladd) og pdf (forhåndsvisning)
│     ├─ orders/                Opprett ordre, PATCH status/felt, [id]/timer, [id]/materiell, [id]/faktura (+godkjenn, overfor)
│     ├─ grossist/sok           Søk i grossistkatalogen
│     ├─ order-settings         Standardpåslag på materiell
│     └─ regnskap/              connection (PUT/PATCH/DELETE), sync, fakturaer/[id]/{kople,loys,ignorer}, produkter
├─ lib/
│  ├─ claude/                   motor.ts (laster agent/), generate.ts
│  ├─ graph/                    oauth.ts, client.ts, drafts.ts
│  ├─ pdf/                      template.ts (Devello-malen), render.ts (HTML→PDF)
│  ├─ drafts/versions.ts        Versjonslogging
│  ├─ ordre/                    beskrivelse.ts (AI-utkast), status.ts, summering.ts, hent.ts, api.ts
│  ├─ grossist/nelfo4.ts        Parser for EFO/NELFO 4.0-varefiler — ren funksjon, ingen database
│  ├─ regnskap/                 poweroffice.ts (API-klient), ehf.ts (parser), matching.ts, sync.ts
│  ├─ faktura/                  Fakturaforslaget: kontekst.ts → generer.ts → resolver.ts (beløpene), go.ts (payload), overfor.ts
│  ├─ moduler.ts                harModul() — hvilke moduler et selskap har
│  └─ types.ts                  Delte typer + computeTotals()
agent/
├─ v2/                          Dagens motor, frosset: ett kall fra lead til prisrader
├─ v3/                          Omfang først, så pris. Sjekklister per fag under bransje/
└─ faktura/                     Fakturaagenten: velger struktur og tekst, aldri beløp
design/                         Mockuper, samme CSS som appen
evaluering/                     Evalueringssuite og gullsett — se evaluering/LES_MEG.md
supabase/migrations/            Skjema og RLS
```

### Motor og tilbakerulling

Tilbudsagenten finnes i to versjoner side om side (`src/lib/claude/motor.ts`).
Hvilken et selskap kjører er en innstilling, ikke en utrulling:

1. `companies.motor_versjon` — selskapets eget valg, satt under Tilbud →
   Innstillinger → Motor.
2. `MOTOR_DEFAULT` i miljøet — standarden for selskaper uten eget valg.
3. Ingen av delene → `v2`.

Hvert utkast lagres med `drafts.motor_versjon`, så `npm run gullsett` måler v2
og v3 hver for seg, og `npm run evaluer -- --motor v3` kjører suiten mot én
bestemt motor med egen baseline. Viser målingen at v3 er dårligere, settes
selskapet (eller standarden) tilbake til v2. v2-koden og v2-filene er ikke
endret av v3, og alle nye kolonner er additive.

v3 gjør tre ting v2 ikke gjør: lister først opp alt arbeid jobben består av
mot jobbtypesjekklistene for faget (`agent/v3/bransje/<fag>/jobbtypar.json`),
stiller inntil tre spørsmål til kunden i e-posten, og sender utkast som er
urimelig små for jobbtypen tilbake til agenten én gang før de vises.

### Onboarding

`/registrer` er en veiviser i tre steg som samler alt opp og sender ett kall til
`/api/onboarding/register`. Selskapet opprettes ikke før på slutten — ellers
ville halve kontoer blitt liggende igjen hver gang noen ombestemte seg.

Organisasjonsnummeret valideres med MOD11 og sjekkes mot allerede registrerte
selskaper allerede på steg 1, så feilen kommer der den hører hjemme. Nummeret
lagres normalisert (bare sifre), og en unik indeks sammenligner på sifrene, slik
at «912 345 678» og «912345678» er samme selskap.

Selskapstilhørighet kommer nå fra invitasjoner. Databasetriggeren
`handle_new_user` slår opp en åpen invitasjon på e-postadressen når en ny bruker
logger inn første gang. Finnes ingen, skjer ingenting — en ukjent bruker skal
ikke havne i et tilfeldig selskap.

> **E-postbekreftelse** er styrt av `AUTH_REQUIRE_EMAIL_CONFIRMATION`. Står den
> `false`, blir nye brukere opprettet ferdig bekreftet og kommer rett inn — det
> er standard, fordi Supabase sin innebygde e-post er så ratebegrenset at kunder
> ellers blir stengt ute. Sett opp egen SMTP etter
> [docs/smtp-oppsett.md](docs/smtp-oppsett.md) og sett den til `true`.

### Grossistkatalog

Materiell på en ordre velges fra grossistens egen varefil, ikke fra fritekst.
Grossistene (Onninen, Ahlsell, Solar …) leverer sortimentet som
**EFO/NELFO Vareformat 4.0**: en semikolonseparert tekstfil i Windows-1252,
med én header (`VH`), én varelinje per vare (`VL`) og tilleggsposter etter
linja. Kundespesifikke pristilbud (`PH`/`PL`) og rabattfiler leser vi også.
`src/lib/grossist/nelfo4.ts` er parseren; `npm run test:nelfo4` prøver den
uten fil og uten database.

Importen kjøres av Devello med et script inntil opplasting og FTP-henting er
på plass:

```sh
npm run grossist:importer -- --selskap <company_id> --grossist "Onninen" \
    --varefil ./V4varefil.zip [--rabattfil ./R4rabatt.txt] [--kundenr 123456]
```

Fila er hele sortimentet: varer som ikke står i den lenger blir inaktive.
Importen er trygg å kjøre om igjen.

**Prisen i appen er per måleenhet.** Grossisten priser kabel per 100 meter
(prisenhet `HMT`); montøren fører meter. Omregningen skjer ved import, og
`list_price`/`qty_per_price_unit` fra fila står igjen på raden for
sporbarhet. Katalogen (`supplier_items`) er noe annet enn kundens egen
prisfil (`price_list_items`): prisfilen er det firmaet selger for,
katalogen det firmaet kjøper for. Tilbudsagenten ser ikke katalogen.

### PowerOffice Go

Grossisten sender fakturaen som EHF rett til kundens regnskapssystem. Devello
er ikke fakturamottak — regnskapet bor i PowerOffice Go. Men fakturaen har
linjer med elnummer, mengde og pris, og en ordrereferanse, og Go gir ut
original-XML-en via API. Så vi **leser**: henter inngående fakturaer, laster
ned EHF-XML-en, leser linjene, finner ordrenummeret montøren skrev på
bestillingen, og legger linjene på ordren som materiell med
`source = 'faktura'`. Kostprisen er fakturaens, påslaget selskapets.

Det vi aldri gjør: skrive til Go. Ingen bokføring, ingen betaling, ingen
salgsfaktura herfra. Bare `GET`.

Oppsettet:

1. Devello har application key og subscription key fra
   developer.poweroffice.net, én per miljø — `POGO_APPLICATION_KEY`,
   `POGO_SUBSCRIPTION_KEY` og `POGO_DEMO_*` i `.env.local`.
   Produksjonstilgang krever at PowerOffice har godkjent Devello.
2. Kunden aktiverer utvidelsen i Go: Meny → Innstillinger → Utvidelser →
   Legg til utvidelse → «Egendefinert utvidelse», limer inn Devello sin
   application key, gir lesetilgang til inngående faktura,
   bilagsdokumentasjon og leverandør, og får en **client key**.
3. Client key limes inn under Ordre → Innstillinger → Regnskapssystem.
   Den lagres i `accounting_connections.client_key`, som ingen nettleser
   kan lese (kolonnerettigheter, samme grep som postkasse-tokenene).

«Hent fakturaer nå» kjører `synkroniserFakturaer(companyId)` i
`src/lib/regnskap/sync.ts`. Den tar et selskap, ikke en sesjon, så en cron
kan kalle den senere. Fakturaer uten gjenkjent ordrenummer havner under
Ordre → Leverandørfakturaer → Ukoblet, der de kobles for hånd eller
ignoreres. Kreditnotaer hentes og vises, men kobles aldri automatisk.

Privilegiene Devello-utvidelsen trenger i Go: inngående faktura,
bilagsdokumentasjon og leverandør (lesing), og for fakturaforslagene
salgsordre, kunde og produkt — **uten** `sendInvoice`. Devello skal ikke
kunne sende en faktura selv om koden prøvde.

### Fakturaforslag

Poenget med ordremodulen: en faktura som er rett første gang, fordi den er
bygd av det som faktisk skjedde. Ordre → Faktura → «Lag fakturaforslag»
kjører fakturaagenten (`agent/faktura/`) én gang over ordren: tilbudet
kunden sa ja til, timene, materiellet — både det manuelle og det som kom
fra grossistfakturaene.

Tre prinsipper, som for tilbudsagenten:

1. **Modellen priser aldri.** Den velger strategi (fastpris, fastpris med
   tillegg, tid og materiell), hvilke kilder som skal faktureres og hvordan
   linjene forklares. Skjemaet den svarer i har ikke ett tallfelt.
   `src/lib/faktura/resolver.ts` slår opp beløpene fra kildene: seksjonens
   sum, tilbudslinjen som den er, timer × sats gruppert per type, materiell
   til salgspris. Peker planen på noe som ikke finnes, ikke er fakturerbart
   eller alt er fakturert, får modellen problemene tilbake én gang — så
   feiler kallet.
2. **Utkast i Go, aldri sendt.** «Overfør til PowerOffice Go» finner kunden
   (e-post, telefon; ellers opprettes den etter bekreftelse), og legger en
   salgsordre med status Draft via `POST /SalesOrders/Complete`.
   `ExternalImportReference` er utkastets id, så et nytt trykk aldri gir en
   ny ordre. Kunden fakturerer og sender fra Go. Hver Normal-linje går på et
   produkt fra mappingen under Innstillinger → Regnskapssystem → Produkter i
   Go (produktet bærer salgskonto og mva-kode); «Opprett standardprodukter»
   lager DEV-ARB/-MAT/-FAST/-ANN.
3. **Alt versjonslogges** i `invoice_draft_versions`: agentens forslag,
   hver redigering med diff, og det som ble overført. Ved overføring låses
   utkastet, timene og materiellet som er med får `invoice_draft_id` og
   kan aldri faktureres to ganger, og ordren blir `fakturert`.

`npm run test:faktura` prøver resolveren, omregningen etter redigering og
Go-payloaden uten database og uten modell.

### Navigasjonsmønsteret

Sidebar er organisert **per agent**, ikke per funksjon. Alt som hører til
tilbudsagenten ligger som faner inni én «Tilbud»-knapp. Nye agenter blir egne
seksjoner i `src/components/Sidebar.tsx` med sine egne faner — ingen nye rader
på toppnivå.

Hvilke seksjoner et selskap ser, styres av `companies.moduler` (`tilbud`,
`ordre`): Tilbud står alltid, Ordre bare når modulen er på, og samme flagg
sjekkes i `/api/orders` og i `ordre/layout.tsx` — se `src/lib/moduler.ts`.

Under agentene ligger **Selskap**: abonnement, medlemmer og firmaopplysninger.
Skillet går på hvem som eier innstillingen. Postkasse, merkevare og tone hører
til tilbudsagenten og blir værende der. Navn, organisasjonsnummer og
fakturaadresse hører til kontoen.

To skjemaer må aldri eie samme felt. `/api/settings` skriver bare tone og
merkevare; navn og organisasjonsnummer går gjennom `/api/company`. Ellers ville
et lagre på agentsiden trukket tilbake en endring gjort under Selskap.

## Utvikling

```sh
npm run typecheck
npm run build
npm run preview:pdf            # eksempel-PDF uten database, havner i tmp/
npm run preview:pdf -- fastpris
npm run test:motor             # motor v3 og tilbakerullingen, uten database
npm run test:nelfo4            # parseren for grossistenes varefiler, uten database
npm run test:ehf               # EHF-parseren og ordrenummer-matchingen, uten database
npm run test:faktura           # fakturaforslaget: resolver, redigering, Go-payload — uten database og modell
npm run test:gullsett          # målingen bak gullsettet, uten database
npm run evaluer                # evalueringssuiten — 15 saker med fasit, se evaluering/LES_MEG.md
npm run evaluer -- --motor v3  # samme, mot én bestemt motor (egen baseline)
npm run gullsett               # agentens utkast mot det firmaet faktisk sendte
```

Evalueringen og gullsettet trenger `EVAL_COMPANY_ID` i `.env.local` — id-en
til selskapet som skal måles. Uten den lister scriptene selskapene og stopper.

## Status mot fasene

- **Fase 0 — fundament:** skjema, RLS, login, appregistrering. Klart.
- **Fase 1 — Star Elektro live:** én postkasse, manuell «hent leads»,
  type-klassifisering, PDF for punktpris/fastpris, tekst for tid og materiell,
  bekreft → Outlook-kladd. Klart i koden; gjenstår å verifisere mot virkelige
  Star Elektro-referanser og faktiske priser.
- **Fase 2 — drift:** automatisk polling og varsling. Ikke startet. Logikken i
  `/api/leads/fetch` er skrevet så den kan kalles fra en cron uten endring.
- **Fase 3 — selvbetjent onboarding og konto:** registrering med organisasjonsnummer-
  sjekk, admin/standard-roller, invitasjoner og partnerkoder for
  regnskapsførere, og en Selskap-seksjon med abonnement, medlemmer og
  firmaopplysninger. Klart.

  Betaling gjenstår: pakkevalget blir lagret, men ingen faktura sendes og
  ingenting trekkes. **Prisene i `src/lib/billing/plans.ts` er plassholdere**
  og må settes før første kunde skal betale.
- **Fase 4:** prising, flere agenter. Ikke startet.

### Kjent begrensning

Uthenting av tekst fra opplastede PDF- og Word-referanser er ikke implementert.
Referansefanen er bevisst enkel — en fil merket med tilbudstype, ikke noe mer —
så inntil uthentingen er på plass er det **filnavnet og typen** agenten matcher
mot, ikke innholdet i filen. Det gjør klassifiseringen svakere jo mindre
beskrivende filnavnene er.
