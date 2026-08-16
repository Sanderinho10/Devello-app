# Produksjonsoppsett — app.devello.no, klikk for klikk

Målet: plattformen kjører offentlig på `https://app.devello.no`, og
«Logg inn»-knappen på devello.no peker på `https://app.devello.no/login`.

Appen lager PDF-er med en ekte Chromium-nettleser på serveren. Det krever en
host som kjører et vanlig Docker-bilde — ikke serverless. Vi bruker
**Railway**: den kobles til GitHub, bygger `Dockerfile` i repoet automatisk,
og deployer på nytt hver gang det pushes.

**Kostnad:** Railway Hobby-plan er 5 USD/mnd (inkluderer 5 USD forbruk — denne
appen holder seg normalt innenfor eller like over). Du må legge inn kort.

## Det du trenger før du starter

- GitHub-brukeren som eier `Sanderinho10/Devello-app` (brukernavn + passord)
- `.env.local`-fila i prosjektmappa på PC-en din (verdiene skal limes inn)
- Innlogging hos domeneleverandøren der devello.no er registrert
  (Domeneshop, one.com e.l.)
- Innlogging på [portal.azure.com](https://portal.azure.com) og
  [supabase.com/dashboard](https://supabase.com/dashboard)
- Et betalingskort til Railway

Regn med 30–45 minutter totalt, pluss DNS-venting.

---

## Steg 1 — opprett Railway-konto

1. Gå til **[railway.com](https://railway.com)**.
2. Klikk **Login** øverst til høyre.
3. Velg **Login with GitHub**.
4. GitHub spør om Railway skal få tilgang → klikk **Authorize Railway**.
5. Du lander på et tomt «dashboard» — en mørk side med en
   **New Project**-knapp. Kontoen er nå opprettet.
6. Railway vil før eller siden be deg velge plan. Velg **Hobby**
   (5 USD/mnd) og legg inn kort når den spør. Uten plan får du bare en liten
   engangs prøvekvote, og appen stopper når den er brukt opp.

## Steg 2 — koble til repoet og start første bygg

1. Klikk **New Project** (eller **New** øverst til høyre → **GitHub Repo**).
2. Velg **Deploy from GitHub repo**.
3. Første gang: Railway ber om tilgang til GitHub-repoene dine. Klikk
   **Configure GitHub App**, velg kontoen **Sanderinho10**, og under
   «Repository access» velg **Only select repositories** → **Devello-app** →
   **Install & Authorize**.
4. Tilbake i Railway: klikk på **Devello-app** i lista.
5. Railway lager et prosjekt med én «service» (en boks midt på skjermen som
   heter noe med Devello-app) og begynner å bygge med en gang.

**Forvent at dette første forsøket feiler eller krasjer ved oppstart** —
appen mangler alle miljøvariablene ennå. Det er helt som det skal. Steg 4
fikser det.

## Steg 3 — velg riktig gren

Railway deployer fra én gren, og den gjetter `main`. Koden ligger i dag på
en annen gren, så dette må settes:

1. Klikk på service-boksen → fanen **Settings**.
2. Finn seksjonen **Source** (øverst). Der står repoet og en **Branch**.
3. Klikk på grennavnet og velg
   `claude/tilbudsagent-produktbyggspec-v2-xj6tvj`.
4. Sjekk samtidig, i seksjonen **Build** litt lenger ned, at «Builder» viser
   **Dockerfile** — Railway skal ha funnet den selv. Står det «Nixpacks»,
   klikk og endre til Dockerfile.

Fra nå av: hver push til den grenen gir automatisk en ny deploy.

> Når dere senere merger til `main`, bytt Branch tilbake hit til `main`.

## Steg 4 — lim inn miljøvariablene

Dette er de samme verdiene som i `.env.local` på PC-en din, med tre unntak.

1. Åpne fila lokalt: start PowerShell i prosjektmappa og kjør

   ```powershell
   notepad .env.local
   ```

2. I Railway: klikk på service-boksen → fanen **Variables**.
3. Klikk **Raw Editor** (knapp oppe til høyre i variabellista, kan ligge bak
   `{}`-ikonet eller ⋮-menyen).
4. Kopier **hele innholdet** i `.env.local` fra Notepad og lim inn.
5. Endre så disse tre linjene i Raw Editor før du lagrer:

   ```
   MS_REDIRECT_URI=https://app.devello.no/api/auth/microsoft/callback
   NEXT_PUBLIC_APP_URL=https://app.devello.no
   ```

   og la `AUTH_REQUIRE_EMAIL_CONFIRMATION=false` stå inntil SMTP er på plass
   (steg 9).
6. Klikk **Update Variables** / **Save**.
7. Det dukker opp et banner om at endringene krever ny deploy — klikk
   **Deploy** i banneret.

## Steg 5 — se bygget bli grønt

1. Klikk på service-boksen → fanen **Deployments**.
2. Øverst ligger den nyeste deployen. Klikk på den → **View Logs**.
3. **Build Logs** viser Docker-byggingen. Første gang tar det 5–10 minutter —
   det meste er nedlasting av Chromium. Det er normalt.
4. Når statusen går til **Active** (grønn), kjører appen.
   **Deploy Logs** skal da vise noe à la `▲ Next.js` og `Ready in …`.

Feiler bygget: les siste linjene i Build Logs. Feiler det på
`npm run build`, ville samme kommando feilet lokalt — fiks lokalt, push, og
Railway prøver igjen selv.

## Steg 6 — test på Railway-adressen før domenet

Railway kan gi appen en midlertidig adresse, så vi vet at alt virker før vi
rører DNS:

1. Service-boksen → **Settings** → seksjonen **Networking** (også kalt
   Public Networking).
2. Klikk **Generate Domain**. Blir du spurt om port: velg **3000**.
3. Du får en adresse som `devello-app-production-xxxx.up.railway.app`.
   Åpne den i nettleseren.
4. Du skal se innloggingssiden til Devello. Logg inn med din vanlige bruker
   og se at leads-siden laster.

> «Koble til Outlook» virker IKKE herfra ennå — Microsoft godtar bare
> adresser som er registrert, og vi registrerer app.devello.no i steg 8.
> Alt annet (leads, generering, PDF) kan testes nå.

## Steg 7 — pek app.devello.no på Railway

Først i Railway:

1. Samme sted som i steg 6 (**Settings → Networking**): klikk
   **Custom Domain**.
2. Skriv `app.devello.no` og bekreft.
3. Railway viser nå en verdi domenet skal peke på — en CNAME-verdi som
   ligner `xxxx.up.railway.app`. **Kopier den.** La fanen stå åpen.

Railway ber om **to** poster: en CNAME som peker domenet på appen, og en
TXT som beviser at du eier domenet. Begge må inn.

> ### Viktig: DNS for devello.no ligger hos Cloudflare
>
> Domenet er registrert ett sted, men navnetjenerne — de som faktisk svarer
> resten av internett — er `julio.ns.cloudflare.com` og
> `delilah.ns.cloudflare.com`. **Bare poster lagt inn i Cloudflare gjelder.**
>
> Legger du dem inn i registrarens DNS-panel i stedet, ser alt riktig ut i
> panelet, og ingenting skjer. De gamle postene ligger nemlig i begge
> panelene — de ble kopiert til Cloudflare den gangen navnetjenerne ble
> byttet — så panelet lyver overbevisende.
>
> Er du i tvil om hvem som er autoritativ: slå opp domenet på
> [dnschecker.org](https://dnschecker.org) med type **NS**.

Enkleste vei — la Railway gjøre det:

4. I dialogen Railway viste: klikk **Connect** ved «One-click DNS Setup»
   under Cloudflare-logoen. Logg inn på Cloudflare og godkjenn. Railway
   legger inn begge postene selv, riktig satt opp.

Eller manuelt i Cloudflare:

4. Gå til [dash.cloudflare.com](https://dash.cloudflare.com) → velg
   **devello.no** → **DNS** → **Records** → **Add record**.
5. Post 1:
   - **Type:** `CNAME`
   - **Name:** `app`
   - **Target:** verdien fra Railway (`xxxx.up.railway.app`, uten `https://`)
   - **Proxy status:** klikk skyen slik at den blir **grå — «DNS only»**.
     Dette er viktig. En oransje (proxied) sky lar Cloudflare stå mellom
     kunden og Railway, og med standardinnstillingene ender det i
     omdirigeringsløkke eller sertifikatfeil.
   - **Save**
6. Post 2:
   - **Type:** `TXT`
   - **Name:** `_railway-verify.app`
   - **Content:** hele `railway-verify=…`-strengen. Den er avkortet på
     skjermen i Railway — klikk på verdien for å kopiere hele, ikke skriv
     den av.
   - **Save**

Merk at Cloudflare legger `.devello.no` bak navnet selv. Skriver du
`app.devello.no` i Name-feltet, blir posten `app.devello.no.devello.no`.

7. Sjekk at postene faktisk er ute. På [dnschecker.org](https://dnschecker.org):
   søk `app.devello.no` med type **CNAME** — den skal vise
   `xxxx.up.railway.app`. Får du «not found», er posten ikke lagret der den
   må være (se rammen over).
8. Tilbake i Railway: statusen ved app.devello.no går fra
   «Waiting for DNS update» til en **grønn hake**. HTTPS-sertifikatet ordner
   Railway automatisk samtidig.
9. Når haken er grønn: åpne `https://app.devello.no` — innloggingssiden
   skal laste med hengelås i adressefeltet.

## Steg 8 — Azure: godkjenn den nye adressen

Microsoft-innloggingen (Koble til Outlook) godtar bare adresser som er
registrert på appregistreringen på forhånd.

1. Gå til [portal.azure.com](https://portal.azure.com) og logg inn som da
   vi satte opp appen.
2. Søk øverst på **App registrations** og åpne den.
3. Klikk på appen din i lista (den vi registrerte for Devello).
4. I menyen til venstre: **Authentication**.
5. Under **Web → Redirect URIs** ser du localhost-adressen fra før. Klikk
   **Add URI** og lim inn:

   ```
   https://app.devello.no/api/auth/microsoft/callback
   ```

6. Klikk **Save** nederst.
7. **Ikke slett** localhost-linja — den brukes fortsatt når dere utvikler
   lokalt.

## Steg 9 — Supabase: fortell den hvor appen bor

Supabase lager lenkene i e-postene sine (bekreftelse, passord-reset) ut fra
en «Site URL». Står den på localhost, peker kundenes e-postlenker på
localhost.

1. Gå til [supabase.com/dashboard](https://supabase.com/dashboard) → åpne
   prosjektet **Devello database**.
2. I menyen til venstre: **Authentication**.
3. Under Configuration: **URL Configuration**.
4. **Site URL:** bytt til `https://app.devello.no`
5. Under **Redirect URLs**: klikk **Add URL** og legg til
   `https://app.devello.no/**` — og legg også til
   `http://localhost:3000/**` hvis den ikke står der, så lokal utvikling
   fortsatt virker.
6. Klikk **Save**.

**Før ekte kunder registrerer seg:** sett opp SMTP med Resend etter
[smtp-oppsett.md](smtp-oppsett.md). Når det er gjort: sett
`AUTH_REQUIRE_EMAIL_CONFIRMATION=true` i Railway-variablene (steg 4-måten)
og slå på **Confirm email** i Supabase → Authentication → Sign In / Up.

## Steg 10 — knappen på devello.no

Knappen er bare en lenke:

```html
<a href="https://app.devello.no/login">Logg inn</a>
```

Vil du ha en «Prøv gratis»-knapp også, peker den på
`https://app.devello.no/registrer`.

---

## Sjekkliste før Star Elektro slipper til

Gå gjennom denne på `https://app.devello.no` — ikke på localhost:

- [ ] Innloggingssiden laster med hengelås (HTTPS)
- [ ] Logg inn med din egen bruker virker
- [ ] «Koble til Outlook» fullfører uten feilside (beviser steg 8)
- [ ] Lag en manuell henvendelse og generer et tilbud
- [ ] «Forhåndsvis PDF» åpner en PDF (beviser at Chromium er med i bildet)
- [ ] Registrer et testfirma via `/registrer`, logg inn, slett det etterpå
- [ ] SMTP er satt opp og `AUTH_REQUIRE_EMAIL_CONFIRMATION=true`
- [ ] Prisene i `src/lib/billing/plans.ts` og kickback-prosenten i databasen
      er de reelle, ikke plassholderne

## Når noe er galt

| Symptom | Årsak og fiks |
| --- | --- |
| Bygget feiler i Railway | Åpne Build Logs. Feiler `npm run build`, feiler den lokalt også — fiks lokalt og push |
| «Fant ingen Chromium» ved PDF | Railway bygger ikke med Dockerfile — Settings → Build → sett Builder til Dockerfile |
| Microsoft-innlogging gir feilside | Redirect-URI i Azure matcher ikke tegn for tegn — begge skal være `https://app.devello.no/api/auth/microsoft/callback` |
| E-postlenker peker på localhost | Site URL i Supabase (steg 9) er ikke lagret |
| app.devello.no svarer ikke, Railway står på «Waiting for DNS update» | Postene er lagt inn i et DNS-panel som ikke er autoritativt. DNS-en for devello.no serves av Cloudflare — postene må inn der (se rammen i steg 7). Sjekk med dnschecker.org type CNAME |
| app.devello.no gir omdirigeringsløkke eller sertifikatfeil | CNAME-posten er «proxied» (oransje sky) i Cloudflare. Sett den til grå «DNS only» |
| Appen stopper etter noen dager | Prøvekvoten er brukt opp — kontoen mangler Hobby-plan/kort (steg 1) |
