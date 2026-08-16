# SMTP i Supabase — steg for steg med Resend

Supabase sender e-post selv ut av boksen, men den tjenesten er ment for testing
og er hardt ratebegrenset — noen få meldinger i timen for hele prosjektet. Det
holder ikke: symptomet er «email rate limit exceeded», og kunden kommer ikke inn.

Med egen SMTP forsvinner grensen, e-posten kommer fra ditt eget domene, og den
havner sjeldnere i søppelpost.

Regn med at DNS-oppslag tar litt tid. Resten er gjort på et kvarter.

---

## 1. Verifiser domenet i Resend

Resend → **Domains** → **Add Domain**. Skriv inn domenet, for eksempel
`devello.no`, og velg region **EU (Ireland)** — data om norske kunder bør ligge i
Europa.

Resend viser noen DNS-oppføringer. Legg dem inn hos den som har domenet ditt
(Domeneshop, one.com eller hvor det nå ligger):

| Type | Hva den gjør |
| --- | --- |
| `MX` på `send.devello.no` | Tar imot returmeldinger, så du ser hva som ikke kom fram |
| `TXT` (SPF) på `send.devello.no` | Sier at Resend har lov til å sende på vegne av deg |
| `TXT` (DKIM) på `resend._domainkey` | Signerer e-posten, så mottakeren ser at den ikke er forfalsket |

Kopier verdiene ordrett. Har DNS-verktøyet et eget felt for navn og verdi, ikke
ta med domenet i navnefeltet hvis verktøyet legger det til selv — det er den
vanligste feilen her, og resultatet blir `send.devello.no.devello.no`.

Trykk **Verify**. Går det ikke med én gang, vent litt og prøv igjen; DNS bruker
tid på å spre seg.

> **Har du ikke eget domene ennå?** Resend lar deg sende fra `onboarding@resend.dev`
> uten verifisering, men bare til din egen registrerte adresse. Godt nok til å se
> at oppsettet virker, ikke godt nok til kunder.

## 2. Lag en API-nøkkel

Resend → **API Keys** → **Create API Key**.

- Navn: `Supabase SMTP`
- Permission: **Sending access**
- Domain: domenet du nettopp verifiserte

Kopier nøkkelen — den starter med `re_` og vises bare denne ene gangen. Det er
denne som blir SMTP-passordet.

## 3. Slå på SMTP i Supabase

Supabase → **Project Settings** → **Authentication** → **SMTP Settings** → slå på
**Enable Custom SMTP**.

| Felt | Verdi |
| --- | --- |
| Sender email | `ingen-svar@devello.no` (må være på det verifiserte domenet) |
| Sender name | `Devello` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` — dette er brukernavnet, ikke din e-postadresse |
| Password | API-nøkkelen fra steg 2 |

**Save**.

Brukernavnet er bokstavelig talt `resend` for alle. Det ser feil ut, og det er
riktig.

## 4. Hev sendegrensen

Supabase → **Authentication** → **Rate Limits** → **Rate limit for sending
emails**.

Standard er satt lavt fordi den innebygde tjenesten var det. Sett den til noe
som tåler bruk — 30 i timen holder lenge for onboarding og invitasjoner.

Glemmer du dette, står grensen igjen selv om SMTP-en er byttet, og du får samme
feil som før.

## 5. Sett URL-ene

Supabase → **Authentication** → **URL Configuration**.

- **Site URL**: `http://localhost:3000` mens dere utvikler, produksjonsdomenet
  senere.
- **Redirect URLs**: legg inn begge, én per linje:
  ```
  http://localhost:3000/**
  https://<produksjonsdomene>/**
  ```

Står ikke adressen her, blir bekreftelses- og invitasjonslenkene avvist når noen
trykker på dem.

## 6. Krev bekreftelse

Supabase → **Authentication** → **Providers** → **Email** → slå på
**Confirm email**.

Så i `.env.local`:

```
AUTH_REQUIRE_EMAIL_CONFIRMATION=true
```

Start dev-serveren på nytt. Nå oppretter registreringen brukeren ubekreftet,
sender bekreftelseslenken, og viser «Sjekk e-posten» i stedet for å logge inn.

La den stå `false` til stegene over er gjort. Uten SMTP blir kunder stengt ute
av ratebegrensningen, og det er verre enn en ubekreftet adresse.

## 7. Oversett malene

Supabase → **Authentication** → **Email Templates**. Standardmalene er på engelsk
og signert Supabase. Kunden skal ikke se det.

Tre maler er i bruk: **Confirm signup**, **Invite user** og **Reset password**.

### Confirm signup

Emne: `Bekreft e-postadressen din`

```html
<p>Hei!</p>
<p>Trykk på lenken under for å bekrefte adressen din og komme i gang med Devello.</p>
<p><a href="{{ .ConfirmationURL }}">Bekreft e-postadressen</a></p>
<p>Lenken er gyldig i 24 timer. Har du ikke opprettet konto hos oss, kan du se bort fra denne e-posten.</p>
<p>Devello</p>
```

### Invite user

Emne: `Du er invitert til Devello`

```html
<p>Hei!</p>
<p>En kollega har invitert deg inn i Devello. Trykk på lenken under for å sette et passord og komme i gang.</p>
<p><a href="{{ .ConfirmationURL }}">Ta imot invitasjonen</a></p>
<p>Lenken er gyldig i 24 timer.</p>
<p>Devello</p>
```

### Reset password

Emne: `Tilbakestill passordet ditt`

```html
<p>Hei!</p>
<p>Trykk på lenken under for å velge et nytt passord.</p>
<p><a href="{{ .ConfirmationURL }}">Velg nytt passord</a></p>
<p>Har du ikke bedt om dette, kan du se bort fra e-posten. Passordet blir ikke endret før du trykker på lenken.</p>
<p>Devello</p>
```

`{{ .ConfirmationURL }}` må stå akkurat slik — det er Supabase som fyller den inn.

## 8. Test

Opprett en konto på `/registrer` med en adresse du kan lese. Du skal få
bekreftelsesmailen i løpet av sekunder, og «Sjekk e-posten» i nettleseren.

Inviter deretter en adresse fra **Selskap → Medlemmer** og se at den kommer fram.

Resend → **Logs** viser hver eneste sending med status. Kommer ingenting fram,
er det der du ser om e-posten ble sendt og avvist, eller aldri ble sendt.

## Når noe ikke virker

| Symptom | Hva det som regel er |
| --- | --- |
| Ingenting i Resend-loggen | Supabase prøvde ikke å sende. Sjekk at Custom SMTP faktisk er lagret, og at ratebegrensningen i steg 4 ikke er nådd |
| `535 Authentication failed` | Passordfeltet har noe annet enn API-nøkkelen, eller brukernavnet er ikke `resend` |
| Sending avvist med «domain not verified» | Avsenderadressen er ikke på det verifiserte domenet |
| Lenken i e-posten gir feil | Adressen mangler i **Redirect URLs**, steg 5 |
| E-posten havner i søppelpost | DKIM eller SPF er ikke verifisert. Sjekk domenestatus i Resend |
