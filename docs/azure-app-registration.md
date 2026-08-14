# Azure / Entra ID — multitenant appregistrering

Dette er steg 1 i §8 «Neste konkrete steg». Det må gjøres én gang, i Devellos
egen Azure-tenant. Kundene trenger ikke gjøre noe — sluttbrukeren samtykker
selv i OAuth-dialogen.

## 1. Opprett appregistreringen

Azure-portalen → **Microsoft Entra ID** → **App registrations** → **New registration**.

| Felt | Verdi |
| --- | --- |
| Name | `Devello Tilbudsagent` |
| Supported account types | **Accounts in any organizational directory (Any Microsoft Entra ID tenant — Multitenant)** |
| Redirect URI | Web → `http://localhost:3000/api/auth/microsoft/callback` |

Multitenant er poenget: uten det må hver kunde registrere appen i sin egen
tenant.

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
MS_TENANT=common
MS_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback
```

`MS_TENANT=common` sender brukeren til den generelle innloggingssiden, slik at
både jobbkontoer og personlige Microsoft-kontoer kan brukes.

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
