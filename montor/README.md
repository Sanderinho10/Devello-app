# Devello Montør

Montørappen til Devello (Expo, iOS og Android). Programmet (kalenderen
montøren er satt opp i) med varsler når det endres, og tre ting på en
ordre: timer, materiell og notater med bilder. Virker uten dekning — det som skrives legges i en utboks
og sendes når nettet er tilbake.

API-kontrakten appen er bygd mot ligger i [`docs/api.md`](docs/api.md)
(kopi av `Devello-app/docs/montorapp-api.md`). Manuell sjekkliste før en
build gis ut: [`docs/testsjekkliste.md`](docs/testsjekkliste.md).

## Kjøre lokalt

Raskest: Expo Go fra App Store / Google Play, `npx expo start --tunnel`, og
skann QR-koden. Expo Go følger alltid nyeste Expo SDK, så prosjektet må
være på samme SDK (nå 58) — sier Expo Go at prosjektet er for gammelt, må
SDK-en oppgraderes.

For egen app på telefonen (eget ikon, uten Expo Go) trengs en development
build. Én gang per telefon:

```sh
npm install
cp .env.example .env            # fyll inn verdiene, se under
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform ios     # eller android
```

Installer builden på telefonen (lenka EAS gir deg). Deretter, hver gang:

```sh
npx expo start
```

Skann QR-koden fra dev-builden (ikke fra Expo Go). Telefonen og maskinen må
være på samme nett, og `EXPO_PUBLIC_API_URL` i `.env` må peke på maskinens
IP, ikke `localhost` — telefonen kan ikke nå `localhost`.

Uten telefon: `npx expo run:ios` / `npx expo run:android` bygger lokalt og
starter i simulator (krever Xcode / Android Studio).

## Miljøvariabler

| Variabel | Hva |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Samme som nettappens `NEXT_PUBLIC_SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Samme som nettappens `NEXT_PUBLIC_SUPABASE_ANON_KEY` (offentlig nøkkel) |
| `EXPO_PUBLIC_API_URL` | Nettappen: `https://app.devello.no` i drift, `http://<maskin-ip>:3000` lokalt |

Lokalt leses de fra `.env` — også i en development-build, som henter JS fra
`npx expo start` på maskinen. `preview`- og `production`-builds bygger JS-en
inn i appen, og da må verdiene finnes hos EAS: `EXPO_PUBLIC_API_URL` står i
`eas.json`, Supabase-verdiene legges inn én gang som EAS-miljøvariabler
(repoet er offentlig, så de skal ikke inn i `eas.json`):

```sh
npx eas-cli@latest env:create --scope project --environment preview --environment production   --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://<prosjekt>.supabase.co
npx eas-cli@latest env:create --scope project --environment preview --environment production   --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-nøkkel>
```

Mangler de, sier innloggingsskjermen fra.

## Preview-build (installerbar, uten butikk)

```sh
npx eas-cli@latest build --profile preview --platform all
```

Gir en Android-APK og en iOS-build for intern distribusjon (ad hoc). EAS
gir en lenke som kan sendes til montørene. iOS ad hoc krever at hver
telefons UDID er registrert — `npx eas-cli@latest device:create` lager en
lenke montøren åpner på telefonen, og enheten kommer med i neste build.

Alternativt TestFlight: `--profile production` og `npx eas-cli@latest submit`.

## Det Sander må ha på plass

1. **Apple Developer Program** for Devello AS (organisasjon, ikke person —
   krever D-U-N-S-nummer). Bundle-ID `no.devello.montor` registreres av EAS
   første gang. TestFlight krever i tillegg App Store Connect-tilgang.
2. **Google Play Console** (engangsavgift) for `no.devello.montor`. For
   preview-APK-er trengs den ikke — APK-en installeres direkte.
3. **Expo-konto** og `npx eas-cli@latest login`. Første `eas build` spør om
   å opprette et EAS-prosjekt og fyller inn `extra.eas.projectId` i
   `app.json` — commit den endringen.
