# Tilbudsmail — SOP

> **Merk:** Denne filen er kilden til *hva som faktisk skal stå* i e-postteksten.
> Byggspec-en styrer format og output-mekanikk (PDF vs. ren tekst); innholdet
> kommer herfra. Innholdet under er utgangspunktet for Star Elektro og skal
> erstattes med / justeres mot den faktiske SOP-en før pilot.
>
> Filen blir lest ved generering (`src/lib/claude/sop.ts`) og lagt inn i prompten.
> Endrer du teksten her, endrer du hva agenten skriver — ingen kodeendring trengs.

## Fellesregler

- Skriv på norsk bokmål, uansett hvilken målform kunden brukte i forespørselen.
- Kort og konkret. Ingen salgsprat, ingen superlativer.
- Åpne med å referere til det kunden faktisk spurte om, med deres egne ord.
- Én tydelig oppfordring til slutt: svar på e-posten om noe er uklart.
- Aldri lov en leveringstid som ikke står i forespørselen eller prisfilen.
- Aldri regn ut priser i teksten. Alle tall kommer fra prisfilen og står i PDF-en.
- Avslutt med signaturen fra tone-innstillingene.

## Punktpris

E-postteksten er kort — PDF-en er hovedsaken.

Struktur:

1. Takk for forespørselen, gjenta hva jobben gjelder i én setning.
2. Vis til vedlagt tilbud, og nevn at hver post er en samlet pris som dekker
   både arbeid og materiell.
3. Nevn hva som eventuelt kommer i tillegg (framkjøring, uforutsett arbeid), hvis
   det er relevant for jobben.
4. Gyldighet: tilbudet gjelder i 30 dager fra dato.
5. Be dem ta kontakt om noe er uklart.

## Fastpris

Samme struktur som punktpris, men med ett tillegg:

- Forklar at tilbudet er spesifisert med materiell og timer hver for seg, og at
  **poenget med spesifikasjonen er å vise hva som kommer i tillegg** hvis jobben
  krever mer materiell eller flere timer enn det som står i spesifikasjonen.
- Vis til «Forutsetninger» i vedlegget for hva prisen bygger på.

## Tid og materiell

Ingen PDF. Hele tilbudet ligger i e-postteksten.

Struktur:

1. Takk for forespørselen, gjenta hva jobben gjelder i én setning.
2. Forklar hvorfor det blir løpende regning: omfanget lar seg ikke fastsette før
   arbeidet er i gang.
3. Timepris — hentes fra prisfilen (rad av typen `time`). Oppgi eks. mva.
4. Materiell — faktureres etter forbruk, med påslag i tråd med prisfilen.
5. Kjøring og eventuelle faste tillegg.
6. Tilbud om et estimat etter befaring, hvis kunden ønsker et tak.
7. Be dem ta kontakt om noe er uklart.

## Emnefelt

- Svarer vi på en tråd: behold emnet fra kunden.
- Ny e-post: `Tilbud — <kort jobbeskrivelse>`.
