# Tilbudsagenten: gap mellom agent-spec og plattform — og referanselisten

**Dato:** 16.08.2026 · **Kjelder:** `devello-agent/` (motoren) og `Sanderinho10/Devello-app` @ `882d4e6`

---

## Kort svar

**Nei — plattformen lagrar ikkje bekrefta tilbod slik agenten er spesifisert.**
`confirm/route.ts` loggar endeleg versjon i `draft_versions` (per utkast, som
diff-logg), men det finst ingen referanseliste, ingen nøkkelord/tagging, ingen
søk, og ingenting av det blir mata tilbake inn i neste generering. Agenten
startar altså på null kvar gong, med berre prisfila og filnamna på
referansefilene som kontekst.

Det er no fiksa i pakken som følgjer (migrasjon 0011 + `src/lib/referanser/`),
sjå del 3. Typesjekk er grøn og SQL-en er testa mot Postgres 16 med
tenant-isolasjon.

---

## 1. Kva som er bygd vs. kva agent-spec seier

Plattformen er godt bygd, men **motoren i `devello-agent/` er ikkje det som
køyrer**. Det som køyrer er to separate, hardkoda promptar i `classify.ts` og
`generate.ts` + den gamle `docs/Tilbudsmail_SOP.md` (Star Elektro-SOP-en frå
juni). `CLAUDE.md` og `instruks/` finst ikkje i repoet.

| Agent-spec (`devello-agent/`) | Plattform (`Devello-app`) | Konsekvens |
|---|---|---|
| Éin motor: `CLAUDE.md` + `instruks/*` = systemprompt, likt for alle | To ulike inline-promptar + gamal SOP | Reglane du har finpussa i agenten (antakelsar maks 3, forutsetningar er *kundens*, ikkje motorens, `merknader`, `ikke_funnet`) gjeld ikkje i produksjon |
| Målform frå innstillingar (nynorsk for demo-kunden) | `Skriv på bokmål` hardkoda i prompt + SOP | Nynorsk-kundar får bokmål |
| `merknader[]` — agentens einaste kanal til brukaren | Finst ikkje | Postar som ikkje fanst i prisfila blir **droppa i stilla** (`unresolved_lines` blir talt, men brukaren får ikkje vite *kva* som mangla) |
| `ikke_funnet[]` | Finst ikkje | Same som over |
| `typebegrunnelse` peikar på konkret referanse | `classification_note` — berre filnamn å matche mot | Svak begrunning; `extracted_text` er alltid `null` (PDF-uthenting ikkje implementert) |
| `status: trenger_avklaring` ved ukjent omfang | Finst ikkje | Agenten tvingast til å lage tilbod sjølv når jobben er ukjend |
| Verktøy-loop (`sok_referanser`, `hent_prisliste`, `lever_tilbudsdata`) per `plattform-verktoy.md` | Éin structured-output-kall, heile prisfila i prompten | Fungerer for små prisfiler; skalerer dårleg over ~100 rader |
| Modell: sonnet | `claude-opus-5`, effort `high`, thinking adaptive | Fungerer, men ~5–10× dyrare per lead enn spec |
| Referanseliste bygd opp av bekrefta tilbod, tagga, søkt per lead | **Ikkje bygd** | Agenten lærer ingenting av det firmaet faktisk sender |

**Det som stemmer godt:** kodevalidering av prisar (modellen peikar på `price_item_id`, koden slår opp — akkurat som spec seier «koden er dommaren»), `draft_versions`-loggen (ai → redigering → endeleg med diff), tenant-scoping i alle spørjingar, ingen `Mail.Send`, confidence-vurdering basert på verifiserbare signal.

---

## 2. Korleis få AI-en til å oppføre seg som agenten er sett opp

Tre steg, i prioritert rekkefølgje. Steg A er levert.

### A. Referanselisten (levert — sjå del 3)

Dette er «hukommelsen». Utan den er alt anna berre betre promptar.

### B. Port motoren inn i repoet (neste)

Erstatt dei to inline-promptane + `docs/Tilbudsmail_SOP.md` med agent-filene:

1. Kopier `devello-agent/CLAUDE.md` (utan testmodus-avsnittet) og
   `instruks/velg-tilbudstype.md` + `instruks/lag-tilbudsdata.md` inn i
   `Devello-app/agent/`. Last dei som **systemprompt** (éin gong, cache) i
   staden for `SYSTEM`-konstantane i `classify.ts`/`generate.ts` og
   `loadSop()`.
2. Utvid output-skjemaet i `generate.ts` med felta frå
   `skjema/tilbudsdata-skjema.md` som manglar: `typebegrunnelse`,
   `forutsetninger` (erstattar `assumptions`), `ikke_funnet[]`, `merknader[]`,
   `status` (inkl. `trenger_avklaring`), `estimat_timer`. Lagre `merknader` og
   `ikke_funnet` på `drafts` og **vis dei i UI-et** — det er heile poenget med
   at agenten ikkje kan spørje.
3. Slå saman klassifisering og generering til **eitt kall** (som spec): agenten
   vel type og leverer utkastet i same tur, med `typebegrunnelse` forankra i
   referansen den fann. Behald `tilbudstype_laast` når brukaren har valt.
4. Målform og signatur frå `tone_settings` — legg til `maalform: "nb"|"nn"` i
   `ToneSettings`, fjern «Skriv på bokmål» frå prompten.
