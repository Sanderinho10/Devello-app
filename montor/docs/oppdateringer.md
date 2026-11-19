# Oppdateringer uten terminal (EAS Update)

Endringer i montørappen kommer ut på telefonene av seg selv. Ingen trenger å
ha `npx expo start` gående.

## Hvordan det virker

| Kanal | Hvem | Hva de har installert | Får oppdatering |
| --- | --- | --- | --- |
| `test` | Utviklere og Noah | Expo Go (eller en development-build) | Automatisk ved push til `main` eller `claude/**` som rører `montor/` |
| `kunde` | Star Elektro | Preview-builden (APK på Android) | Bare når noen trykker «Run workflow» og velger `kunde` |

Jobben ligger i `.github/workflows/montor-oppdatering.yml`. Den kjører
typecheck og tester før den publiserer, så en knekt endring går ikke ut.

Oppdateringen lastes ned når appen åpnes, og tas i bruk neste gang den åpnes.
Lukk appen helt og åpne den igjen for å se den.

## Oppsett, én gang

1. **Expo-nøkkel i GitHub.** expo.dev → Account settings → Access tokens →
   Create. Legg den inn i GitHub: `Settings → Secrets and variables → Actions →
   New repository secret`, navn `EXPO_TOKEN`.
2. **Supabase-verdiene hos EAS** (miljøet `preview`), hvis de ikke er der
   allerede. Se README under «Miljøvariabler». Jobben henter dem med
   `--environment preview`.
3. **Ny preview-build** til Android, siden den gamle ikke vet om kanalen:
   `npx eas-cli@latest build --profile preview --platform android`. Send
   lenken til kunden. Den installeres én gang; senere endringer kommer av seg
   selv.
4. **Tilgang for den som tester i Expo Go.** Inviter brukeren til prosjektet
   på expo.dev, og be dem logge inn i Expo Go med den kontoen.

## Åpne `test` i Expo Go

Åpne denne lenken på telefonen (eller lag en QR-kode av den):

```
exp://u.expo.dev/6964d6ce-fb5a-41ef-9adf-90092a7a6139?channel-name=test
```

Etter første gang ligger prosjektet under «Recently opened» i Expo Go.

## Når det ikke holder med en oppdatering

En oppdatering bytter bare JavaScript. Nye native pakker (alt som legges til
under `plugins` i `app.json`, eller en ny `expo-*`-pakke med native kode) krever
ny build. Expo Go har alle Expo-pakkene innebygd, så der virker det likevel.

`runtimeVersion` følger SDK-versjonen (`exposdk:58.0.0`), fordi det er det
Expo Go godtar. Ulempen: legger du til en native pakke uten å bytte SDK, får
kunden en oppdatering appen deres ikke tåler. Regelen er derfor: **ny native
pakke → ny preview-build før neste `kunde`-oppdatering.**

Expo Go følger alltid nyeste SDK. Når en ny SDK kommer, slutter `test` å
virke i Expo Go til prosjektet er oppgradert.
