# Utvikleroppsett — ny på prosjektet

Denne står ved siden av README. README forklarer hvordan appen kjøres; denne
forklarer hvilke tilganger du trenger for å komme dit, og hvordan de gis.

## Prinsipp: inviter, ikke del nøkler

Hver tjeneste under kan invitere folk. Da henter utvikleren sine egne nøkler fra
dashbordet, og ingen hemmeligheter går gjennom Slack, e-post eller chat.

Det gir tre ting gratis: bruk kan spores per person, tilgang kan trekkes tilbake
uten at alle må bytte nøkkel, og en lekket melding lekker ingenting.

Får du likevel bruk for å sende en hemmelighet: bruk en passordbehandler eller
en engangslenke. Aldri i en samtaletråd — den blir liggende for alltid.

## Tilganger

| Tjeneste | Hvem gir | Hvordan |
| --- | --- | --- |
| GitHub | Repo-eier | `Sanderinho10/Devello-app` → Settings → Collaborators → Add people |
| Supabase | Prosjekteier | Dashboard → Organization → Team → Invite member |
| Anthropic | Konsolleier | [console.anthropic.com](https://console.anthropic.com) → Settings → Members → Invite. Utvikleren lager sin **egen** API-nøkkel |
| Azure / Entra ID | Appregistreringens eier | Bare nødvendig for å jobbe med postkassen. Se under |

### Anthropic: egen nøkkel per utvikler

Å jobbe med promptene betyr mange kall. Med egen nøkkel per person ser dere hvem
som bruker hva, og en nøkkel kan trekkes uten at den andre stopper opp.

Sett et forbruksvarsel i konsollen. Å iterere på en prompt er billig per kall og
merkbart over en dag.

### Azure trengs som regel ikke

Skal du jobbe med **tilbudsgenereringen**, trenger du ikke Microsoft i det hele
tatt. Bruk «Manuell henvendelse» på Leads-siden: skriv inn en jobb slik en kunde
ville beskrevet den, og agenten genererer på den. Hele veien fra henvendelse til
PDF virker uten en eneste e-post.

Azure trengs bare om du skal røre OAuth-flyten eller «Hent leads». Da er
oppskriften i [azure-app-registration.md](azure-app-registration.md), og
`MS_REDIRECT_URI` må peke på din egen localhost.

## Kom i gang lokalt

```sh
git clone https://github.com/Sanderinho10/Devello-app.git
cd Devello-app
npm install
npm run install:chromium
cp .env.example .env.local
```

Fyll `.env.local` med verdiene fra dine egne dashbord:

- `NEXT_PUBLIC_SUPABASE_URL` og `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase →
  Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — samme sted. **Denne omgår all
  tilgangskontroll.** Bare server-side, aldri i en `NEXT_PUBLIC_`-variabel,
  aldri i en commit.
- `ANTHROPIC_API_KEY` — din egen fra Anthropic-konsollen

`.env.local` er i `.gitignore` og skal bli der.

> **Windows PowerShell:** ikke lag filen med `Set-Content -Encoding utf8` — den
> skriver BOM, og den første variabelen blir ikke lest. Symptomet er «Invalid
> supabaseUrl». Bruk `-Encoding ascii`.

```sh
npm run dev
```

## Å jobbe med tilbudsgenereringen

Filene som betyr noe:

| Fil | Hva den styrer |
| --- | --- |
| `agent/CLAUDE.md` + `agent/*.md` | Motoren — systemprompten. Endres her, ikke i koden. Leses ved generering |
| `src/lib/claude/generate.ts` | Output-skjemaet, promptbyggingen og kodevalideringen (summer, prisoppslag, plassholdere) |
| `src/lib/drafts/confidence.ts` | Grønt/gult/rødt: avledet av referansetilbud og treff i prisfilen |
| `src/lib/pdf/template.ts` | Devellos PDF-mal |

To regler som ikke skal forhandles bort:

- **Agenten regner aldri.** Modellen velger post og mengde; prisen slås opp
  server-side og summeres i `computeTotals()`. Ber du modellen om et beløp, har
  du innført en feilkilde som ingen oppdager før en kunde klager.
- **Appen sender aldri.** Den lager kladd i Outlook. `Mail.Send` er ikke i
  scope-listen, og skal ikke legges til.

### Se PDF-en uten database

```sh
npm run preview:pdf            # punktpris
npm run preview:pdf -- fastpris
```

Skriver til `tmp/`. Nyttig når du jobber med selve malen.

### Test uten å bruke penger

Prisfilen og referansefilene styrer hva agenten har å gå på. Vil du se hvordan
den oppfører seg uten referanser, deaktiver dem under Prisfil i stedet for å
slette — da kommer de tilbake med ett klikk.

Merk at et typebytte på et utkast **ikke** koster et nytt modellkall hvis typen
er generert før: den lagrede versjonen hentes fra `draft_versions`.

## Arbeidsflyt

Jobb på egen gren og lag pull request. Ikke push til en gren noen andre står på —
denne appen bygges av flere samtidig, og en tvungen push tar med seg andres
arbeid.

```sh
git checkout -b navn/kort-beskrivelse
```

Før du pusher:

```sh
npm run typecheck
npm run build
```

## Delt database — vær varsom

Alle jobber i dag mot samme Supabase-prosjekt. Det betyr at en migrasjon eller en
sletting slår inn hos alle med én gang.

- Endrer du skjemaet, legg det som en ny fil i `supabase/migrations/` og si fra.
  Ikke rediger en migrasjon som alt er kjørt.
- Sletter du testdata, sjekk at det faktisk er testdata. Postkassetokens og
  prisrader er ekte.

Skal flere jobbe tungt samtidig, er et eget Supabase-prosjekt per utvikler neste
steg. Da er `supabase db push` og `seed.sql` nok til å få et fullt oppsett.