4. **Ikon og splash**: `assets/ikon.png` (1024×1024),
   `assets/android-ikon-forgrunn.png` (1024×1024, gjennomsiktig bakgrunn) og
   `assets/splash.png` byttes ut med Devello-logoen. Plassholderne som ligger
   der nå er nøytrale.
5. **Supabase-verdiene** som EAS-miljøvariabler (se over) før første preview-build.

## Kommandoer

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm test            # jest: utboks-planleggeren, svar-til-liste og formatering
npm start           # expo start
npm run liksom      # liksom-server (se under)
npm run web         # appen i nettleseren, til forhåndsvisning
```

## Varsler

Når kontoret setter montøren på et oppdrag, flytter det eller tar ham av
det, lagrer serveren et varsel og sender push til telefonen. Appen har to
deler:

- **Varsel-lista** («Varsler» øverst på programmet) viser alle varsler, også
  de som ikke kom fram som push. Tallet på knappen, på Program-fanen og på
  app-ikonet er antall uleste. Det montøren har hatt på skjermen merkes
  lest når lista lukkes. Trykk åpner ordren, eller programmet når oppdraget
  er tatt bort.
- **Push** (`lib/push.ts`). Appen spør aldri om lov ved oppstart: kortet «Få
  beskjed om nye oppdrag» på programmet har knappen «Slå på varsler», og
  først da kommer systemets spørsmål. Tokenet meldes til serveren ved hver
  oppstart og tas av brukeren ved utlogging. Uten token sender serveren
  varselet på e-post i stedet.

Hvor push virker:

| | Push |
| --- | --- |
| iPhone, Expo Go | Ja |
| Android, Expo Go | Nei — Expo Go har ikke push på Android. Lista virker. |
| iPhone, egen build (EAS) | Ja. EAS lager push-nøkkelen hos Apple første gang du bygger. |
| Android, egen build (EAS) | Krever Firebase: legg `google-services.json` i prosjektet (`android.googleServicesFile` i `app.json`) og last opp tjenestekontonøkkelen med `npx eas-cli@latest credentials`. |
| Simulator, nettleser | Nei. Lista virker. |

Der push ikke virker, sier kortet i varsel-lista fra, og alt annet går som
før.

## Prøve appen uten nettappen (liksom-server)

`dev/liksom-server.mjs` er Supabase Auth og API-et fra `docs/api.md` i én
prosess, med data i minnet: seks ordrer, timer, materiell, notat, kalender,
varsler og et timeforslag. Brukes til å se på og teste appen uten nettappen — i
nettleseren eller på telefonen.

```sh
npm run liksom                     # liksom-server på port 4010
EXPO_PUBLIC_SUPABASE_URL=http://localhost:4010 EXPO_PUBLIC_SUPABASE_ANON_KEY=liksom \
EXPO_PUBLIC_API_URL=http://localhost:4010 npm run web     # appen i nettleseren
```

(PowerShell: sett de tre variablene med `$env:NAVN="verdi"` først.) Alle
e-poster slipper inn; passordet `feil` gir feil passord, og e-posten
`utenmodul@…` gir et selskap uten ordre-modul. `POST /__liksom` med
`{"feil": 503}` eller `{"feil": 400}` får skrive-kallene til å feile, så
utboksen kan prøves, og `{"nyttVarsel": true}` legger til et ulest varsel.

Nettleserutgaven er bare til forhåndsvisning: sesjonen og utboksen ligger
da i nettleserens lager (`lib/sesjonslager.web.ts`, `lib/utboks/lager.web.ts`)
i stedet for Keychain og SQLite, og kamera og bilder virker ikke som på
telefonen.

## Design

Samme designsystem som nettappen (`Devello-app/src/app/globals.css`), med
tokenene i `lib/tema.ts`. Form og farger er Apple: systemskriften, stram
bokstavavstand på titler, kapselknapper, grupperte lister, én blå aksent, og
grønt, oransje og rødt bare der noe skal sies. Oppsettet er lånt fra
PowerOffice Go: tette lister, understrekede faner på ordren, tall i
kolonner. Reglene som gjelder hele appen:

- Minste trykkflate 48 pt. Skjermens hovedhandling er én blå kapselknapp,
  54 pt høy, nederst. Andre handlinger er grå eller lys blå.
- Ikoner står alltid sammen med tekst. Tall står i `tabular-nums`.
- Feil vises i et banner på skjermen, aldri i `Alert` (Alert bare for
  «Merk som ferdig?» og «Logg ut med usendte?»).
- Det som lagres kvitteres øverst («7,5 t lagret») og med et dunk i fingeren.

## Struktur

```
app/                         expo-router — hver fil er en skjerm
  _layout.tsx                react-query + persister, sesjon, utboks-motor
  logg-inn.tsx
  (app)/_layout.tsx          stack: fanene nederst, skjemaene som modaler over hele appen
  (app)/(tabs)/_layout.tsx   Program · Ordrer · Meg (merket på Meg = usendt i utboksen)
  (app)/(tabs)/index.tsx     programmet (i dag + 14 dager) og timeforslag
  (app)/(tabs)/ordrer/       ordrelista, og én ordre: hode + fanene Timer · Materiell · Notater
  (app)/(tabs)/meg.tsx       hvem som er innlogget, utboksen, logg ut
  (app)/ny-time.tsx          modal, ?ordre=<id> (+ dato, timar, timetype fra et timeforslag)
  (app)/ny-materiell.tsx     modal, ?ordre=<id>: søk/skann → mengde, eller fritekst
  (app)/nytt-notat.tsx       modal, ?ordre=<id>: tekst + inntil fem bilder
  (app)/bilete.tsx           bilde i fullskjerm
  (app)/varsler.tsx          modal: varsel-lista og «Slå på varsler»
