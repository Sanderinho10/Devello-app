# Manuell sjekkliste — Devello Montør

Gjøres på en ekte telefon med en development- eller preview-build, mot en
nettapp med ordre-modulen på (lokalt eller app.devello.no). Kryss av.

## Innlogging

- [ ] Riktig e-post og passord → ordrelista. Lukk appen helt, åpne igjen → fortsatt innlogget.
- [ ] Feil passord → rød melding «Feil e-post eller passord.» øverst, ingen Alert.
- [ ] Bruker i et selskap uten ordre-modul → skjerm med serverens tekst og «Logg ut».
- [ ] «Glemt passord?» viser bare teksten om nettappen.

## Ordreliste

- [ ] Pågår · Åpne · Ferdige. Standard Pågår; tom → Åpne.
- [ ] Søk på nummer (prefiks), kundenavn og tittel filtrerer lokalt.
- [ ] Pull-to-refresh henter på nytt.
- [ ] Flymodus → banner «Ingen dekning — viser sist hentet», lista er der fortsatt.
- [ ] Rad viser `#nr · kunde`, tittel, adresse, «Mine timer: 7,5 t».

## Ordre

- [ ] Trykk på telefonnummer → ringer. Trykk på adresse → kart (Apple Maps / Google Maps).
- [ ] Åpen ordre viser «Start jobben»; pågår viser «Merk som ferdig». Aldri «Avbryt».
- [ ] «Merk som ferdig» spør «Merk ordren som ferdig? Kontoret får beskjed.» — Avbryt gjør ingenting.
- [ ] Bekreft → status «Ferdig» med en gang, «Sendes …» til den er sendt; nettappen viser ferdig.

## Timer (online)

- [ ] «+ Før timer» → dato (I dag / I går / Annen dag), timetype-chips, stepper, 1 · 2 · 4 · 7,5, notat.
- [ ] Lagre → rada ligger øverst med en gang, «Sendes …» forsvinner innen få sekunder.
- [ ] Nettappen viser timene. Sist brukte timetype ligger først neste gang.
- [ ] Langt trykk på egen rad → «Slett timeføringen». Andres rader kan ikke slettes.

## Offline-runde (det viktigste)

1. [ ] Slå på flymodus.
2. [ ] Før timer → rada vises med «Sendes …».
3. [ ] Materiell → søk gir «Søk krever nett». «Fant du ikke varen? Skriv den inn» → fritekst → lagre.
4. [ ] Nytt notat med tekst og 2 bilder fra kameraet → lagre. Notatet og miniatyrene vises.
5. [ ] Meg → «3 venter · 0 feilet» (4 med bildene).
6. [ ] Slå av flymodus → alt sendes i løpet av sekunder, merkene forsvinner.
7. [ ] Nettappen har timene, materiellet, notatet og bildene **én gang hver**.

## Drept midt i en sending

- [ ] Flymodus, før 5 timeføringer. Slå av flymodus og drep appen (sveip bort) innen et sekund.
- [ ] Åpne appen → resten sendes. Nettappen har nøyaktig 5 rader, ingen dobbelt.

## Materiell

- [ ] Søk «pfxp» → treff med grossist, elnummer, navn, enhet, pris per enhet.
- [ ] Trykk treff → mengde-ark med enhet ved tallet → Legg til → rad i lista.
- [ ] Skann EAN på en Onninen-vare → ett treff går rett til mengde.
- [ ] Skann en ukjent EAN → «Fant ikke varen — skriv den inn» → fritekst.
- [ ] Linje fra faktura viser «Fra faktura» og kan ikke slettes.

## Notater

- [ ] Nytt notat, «Velg bilde» med 3 bilder → miniatyrer med ×, ett fjernes.
- [ ] Lagre → notat med navn, tid, tekst, miniatyrer. Trykk miniatyr → fullskjerm.
- [ ] Bildet i nettappen er komprimert (under ~500 KB, 1600 px lengste side).

## Feil fra serveren

- [ ] Før timer på en ordre kontoret i mellomtida har fakturert → under Meg: «Feilet: Ordren er avsluttet …», «Prøv igjen» / «Slett».
- [ ] Bytt passord i nettappen mens appen er åpen → appen logger ut ved neste kall; utboksen ligger igjen etter ny innlogging.

## Logg ut

- [ ] Med usendte føringer → Alert «Du har N usendte føringer. Logg ut likevel?». Logg inn igjen → de sendes.
