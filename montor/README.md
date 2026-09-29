# Devello Montør

Montørappen til Devello (Expo, iOS og Android). Tre ting, og bare de tre:
timer, materiell og notater med bilder på en ordre. Virker uten dekning —
det som skrives legges i en utboks og sendes når nettet er tilbake.

API-kontrakten appen er bygd mot ligger i [`docs/api.md`](docs/api.md)
(kopi av `Devello-app/docs/montorapp-api.md`). Manuell sjekkliste før en
build gis ut: [`docs/testsjekkliste.md`](docs/testsjekkliste.md).

## Kjøre lokalt

Expo Go holder ikke: kamera, SQLite og SecureStore krever en development
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
npm test            # jest: utboks-planleggeren og formatering
npm start           # expo start
```

## Struktur

```
app/                    expo-router — hver fil er en skjerm
  _layout.tsx           react-query + persister, sesjon, utboks-motor
  (auth)/logg-inn.tsx
  (app)/_layout.tsx     Tabs: Ordrer · Meg (+ skjerm for selskap uten ordre-modul)
  (app)/ordrer/         liste og én ordre (hode + faner Timer · Materiell · Notater)
  (app)/ordrer/[id]/    ny-time, ny-materiell, nytt-notat (modaler), bilete/[docId]
  (app)/meg.tsx         navn, selskap, utboks, logg ut
lib/
  api.ts                fetch-wrapper: Bearer, 401 → refresh, ApiFeil/NettFeil
  supabase.ts           klient + LargeSecureStore (AES i AsyncStorage, nøkkel i SecureStore)
  sporringar.ts         react-query-hooks, og useOrdreMedUtboks (server + utboks)
  utboks/               db.ts (SQLite), planlegg.ts (ren planlegger, testet), motor.ts (sender)
  bilete.ts             komprimering (1600 px, JPEG 0,75) og lagring i documentDirectory/utboks
  format.ts, tema.ts, typer.ts
components/ui/          Knapp, Felt, Kort, Stepper, Sheet, Banner, Chip, Segment, Merke
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
- Rader i utboksen vises i fanene med «Sendes …»/«Feilet». Logg ut sletter
  ikke utboksen.
