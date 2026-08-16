# Produksjonsoppsett — app.devello.no

Målet: plattformen kjører offentlig på `https://app.devello.no`, og
«Logg inn»-knappen på devello.no peker på `https://app.devello.no/login`.

Appen lager PDF-er med en ekte Chromium (playwright-core). Det krever en host
som kjører et vanlig Docker-bilde — ikke serverless. Anbefalingen er
**Railway**: koblet til GitHub, bygger `Dockerfile` automatisk, deployer på
hver push, og eget domene er to klikk. (Render.com fungerer helt likt om du
heller vil dit.)

Regn med ca. 5–10 USD/mnd for én app i denne størrelsen.

## Steg 1 — Railway-konto og prosjekt

1. Gå til [railway.com](https://railway.com) → **Login** → logg inn med
   GitHub-kontoen som eier `Sanderinho10/Devello-app`.
2. **New Project** → **Deploy from GitHub repo** → velg `Devello-app`.
   (Første gang: godkjenn at Railway får tilgang til repoet.)
3. Railway finner `Dockerfile` selv og begynner å bygge. Første bygg tar
   noen minutter (Chromium lastes ned). **Bygget vil feile på at appen
   mangler miljøvariabler — det er ventet. Neste steg fikser det.**
4. Under **Settings → Source** velger du hvilken gren som deployes. Sett den
   til grenen dere faktisk jobber mot (i dag
   `claude/tilbudsagent-produktbyggspec-v2-xj6tvj`, senere `main` når dere
   merger). Hver push til den grenen gir automatisk ny deploy.

## Steg 2 — miljøvariabler

I Railway: klikk på tjenesten → **Variables** → **Raw Editor**, og lim inn
alle på én gang. Verdiene er de samme som i `.env.local`, med disse
unntakene (markert ⚠️):

| Variabel | Verdi i produksjon |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | som lokalt |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | som lokalt |
| `SUPABASE_SERVICE_ROLE_KEY` | som lokalt |
| `ANTHROPIC_API_KEY` | som lokalt (vurder egen prod-nøkkel med forbruksvarsel) |
| `MS_CLIENT_ID` | som lokalt |
| `MS_CLIENT_SECRET` | som lokalt |
| `MS_TENANT` | `organizations` |
| ⚠️ `MS_REDIRECT_URI` | `https://app.devello.no/api/auth/microsoft/callback` |
| ⚠️ `NEXT_PUBLIC_APP_URL` | `https://app.devello.no` |
| ⚠️ `AUTH_REQUIRE_EMAIL_CONFIRMATION` | `true` — men bare NÅR SMTP er satt opp (se steg 6) |

Etter lagring: **Deploy** på nytt (Railway spør som regel selv).

## Steg 3 — domenet

1. I Railway: tjenesten → **Settings → Networking** → **Custom Domain** →
   skriv `app.devello.no`. Railway viser da en CNAME-verdi, typisk noe som
   `xxxx.up.railway.app`.
2. Hos domeneleverandøren din for devello.no (Domeneshop e.l.): legg til en
   DNS-post:
   - **Type:** CNAME
   - **Navn/host:** `app`
   - **Peker til:** CNAME-verdien fra Railway
3. Vent til Railway viser en grønn hake på domenet (minutter til en time —
   DNS bruker tid). HTTPS-sertifikat ordner Railway automatisk.

## Steg 4 — Azure: ny redirect-URI

Innloggingen mot Microsoft godtar bare adresser som er registrert på forhånd.

1. [portal.azure.com](https://portal.azure.com) → **App registrations** →
   appen din → **Authentication**.
2. Under **Web → Redirect URIs**: **Add URI** →
   `https://app.devello.no/api/auth/microsoft/callback`
3. **Save.** Behold localhost-URI-en — den brukes fortsatt til utvikling.

## Steg 5 — Supabase: produksjonsadressen

Supabase må vite hvilken adresse den skal lenke tilbake til i e-poster
(bekreftelse, passord-reset).

1. [supabase.com/dashboard](https://supabase.com/dashboard) → prosjektet
   **Devello database** → **Authentication → URL Configuration**.
2. **Site URL:** `https://app.devello.no`
3. **Redirect URLs:** legg til `https://app.devello.no/**` og behold
   `http://localhost:3000/**` for utvikling.

## Steg 6 — SMTP før ekte kunder

Uten egen SMTP er Supabase sin innebygde e-post så ratebegrenset at kunder
blir stengt ute av verifiserings-e-posten. Oppskriften med Resend står i
[smtp-oppsett.md](smtp-oppsett.md). Når den er gjort:

1. Sett `AUTH_REQUIRE_EMAIL_CONFIRMATION=true` i Railway-variablene.
2. Slå på **Confirm email** i Supabase → Authentication → Sign In / Up.

## Steg 7 — knappen på devello.no

Når domenet svarer, er knappen bare en lenke:

```html
<a href="https://app.devello.no/login">Logg inn</a>
```

Registrering for nye kunder ligger på `https://app.devello.no/registrer`
om du vil ha en «Prøv gratis»-knapp også.

## Sjekkliste før første kunde slipper til

- [ ] `https://app.devello.no/login` laster med hengelås (HTTPS)
- [ ] Logg inn med din egen bruker virker
- [ ] «Koble til Outlook» fullfører (beviser at Azure-URI-en stemmer)
- [ ] Generer et tilbud på en manuell henvendelse
- [ ] «Forhåndsvis PDF» virker (beviser at Chromium er med i bildet)
- [ ] Registrer et testfirma via /registrer og slett det etterpå
- [ ] SMTP er på og `AUTH_REQUIRE_EMAIL_CONFIRMATION=true`
- [ ] Prisene i `src/lib/billing/plans.ts` og kickback-prosenten er de reelle,
      ikke plassholderne

## Når noe er galt

- **Bygget feiler i Railway:** åpne bygglogg — feiler det på `npm run build`,
  vil samme kommando feile lokalt også. Fiks lokalt først.
- **«Fant ingen Chromium»** i PDF-forhåndsvisning: bildet er bygget uten
  `npx playwright-core install`-steget — sjekk at Railway faktisk bruker
  `Dockerfile` (Settings → Build) og ikke gjettet Nixpacks.
- **Microsoft-innlogging hopper til feilside:** redirect-URI-en i Azure
  matcher ikke `MS_REDIRECT_URI` tegn for tegn. Begge skal være
  `https://app.devello.no/api/auth/microsoft/callback`.
- **E-postlenker peker på localhost:** Site URL i Supabase (steg 5) er ikke
  satt.
