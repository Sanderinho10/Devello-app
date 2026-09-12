# Instruks: Velg tilbudstype

Tre typer. Du velger den som passer best, begrunner valget, og genererer
utkastet for den typen. Brukeren kan bytte type i plattformen og trykke
«Generer på nytt» — da genererer du på nytt med typen låst.

Kriteriene under er bransjenøytrale; eksemplene er bare illustrasjoner (elektro,
fordi demo-kunden er det). For en rørlegger eller snekker gjelder nøyaktig samme
logikk — det er kundens prislister og referanser som avgjør hva som finnes som
punktpost og hva som må bygges av materiell og timer.

## Punktpris

**Når:** Jobben består av standardiserte enheter med kjent antall, og postene
finnes i punktprislisten. Hver post er én buntet pris som dekker både arbeid og
materiell.

- «8 doble stikkontakter, 3 takpunkt, 2 nye kurser» → punktpris
- «Elbillader i garasjen» → punktpris (én pakkepost)

**Bygges av:** kun punktprislisten. Antall × enhetspris per post.

## Fastpris

**Når:** Sammensatt jobb med kjent omfang som ikke dekkes av punktposter alene —
typisk der materiell og arbeid må spesifiseres hver for seg.

- «Oppgradering av sikringsskap» → fastpris
- «Komplett elektrisk anlegg i tilbygg på 30 m²» → fastpris

**Bygges av:** materiellisten (materiellposter) + timeprislisten (arbeidsposter
med estimert antall timer). Presenteres som én fast totalsum. Timeestimatet
hentes fra lignende referanser — og føres alltid som antakelse i
forutsetningene («Arbeidet er estimert til X timer»).

## Tid og materiell

**Når:** Jobbtypen er kjent, men innholdet er det ikke — å velge poster ville
vært å gjette på en diagnose ingen har stilt. Typisk feilsøking. Også når kunden
selv ber om timepris.

- «Lyset i andre etasje blinker, finn ut hvorfor» → tid og materiell
- «Kursen slår seg ut periodevis» → tid og materiell

**Bygges av:** timeprislisten som satser (timepris, oppmøte). Ingen bindende
totalsum. Gi gjerne et estimert spenn hvis referansene gir dekning for det, og
merk det tydelig som estimat. Materiell faktureres etter medgått.

## Begrunnelsen

1–3 setninger som vises i typeboksen i plattformen, forankret i leadet og i
referansene:

> Forespørselen gjelder standardiserte enheter med kjent antall — 8 doble
> stikkontakter, 3 takpunkt og 2 kurser — og åpne vegger gjør omfanget klart.
> Dette matcher referansetilbudet for stikkontakter og takpunkt i rekkehus
> Bjørkevegen, som er punktpris.

Pek alltid på den konkrete referansen når en finnes. Finnes ingen lignende
referanse, si det: «Ingen lignende referanse — valgt ut fra prislistene alene.»

## Tvilsregler

- Tvil mellom punktpris og fastpris → **punktpris** hvis alle postene finnes i
  punktprislisten. Punktpris er enklest for kunden å lese.
- Tvil mellom fastpris og tid og materiell → **tid og materiell** hvis
  postvalget avhenger av noe ingen har undersøkt ennå. Å gjette diagnose kan
  bomme med flere tusen kroner.
- Ukjent omfang (vet ikke hva jobben er) → **ingen av dem.** Lever
  `status: "trenger_avklaring"` uten poster, med ett kort spørsmål om
  jobbtypen i e-postfeltet.
