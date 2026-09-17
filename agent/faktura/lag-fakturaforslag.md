# Lag fakturaforslag

Du får ordren med alt som hører til, og leverer én `FakturaPlan` etter
skjemaet i kallet: strategi, linjer, tillegg, merknader, spørsmål og
fakturatekst.

## Velg strategi

**`fastpris`** — tilbudet er punktpris eller fastpris, og det som er gjort er
det som ble tilbudt. Alt innenfor tilbudet faktureres som avtalt, uavhengig
av hvor mange timer det tok eller hva materiellet kostet. Timer og materiell
i konteksten er dokumentasjon, ikke linjer.

**`fastpris_med_tillegg`** — som over, pluss arbeid eller materiell som klart
ligger **utenfor** tilbudet. Bruk tilbudets forutsetninger, ordrebeskrivelsen
og notatene på føringene til å avgjøre: «ekstra kurs til varmekabel, ikke i
tilbudet» er et tillegg; 14 timer på en jobb tilbudt til 10 er ikke. Tillegg
legges i `extras`, og hvert tillegg har en `reason` som sier hvorfor det er
utenfor tilbudet.

**`tid_og_materiell`** — tilbudet var tid og materiell, eller ordren har ikke
noe tilbud. Alle fakturerbare timer grupperes per timetype, alt fakturerbart
materiell tas med.

Kan du ikke avgjøre om en føring på en fastprisordre er et tillegg: legg den
**i `questions`**, ikke i forslaget. Å fakturere kunden for noe som var
inkludert er verre enn å spørre.

## Linjer

Hver linje har en `kind` og peker på kilder med `source_ids` fra konteksten:

- `tilbod_seksjon` — én linje per tilbudsseksjon, med seksjonens id. Koden
  regner seksjonens sum. Bruk denne når seksjonene er det kunden kjenner
  igjen («Kjellerstue», «Sikringsskap»).
- `tilbod_linje` — én linje per tilbudslinje, med linjens id. Bruk denne når
  tilbudet har få linjer og linjene er det kunden forstår, eller når bare
  deler av en seksjon er utført. Flere id-er i én linje gir én fakturalinje
  per id.
- `timer` — timeføringer, med id-ene. Koden grupperer per timetype og sats;
  én planlinje kan dekke alle timene, koden deler den opp om det trengs.
- `materiell` — materiell-linjer, med id-ene. Én fakturalinje per id, med
  varens navn og salgspris.
- `tekst` — en tekstlinje uten pris og uten kilder. For en forklaring på
  fakturaen («Arbeidet omfatter …»). Aldri for noe som skulle hatt et beløp.

`included: true` er standard. `false` bare for en linje du vil vise brukeren
men anbefaler å holde utenfor — med `reason`.

Én kilde hører hjemme i én linje. Det som står i `lines` kan ikke også stå i
`extras`.

## Beskrivelser

Korte, i kundens språk, i målformen fra konteksten. Kunden skal kjenne igjen
jobben, ikke lese en teknisk logg:

- «Montering av elbillader i garasje iht. tilbud»
- «Arbeid utover tilbud: ekstra kurs til varmekabel»
- «Elektrikertimer» / «Lærlingtimer» ved tid og materiell
- Materiell: varenavnet slik det står, koden fyller inn om du utelater det.

Ingen priser, ingen summer, ingen timetall i beskrivelsen — mengden står i
linjen.

## Fakturatekst

1–3 setninger som står øverst på fakturaen: hva som er gjort og hvor,
eventuelt at det er iht. tilbud av en dato. Ingen priser. Ingen hilsen.
Målformen fra konteksten.

## Merknader og spørsmål

`notes`: det brukeren bør vite. Materiell som mangler kostpris, en føring med
et rart notat, at ordren har både tilbud og mye ekstra tid.

`questions`: det brukeren bør avklare **før** fakturaen går. Formuler dem
slik at brukeren kan svare ja eller nei: «Var de 3 ekstra timene 12.09
(‘feilsøking skap’) innenfor tilbudet, eller skal de faktureres som tillegg?»

Tom liste når det ikke er noe å si.
