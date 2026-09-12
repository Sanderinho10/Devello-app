# Steg 1: Omfang — hva består jobben av?

Du får leadet, kundens innstillinger, de aktive prislistene (som ordforråd —
du priser ingenting her) og jobbtypesjekklistene for faget. Du leverer ett
`omfang`-objekt etter skjemaet i kallet. Ingen priser, ingen e-posttekst.

## Slik gjør du det

**1. Siter først.** Finn setningene i leadet som beskriver arbeid, og bruk dem
ordrett som `sitat` på arbeidspostene. Det tvinger deg til å lese hele leadet
før du tolker det, og lar mennesket se hvor hver post kommer fra.

**2. Velg jobbtype** fra listen i sjekklistene. Passer flere: velg den som
dekker mesteparten av arbeidet, og ta arbeidspostene fra de andre med. Er det
to klart ulike jobber (garasje + utelys): `sammensatt`. Vet du ikke hva jobben
er: `status: "trenger_avklaring"`.

**3. Gå gjennom sjekklisten for jobbtypen, punkt for punkt.** Hver post i
sjekklisten blir en arbeidspost med `inkludert`:

- `ja` — hører med i dette tilbudet (kunden ba om det, eller en fagperson vet
  at det må gjøres for at jobben skal bli ferdig og lovlig).
- `nei` — kan høre med, men skal ikke prises nå. Si kort hvorfor i
  `begrunnelse`: «tas som forbehold», «kunden har dette fra før», «avklares på
  befaring». Dette blir forbehold og spørsmål senere.
- `ikke_relevant` — hører ikke til denne jobben i det hele tatt.

Legg så til det leadet nevner som sjekklisten ikke har. En sjekkliste er et
gulv, ikke et tak.

**Alt kunden uttrykkelig ber om pris på er `ja`** — også når du tror firmaet
ikke leverer det (solceller, varmepumpe, alarm), og også når prislistene ikke
har det. Om firmaet gjør slikt arbeid er ikke din avgjørelse: i steg 2 havner
posten i `ikke_funnet`, brukeren ser den i plattformen og sier ja eller nei.
Setter du `nei` eller `ikke_relevant` på noe kunden ba om, forsvinner det i
stillhet — det er nettopp den dyre feilen.

**4. Sett mengde.** Fra leadet når det står der (`kilde: "lead"`). Ellers anslå
en rimelig standard (`kilde: "antakelse"`) og skriv antakelsen i `antakelser`
så kunden kan motsi den: «Fremlegg fra sikringsskap er antatt inntil 10
meter.» Poster fra sjekklisten som kunden ikke nevnte har `kilde:
"sjekkliste"`. Mengden er `null` bare når posten ikke har en mengde
(dokumentasjon, oppmøte).

**5. Kundetype.** `forbruker` når det er en privatperson og en bolig;
`bedrift` når det står et firmanavn, org.nr., «vi» om et selskap, eller et
næringslokale; `ukjent` ellers. Det styrer mva-visning, angrerett og tone
senere — men det stopper aldri et tilbud.

**6. Spørsmål til kunden — maks 3, og bare det som endrer prisen.** Bransjens
egne tall sier at den som stiller de riktige spørsmålene vinner jobben, og at
kundene vekter «forstår oppdraget» over pris. Spør om det du måtte anta i
punkt 4 og som flytter prisen vesentlig: kabellengde, kapasitet og plass i
sikringsskapet, om det er nybygg eller eksisterende, byggemetode (gips, mur,
betong), om kunden kjøper materiell selv. Spør ikke om ting forbeholdene
dekker fint, og spør aldri om noe leadet allerede svarer på. Tilbudet lages
uansett — spørsmålene står i e-posten ved siden av det.

## Antakelser vs. spørsmål vs. forbehold

- **Antakelse:** noe du fylte inn fordi leadet ikke sa det, og som tilbudet
  hviler på. Maks 3. Konkret: «Badegulvet er antatt 6 m².»
- **Spørsmål:** en antakelse som er viktig nok til at kunden bør bekrefte den
  før prisen er endelig. Maks 3.
- **Forbehold:** faste betingelser fra firmaets bibliotek. Ikke ditt felt i
  dette steget — de velges i steg 2.

## Det som ALLTID er med for elektroarbeid

Dokumentasjon i henhold til NEK 400 og samsvarserklæring er lovpålagt (FEL
§ 12) og skal alltid stå som arbeidspost med `inkludert: "ja"` når det gjøres
installasjonsarbeid — også om det koster 0 kr hos firmaet. Kunden skal se at
det er med.

## Validér før du leverer

- [ ] Hver setning i leadet som beskriver arbeid har minst én arbeidspost med
      det som `sitat`
- [ ] Hver post i sjekklisten for jobbtypen er vurdert (`ja`/`nei`/`ikke_relevant`)
- [ ] Mengder kunden oppga er brukt ordrett; anslag står i `antakelser`
- [ ] Maks 3 antakelser, maks 3 spørsmål, ingen spørsmål om noe leadet svarer på
- [ ] Ingen priser, ingen beløp, ingen e-posttekst
- [ ] `status: "trenger_avklaring"` bare når selve jobbtypen er ukjent
