# Devello

Tilbudsagent for handverksbedrifter. Les innkommande jobbførespurnader frå
Microsoft 365, foreslår tilbudstype, genererer utkast — og lagar ein **kladd** i
Outlook som mennesket sender sjølv.

Fyrste kunde: Star Elektro AS.

## Prinsipp som ikkje kan forhandlast bort

- **Mennesket trykker send sjølv.** Appen ber aldri om `Mail.Send`. Den lagar
  kladdar, og eit menneske sender dei. Dette er handheva i scope-lista, ikkje
  berre i koden — sjå `src/lib/graph/oauth.ts`.
- **Agenten reknar aldri.** Alle prisar kjem frå strukturerte rader i
  `price_list_items`. Modellen vel post og mengde; summane blir rekna i
  `computeTotals()`.
- **Alt blir logga.** Original AI-versjon, kvar redigering og den endelege
  versjonen hamnar i `draft_versions`, uansett om noko blei endra. Det er
  læringsdata.

## Tilbudstypane

| Type | Kva det betyr | Output |
| --- | --- | --- |
| Punktpris | Kvar post har éin bunta pris som dekker arbeid og materiell. | PDF + kort e-posttekst |
| Fastpris | Materiell og timar kvar for seg, summert til éin total. Spesifikasjonen viser kva som kjem i tillegg. | PDF + kort e-posttekst |
| Tid og materiell | Løpande regning. Brukt når omfanget er uklart. | Berre tekst, ingen PDF |

Agenten foreslår type ved å matche jobbskildringa mot kva typar referansefiler
kunden har lagt inn. Brukaren ser forslaget som ein brytar øvst i utkastet og kan
endre det før dei bekreftar.

## Kom i gang

### 1. Avhengigheiter

```sh
npm install
```

PDF-genereringa brukar Chromium via `playwright-core`. Har du ikkje ein
installasjon frå før:

```sh
npx playwright install chromium
```

Ligg Chromium ein annan stad, peik på binærfila med
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

### 2. Supabase

Prosjektet **Devello database** (`ufzpqztolqxcaumkipfk`) er alt sett opp med alle
fire migrasjonane og seed-data for Star Elektro. Skal du byggje eit nytt
prosjekt frå botnen:

```sh
supabase link --project-ref <ref>
supabase db push
```

Eller lim inn migrasjonane i SQL-editoren i rekkjefølgje, så `seed.sql`.

| Migrasjon | Innhald |
| --- | --- |
| `0001_init.sql` | Tabellar, enums, indeksar, triggerar |
| `0002_rls.sql` | RLS-policyar og storage-bøtter |
| `0003_dev_auto_join.sql` | **Dev/pilot:** knyter nye brukarar til Star Elektro automatisk. Må fjernast i fase 3. |
| `0004_hardening.sql` | Oppfølging av security advisor |
| `0005_price_lists.sql` | Prisrader høyrer til namngjevne lister; fleire lister per type |

### 3. Azure

Sjå [docs/azure-app-registration.md](docs/azure-app-registration.md). Kort: éi
multitenant appregistrering, `Mail.Read` + `Mail.ReadWrite`, aldri `Mail.Send`.

### 4. Miljøvariablar

```sh
cp .env.example .env.local
```

Fyll inn Supabase-nøklane, `ANTHROPIC_API_KEY` og Microsoft-verdiane.

> **Windows PowerShell 5.1:** ikkje lag fila med `Set-Content -Encoding utf8` —
> den skriv UTF-8 *med* BOM, og dei tre byta gjer at den fyrste variabelen i fila
> ikkje blir lest. Symptomet er «Invalid supabaseUrl: Provided URL is malformed»
> sjølv om URL-en ser rett ut. Bruk `-Encoding ascii`, eller
> `[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))`.

### 5. Køyr

```sh
npm run dev
```

Logg inn på `/login` (e-postlenkje via Supabase Auth). Så lenge
`0003_dev_auto_join.sql` er køyrd, blir brukaren knytt til Star Elektro
automatisk ved fyrste innlogging.

## Flyten

```
Hent leads          Graph → leads (dedupe på message-id)
   ↓
Generer utkast      klassifiser type → slå opp prisrader → generer dokument + tekst
   ↓                                                        (eller berre tekst)
Rediger             type-bryter, dokumentfelt, e-posttekst
   ↓
Bekreft             PDF → Outlook-kladd med vedlegg → logg endeleg versjon
   ↓
Du sender sjølv
```

## Kart over koden

```
src/
├─ app/
│  ├─ tilbud/                   Agentens faner: leads, prisfil, referansefiler, innstillingar
│  │  └─ leads/[id]/            Utkastredigering — dokument eller tekst etter type
│  └─ api/
│     ├─ auth/microsoft/        OAuth-flyten mot Entra ID
│     ├─ leads/fetch            «Hent leads»
│     ├─ drafts/generate        Klassifisering + generering
│     └─ drafts/[id]/           confirm (PDF + Outlook-kladd) og pdf (forhandsvisning)
├─ lib/
│  ├─ claude/                   classify.ts, generate.ts, sop.ts
│  ├─ graph/                    oauth.ts, client.ts, drafts.ts
│  ├─ pdf/                      template.ts (Devello-malen), render.ts (HTML→PDF)
│  ├─ drafts/versions.ts        Versjonslogging
│  └─ types.ts                  Delte typar + computeTotals()
docs/Tilbudsmail_SOP.md         Kva som faktisk skal stå i e-posten
design/                         Mockupar, same CSS som appen
supabase/migrations/            Skjema og RLS
```

### Navigasjonsmønsteret

Sidebar er organisert **per agent**, ikkje per funksjon. Alt som høyrer til
tilbudsagenten ligg som faner inni éin «Tilbud»-knapp. Nye agentar blir eigne
oppføringar i `AGENTS`-lista i `src/components/Sidebar.tsx` med sine eigne faner
— ingen nye radar på toppnivå.

## Utvikling

```sh
npm run typecheck
npm run build
npm run preview:pdf            # eksempel-PDF utan database, hamnar i tmp/
npm run preview:pdf -- fastpris
```

## Status mot fasane

- **Fase 0 — fundament:** skjema, RLS, login, appregistrering. Klart.
- **Fase 1 — Star Elektro live:** éin postkasse, manuell «hent leads»,
  type-klassifisering, PDF for punktpris/fastpris, tekst for tid og materiell,
  bekreft → Outlook-kladd. Klart i koden; står att å verifisere mot verkelege
  Star Elektro-referansar og faktiske prisar.
- **Fase 2 — drift:** automatisk polling og varsling. Ikkje starta. Logikken i
  `/api/leads/fetch` er skriven så den kan kallast frå ein cron utan endring.
- **Fase 3–4:** sjølvbetent onboarding, prising, fleire agentar. Ikkje starta.

### Kjent avgrensing

Uthenting av tekst frå opplasta PDF- og Word-referansar er ikkje implementert —
berre reine tekstfiler blir lesne. Fram til då er det feltet «Kva slags jobb
gjaldt tilbodet?» som ber klassifiseringa, og det er obligatorisk ved opplasting.
