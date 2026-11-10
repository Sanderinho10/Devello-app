# Manuell sjekkliste — Devello Montør

Gjøres på en ekte telefon med en development- eller preview-build, mot en
nettapp med ordre-modulen på (lokalt eller app.devello.no). Kryss av.

## Innlogging

- [ ] Riktig e-post og passord → programmet. Lukk appen helt, åpne igjen → fortsatt innlogget.
- [ ] Logg ut og inn igjen → rett til programmet (ikke «Unmatched Route»).
- [ ] Feil passord → rød melding «Feil e-post eller passord.» øverst, ingen Alert.
- [ ] Bruker i et selskap uten ordre-modul → skjerm med serverens tekst og «Logg ut».
- [ ] «Glemt passord?» viser bare teksten om nettappen.

## Program

- [ ] Programmet er første fane. Avtaler i dag og 14 dager fram, gruppert per dag, «I dag» og «I morgen» først.
- [ ] Oppdrag viser tid, «Oppdrag»-merke, tittel, `#nr · kunde` og adresse. Trykk → ordren.
- [ ] Heldagsavtale (ferie) viser «Hele dagen» uten klokkeslett. Møte/fravær/annet er ikke trykkbare.
- [ ] «Hele firmaet» viser kollegenes avtaler med navn.
- [ ] Sett opp et oppdrag i går i nettappen uten å føre timer → «Timer som ikke er ført» øverst med «Før 5 t». Trykk → «Før timer» ferdig utfylt med ordre, dato, timer og timetype. Lagre → tilbake på programmet, forslaget er borte, og Ordrer-fanen er som før.
- [ ] Flymodus → banneret, og programmet som sist ble hentet vises.

## Ordreliste

- [ ] Pågår · Åpne · Ferdige med antall. Standard Pågår; tom → Åpne.
- [ ] Søk på nummer (prefiks), kundenavn og tittel leter i alle fanene, og viser status på hver rad.
- [ ] Pull-to-refresh henter på nytt.
- [ ] Flymodus → banner «Ingen dekning — viser sist hentet», lista er der fortsatt.
- [ ] Rad viser tittel, `#nr · kunde`, adresse, og egne timer til høyre («7,5 t»).

## Ordre

- [ ] «Ring» → ringer kunden. «Kart» → adressen i kart (Apple Maps / Google Maps).
- [ ] Fanene Timer · Materiell · Notater viser antall, og bytte mellom dem beholder ordren.
- [ ] Åpen ordre viser «Start jobben»; pågår viser «Merk som ferdig». Aldri «Avbryt».
- [ ] «Merk som ferdig» spør «Merk ordren som ferdig? Kontoret får beskjed.» — Avbryt gjør ingenting.
- [ ] Bekreft → status «Ferdig» med en gang, «Sendes …» til den er sendt; nettappen viser ferdig.

## Timer (online)

- [ ] «Før timer» → dato (I dag / I går / Annen dag), timetype-chips, stepper, 1 · 2 · 4 · 7,5, notat.
- [ ] «Avbryt» oppe til venstre lukker skjemaet uten å lagre.
- [ ] Lagre → «7,5 t lagret» øverst og et dunk i fingeren. Rada ligger under riktig dag med en gang, og dagssummen stemmer.
- [ ] Nettappen viser timene. Sist brukte timetype ligger først neste gang.
- [ ] Trykk på egen rad → ark med «Slett timeføringen». Andres rader kan ikke trykkes.

## Offline-runde (det viktigste)

1. [ ] Slå på flymodus.
2. [ ] Før timer → rada vises med «Sendes …».
3. [ ] Materiell → søk gir «Søk krever nett». «Fant du ikke varen? Skriv den inn» → fritekst → lagre.
4. [ ] Nytt notat med tekst og 2 bilder fra kameraet → lagre. Notatet og miniatyrene vises.
5. [ ] Meg-fanen har et merke med antallet. Meg → «3 venter · 0 feilet» (5 med bildene), bildene står som «Sendes etter notatet».
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

- [ ] Før timer på en ordre kontoret i mellomtida har fakturert → raden står som «Feilet» i lista, og under Meg med serverens melding. Trykk på raden → «Prøv igjen» / «Slett fra utboksen».
- [ ] Bytt passord i nettappen mens appen er åpen → appen logger ut ved neste kall; utboksen ligger igjen etter ny innlogging.

## Logg ut

- [ ] Med usendte føringer → Alert «Du har N usendte føringer. Logg ut likevel?». Logg inn igjen → de sendes.
- [ ] Logg inn som en annen bruker på samme telefon → utboksen er tom, og den forrige brukerens rader sendes ikke.
