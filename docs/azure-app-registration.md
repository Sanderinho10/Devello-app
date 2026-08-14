# Azure / Entra ID — multitenant appregistrering

Dette er steg 1 i §8 «Neste konkrete steg». Det må gjerast éin gong, i Devello
sin eigen Azure-tenant. Kundane treng ikkje gjere noko — sluttbrukaren samtykker
sjølv i OAuth-dialogen.

## 1. Opprett appregistreringa

Azure-portalen → **Microsoft Entra ID** → **App registrations** → **New registration**.

| Felt | Verdi |
| --- | --- |
| Name | `Devello Tilbudsagent` |
| Supported account types | **Accounts in any organizational directory (Any Microsoft Entra ID tenant — Multitenant)** |
| Redirect URI | Web → `http://localhost:3000/api/auth/microsoft/callback` |

Multitenant er poenget: utan det må kvar kunde registrere appen i sin eigen
tenant.

Legg til produksjons-URI-en i tillegg når den finst:
`https://<domene>/api/auth/microsoft/callback`.

## 2. Client secret

**Certificates & secrets** → **New client secret**. Kopier *Value* med ein gong —
den blir ikkje vist igjen. Denne går i `MS_CLIENT_SECRET`.

## 3. API-tilgangar

**API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated
permissions**. Legg til:

- `offline_access` — nødvendig for refresh tokens
- `openid`, `profile`, `email`
- `User.Read` — for å lese kva postkasse brukaren kopla til
- `Mail.Read` — lese innboksen (hent leads)
- `Mail.ReadWrite` — opprette kladd med vedlegg

**`Mail.Send` skal ikkje leggjast til.** Prinsippet er låst: appen lagar kladd,
mennesket trykker send sjølv. Å ikkje be om tilgangen er den einaste garantien
som held — ei kodesjekk kan endrast, ein manglande scope kan ikkje.

Ikkje trykk «Grant admin consent» — heile poenget er at sluttbrukaren samtykker
sjølv i dialogen, utan å gå vegen om IT.

## 4. Miljøvariablar

Frå **Overview**-sida:

```
MS_CLIENT_ID=<Application (client) ID>
MS_CLIENT_SECRET=<secret value frå steg 2>
MS_TENANT=common
MS_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback
```

`MS_TENANT=common` sender brukaren til den generelle innloggingssida, slik at
både jobbkontoar og personlege Microsoft-kontoar kan brukast.

## 5. Test

Start appen, gå til **Tilbud → Innstillingar** og trykk **Kople til Microsoft
365**. Etter samtykke skal postkassa dukke opp med status «Aktiv», og **Hent
leads** skal lese innboksen.

### Vanlege feil

| Melding | Årsak |
| --- | --- |
| `AADSTS50011: redirect URI mismatch` | URI-en i appregistreringa må matche `MS_REDIRECT_URI` teikn for teikn, inkludert protokoll og port. |
| `AADSTS65001: user or administrator has not consented` | Ein av scopene manglar i **API permissions**. |
| `AADSTS7000215: invalid client secret` | Secret-*ID* er kopiert i staden for secret-*Value*, eller secreten har gått ut. |