lib/
  api.ts                     fetch-wrapper: Bearer, 401 → refresh, tidsgrense, ApiFeil/NettFeil
  supabase.ts, sesjonslager  klient + LargeSecureStore (AES i AsyncStorage, nøkkel i SecureStore)
  sporringar.ts              react-query-hooks, og useOrdreMedUtboks (server + utboks)
  utboks/                    lager.ts (SQLite), db.ts (eierskap, kopi i minnet), planlegg.ts (ren, testet),
                             send.ts (kallene), cache.ts (svaret rett inn i lista), motor.ts (løkka)
  push.ts                    push: lov, token til serveren, trykk på varsel → ordren (push.web.ts: ingen push)
  bilete.ts                  komprimering (1600 px, JPEG 0,75) og lagring i documentDirectory/utboks
  tema.ts, format.ts, typer.ts, haptikk.ts, kvittering.ts
components/ui/               Knapp, Felt, Sokefelt, Gruppe/Rad, Pille, Segment/Faner, Chip, Stepper,
                             Sheet, Banner, Skjermhode, Kvittering, Avatar, Ikon
dev/liksom-server.mjs        liksom-server til forhåndsvisning og testing
```

## Utboksen — reglene

- Alt som skrives får en `client_id` (UUID v4) og en rad i SQLite før noe
  sendes. Serveren dedupliserer på `client_id`, så ingenting sendes to ganger
  selv om appen blir drept midt i en sending.
- Motoren sender én rad om gangen i opprettelsesrekkefølge. Bilder venter til
  notatet de hører til har fått server-ID.
- Nettverksfeil, 5xx og 429 → prøv igjen med backoff (2, 4, 8 … maks 300 s).
  400/403/404 → «Feilet» med serverens melding; montøren velger «Prøv igjen»
  eller «Slett» under Meg. 401 → forny token, ellers logg ut.
- Rader i utboksen vises i fanene med «Sendes …»/«Feilet». Når serveren har
  svart, legges svaret rett inn i lista, så raden ikke blinker bort mens
  ordren hentes på nytt.
- Hver rad eies av den som skrev den. Logg ut sletter ikke utboksen, og
  logger en annen inn på samme telefon, blir radene liggende til eieren er
  tilbake — de sendes aldri med en annens token.