5. Behald kodevalideringa (prisoppslag, summar) — den er rett. Legg til
   plassholdar-sjekk (`<fornavn>`, `[adresse]`, `X timer`) i kode, som
   sjekklista i `lag-tilbudsdata.md` krev.

Effekt: agenten i produksjon = agenten du testar i Cowork-mappa. Éin fil å
endre når oppførselen skal justerast, og du kan køyre `leads/innkommende/`
som regresjonstest mot plattformen.

### C. Verktøy-loop (seinare, når prisfiler veks)

`plattform-verktoy.md` er ferdig spesifisert. `sok_referanser` finst no som
SQL-funksjon og kan eksponerast som tool 1 direkte. `hent_prisliste` = filter
på `price_list_items`. Gjer dette når fyrste kunde har >100 prisrader; før det
er ein flat prompt billegare og enklare å feilsøke.

Vurder samstundes å setje `MODEL` til sonnet for generering og bruke ein
billeg modell for tagging (`extractTags` er bygd for det — effort `low`,
1500 tokens).

---

## 3. Referanselisten — det som er levert

### Migrasjon `0011_referanseliste.sql`

Ny tabell **`quote_references`** (= `referanseliste/` i agent-mappa):

| Kolonne | Innhald |
|---|---|
| `company_id`, `draft_id`, `lead_id` | Tenant + sporing tilbake |
| `quote_type`, `title`, `customer_type` | Type, tittel, forbrukar/bedrift |
| **`tags text[]`** | 3–8 nøkkelord: `{elbillader, garasje, enebolig, ny kurs}` |
| `summary` | 1–2 setningar om jobben |
| `lines jsonb` | Kompakte postar (beskrivelse, antall, enhet, enhetspris) |
| `assumptions`, `email_subject`, `email_body`, `subtotal_ex_vat` | Endeleg versjon |
| `edited_by_user` | Vart utkastet endra før bekreft? (ekstra verdifullt) |
| `outcome` | `null` / `vunnet` / `tapt` — setjast seinare |
| `search tsvector` (generert, norsk) + GIN-indeksar på `search` og `tags` | Søk |

Ingen RLS-policy = ingen tilgang frå nettlesar. Berre backend (service role)
les/skriv — brukaren ser aldri lista, som spec seier.

SQL-funksjon **`sok_referanser(company_id, query, type?, limit)`**:
fulltekst (`websearch_to_tsquery`, norsk) + tag-treff-bonus, sortert
tekst-treff → same type → vunnet → nyast. Tomt søk = nyaste. Maks 8.
Tenant-ID er alltid parameter frå backend, aldri frå modellen.

Testa mot Postgres 16: «elbillader garasje» gir elbillader-tilbodet fyrst,
og tilbod frå annan kunde dukkar aldri opp.

### `src/lib/referanser/index.ts`

- `extractTags(text)` — eitt lite Claude-kall (effort low) som gir `tags`,
  `summary`, `customer_type`. Normaliserer til små bokstavar, ubestemt eintal,
  bokmål, maks 8.
- `saveQuoteReference(...)` — kallast frå **confirm** etter at Outlook-kladden
  er oppretta. Taggar ut frå endeleg versjon + leadet. Feiler tagging, lagrast
  raden utan tags — bekreftelsen veltar aldri.
- `findSimilarReferences(...)` — kallast frå **generate** før klassifisering:
  taggar leadet, søkjer, returnerer 3–5 treff.
- `referencesBlock(refs)` — kompakt promptblokk. Aldri heile PDF-ar.

### Koplingar

- `confirm/route.ts`: steg 4 → `saveQuoteReference` (i try/catch).
  `edited_by_user` = `diffSnapshots(previous, final)` ikkje tom.
- `generate/route.ts`: `findSimilarReferences` → `similar` sendast til både
  `classifyQuoteType` og `generateDraft`.
- `classify.ts`: bekrefta tilbod veg tyngre enn opplasta referansefiler.
- `generate.ts`: ny regel i systemprompten — bruk referansane som mønster for
  postar, mengder, forutsetningar og tone; **prisar alltid frå prisfila**.

### Kostnad per lead

+2 små kall (tagg lead ved generering, tagg tilbod ved bekreft), kvar ~1–2 s
og under 1 500 tokens ut. Neglisjerbart mot generering.

### Neste for referanselisten

- **`outcome`**: ein enkel «Vunne / Tapt»-knapp på bekrefta leads i UI-et, som
  set `quote_references.outcome`. Då prioriterer søket vunne tilbod (allereie
  i sorteringa).
- **Kaldstart**: når PDF-uthenting for `reference_quotes` kjem, køyr same
  `extractTags` på `extracted_text` og skriv dei inn i `quote_references` med
  `draft_id = null`. Då er opplasta referansefiler og bekrefta tilbod éin
  søkbar pool frå dag éin.
- **Gullsett**: `where edited_by_user` + `draft_versions.diff` er råstoffet.

---

## 4. Slik tek du det i bruk

```bash
git apply referanseliste.patch          # eller la Claude Code opne PR
supabase db push                        # 0011_referanseliste.sql
npm run typecheck                       # grøn
```

Deretter: bekreft eitt tilbod i appen → sjå raden i `quote_references` med
tags → generer eit nytt lead om same jobbtype → referansen skal ligge i
prompten (logg `referencesBlock` midlertidig om du vil sjå det).
