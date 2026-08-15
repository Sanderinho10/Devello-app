# Azure / Entra ID — multitenant appregistrering

Dette er steg 1 i §8 «Neste konkrete steg». Det må gjøres én gang, i Devellos
egen Azure-tenant. Kundene trenger ikke gjøre noe — sluttbrukeren samtykker
selv i OAuth-dialogen.

## 0. «Jeg har ikke Azure»

Det trenger du sannsynligvis ikke å skaffe.

- **Azure-abonnement** (betaling, kredittkort) er *ikke* nødvendig.
  Appregistreringer ligger i Entra ID og er gratis.
- **Azure-portalen** er bare `portal.azure.com`. Logg inn med en Microsoft-konto,
  søk opp **Microsoft Entra ID**, og se etter **App registrations** i menyen.
- Har dere Microsoft 365, finnes Entra ID-katalogen allerede. Har du bare en
  personlig Microsoft-konto, opprettes en gratis standardkatalog ved første
  innlogging, og appregistrering virker der også.

**Velg konto med omhu.** Registreringen skal ligge hos Devello, ikke hos kunden.
Appen er multitenant nettopp for at hver kunde skal samtykke til *vår* app fra
sin egen Outlook. Legges den i kundens tenant, eier kunden nøkkelen til
produktet, og neste kunde krever en ny registrering.

En appregistrering kan ikke flyttes mellom tenanter. Havner den feil sted, må
den opprettes på nytt, og alle tilkoblede postkasser må koble til igjen.

## 1. Opprett appregistreringen

Azure-portalen → **Microsoft Entra ID** → **App registrations** → **New registration**.

| Felt | Verdi |
| --- | --- |
| Name | `Devello Tilbudsagent` |
| Supported account types | **Multiple Entra ID tenants** (multitenant) |
| | → velg **Allow all tenants** |
| Redirect URI | Web → `http://localhost:3000/api/auth/microsoft/callback` |

Multitenant er poenget: uten det må hver kunde registrere appen i sin egen
tenant.

Portalen tilbyr **Allow only certain tenants (Preview)** under kontotypen. Ikke
velg den. Den krever at hver kundes tenant-ID legges inn i Azure før kunden kan
koble til — altså en manuell Azure-endring per kunde, som velter både
sluttbrukersamtykket og den selvbetjente onboardingen i fase 3. Skjemaet lar seg
ikke sende før minst én tenant er lagt inn, så feilmeldingen «At least one
allowed tenant is required» betyr som regel at feil radioknapp er valgt.

**Allow all tenants** gjør ikke appen løsere: ingen får tilgang til noe før en
faktisk bruker logger inn og samtykker for sin egen postkasse, og appen ber
aldri om `Mail.Send`.

Kontotypen dekker jobb- og skolekontoer, ikke personlige Microsoft-kontoer.
Det er med vilje — v1 er Microsoft 365 (spec §3). Skal en personlig
Outlook.com-postkasse kunne kobles til under testing, må kontotypen endres til
varianten som også inkluderer personlige Microsoft-kontoer.

Legg til produksjons-URI-en i tillegg når den finnes:
`https://<domene>/api/auth/microsoft/callback`.

## 2. Client secret

**Certificates & secrets** → **New client secret**. Kopier *Value* med en gang —
den blir ikke vist igjen. Denne går i `MS_CLIENT_SECRET`.

## 3. API-tilganger

**API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated
permissions**. Legg til:

- `offline_access` — nødvendig for refresh tokens
- `openid`, `profile`, `email`
- `User.Read` — for å lese hvilken postkasse brukeren koblet til
- `Mail.Read` — lese innboksen (hent leads)
- `Mail.ReadWrite` — opprette kladd med vedlegg

**`Mail.Send` skal ikke legges til.** Prinsippet er låst: appen lager kladd,
mennesket trykker send selv. Å ikke be om tilgangen er den eneste garantien
som holder — en kodesjekk kan endres, et manglende scope kan ikke.

Ikke trykk «Grant admin consent» — hele poenget er at sluttbrukeren samtykker
selv i dialogen, uten å gå veien om IT.

## 4. Miljøvariabler

Fra **Overview**-siden:

```
MS_CLIENT_ID=<Application (client) ID>
MS_CLIENT_SECRET=<secret value fra steg 2>
MS_TENANT=organizations
MS_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback
```

`MS_TENANT` må matche kontotypen fra steg 1. Med **Multiple Entra ID tenants**
er verdien `organizations` — jobb- og skolekontoer fra alle tenanter.

Bruk `common` bare hvis appregistreringen også tillater personlige
Microsoft-kontoer. Setter du `common` på en jobbkonto-registrering, blir
personlige kontoer tilbudt i innloggingsdialogen og først avvist etter at
passordet er skrevet inn, med en feilmelding som ikke forklarer hvorfor.

## 5. Test

Start appen, gå til **Tilbud → Innstillinger** og trykk **Koble til Microsoft
365**. Etter samtykke skal postkassen dukke opp med status «Aktiv», og **Hent
leads** skal lese innboksen.

### Vanlige feil

| Melding | Årsak |
| --- | --- |
| `AADSTS50011: redirect URI mismatch` | URI-en i appregistreringen må matche `MS_REDIRECT_URI` tegn for tegn, inkludert protokoll og port. |
| `AADSTS65001: user or administrator has not consented` | Et av scopene mangler i **API permissions**. |
| `AADSTS7000215: invalid client secret` | Secret-*ID* er kopiert i stedet for secret-*Value*, eller secreten har gått ut. |
