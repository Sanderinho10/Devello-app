# Tilbudsmail — SOP

> **Merk:** Denne fila er kjelda for *kva som faktisk skal stå* i e-postteksten.
> Byggspec-en styrer format og output-mekanikk (PDF vs. rein tekst); innhaldet
> kjem herifrå. Innhaldet under er utgangspunktet for Star Elektro og skal
> erstattast med / justerast mot den faktiske SOP-en før pilot.
>
> Fila blir lest ved generering (`src/lib/claude/sop.ts`) og lagt inn i prompten.
> Endrar du teksten her, endrar du kva agenten skriv — ingen kodeendring trengst.

## Fellesreglar

- Skriv på norsk, same målform som kunden brukte i førespurnaden.
- Kort og konkret. Ingen salsprat, ingen superlativ.
- Opne med å referere til det kunden faktisk spurde om, med deira eigne ord.
- Éin tydeleg oppfordring til slutt: svar på e-posten om noko er uklart.
- Aldri lov ei leveringstid som ikkje står i førespurnaden eller prisfila.
- Aldri rekn ut prisar i teksten. Alle tal kjem frå prisfila og står i PDF-en.
- Avslutt med signaturen frå tone-innstillingane.

## Punktpris

E-postteksten er kort — PDF-en er hovudsaka.

Struktur:

1. Takk for førespurnaden, gjenta kva jobben gjeld i éi setning.
2. Vis til vedlagt tilbod, og nemn at kvar post er ein samla pris som dekker
   både arbeid og materiell.
3. Nemn kva som eventuelt kjem i tillegg (framkøyring, uføresett arbeid), dersom
   det er relevant for jobben.
4. Gyldigheit: tilbodet gjeld i 30 dagar frå dato.
5. Be dei ta kontakt om noko er uklart.

## Fastpris

Same struktur som punktpris, men med eitt tillegg:

- Forklar at tilbodet er spesifisert med materiell og timar kvar for seg, og at
  **poenget med spesifikasjonen er å vise kva som kjem i tillegg** dersom jobben
  krev meir materiell eller fleire timar enn det som står i spesifikasjonen.
- Vis til «Føresetnader» i vedlegget for kva prisen byggjer på.

## Tid og materiell

Ingen PDF. Heile tilbodet ligg i e-postteksten.

Struktur:

1. Takk for førespurnaden, gjenta kva jobben gjeld i éi setning.
2. Forklar kvifor det blir løpande regning: omfanget lèt seg ikkje fastsetje før
   arbeidet er i gang.
3. Timepris — hentast frå prisfila (rad av typen `time`). Oppgi eks. mva.
4. Materiell — fakturerast etter forbruk, med påslag i tråd med prisfila.
5. Køyring og eventuelle faste tillegg.
6. Tilbod om eit estimat etter befaring, dersom kunden ønskjer eit tak.
7. Be dei ta kontakt om noko er uklart.

## Emnefelt

- Svarar vi på ein tråd: behald emnet frå kunden.
- Ny e-post: `Tilbod — <kort jobbskildring>`.
