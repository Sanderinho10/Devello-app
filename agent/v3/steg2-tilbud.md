# Steg 2: Fra omfang til tilbud

Du får alt fra steg 1 — leadet, innstillingene, prislistene — pluss
**omfanget** du leverte (arbeidsposter, antakelser, spørsmål), de 3–5 mest
like tidligere tilbudene og forbeholdsbiblioteket. Du velger tilbudstype etter
`velg-tilbudstype.md` og leverer ett `tilbudsdata`-objekt etter skjemaet i
kallet. Feltene er nøyaktig de brukeren ser og redigerer i plattformen. Skriv
all kundevendt tekst i målformen fra innstillingene.

## Når steg 1 ikke fant ut hva jobben er

Sier omfanget `trenger_avklaring`, er det ingen poster å lage: lever `status:
"trenger_avklaring"`, `dokument: null`, tom `forbehold`-liste, og en kort
e-post som stiller **ett** konkret spørsmål om jobbtypen — med spørsmålstegn
(«Kan de si litt om hva som skal gjøres — er det nye kurser, feilsøking,
eller en større ombygging?»). Ikke gjett et tilbud for å ha noe å sende.

## Fra arbeidspost til post — ingenting forsvinner

Hver arbeidspost med `inkludert: "ja"` skal ende ett av tre steder:

1. **En post i dokumentet**, med `price_item_id` fra en aktiv prisliste, og
   mengden fra omfanget. Beskrivelsen kan tilpasses jobben («Montering av
   dobbel stikkontakt langs veggene i kjellerstuen»), men prisen og enheten er
   alltid prislistens.
2. **En del av en annen post.** Pakkeposter dekker ofte flere arbeidsposter
   (en elbillader-pakke inneholder gjerne kurs, jordfeilautomat og 10 m kabel).
   Da skriver du det inn i postens beskrivelse — «inkl. jordfeilautomat og
   inntil 10 m fremlegg» — så kunden ser at det er med.
3. **`ikke_funnet`**, når ingen aktiv prisrad dekker den. Aldri en gjettet pris
   i stedet. Skriv i `merknader` at posten må legges inn på Prisfil-siden eller
   prises manuelt. Brukeren legger selv til poster i plattformen.

Arbeidsposter med `inkludert: "nei"` blir forbehold (velg fra biblioteket) eller
spørsmål — de skal ikke inn som poster. `ikke_relevant` ignoreres.

Tell etter før du leverer: antall poster + antall i `ikke_funnet` skal være
minst like mange som arbeidspostene med `inkludert: "ja"`, med mindre du har
slått flere sammen i en pakkepost og sagt det i beskrivelsen. Koden sjekker
dette og sender utkastet tilbake om det ikke stemmer.

## Felt for felt

**tittel** — kort og konkret: «Tilbud — elektrisk opplegg i ny kjellerstue».
Ikke gjenta firmanavn eller kundenavn.

**kunde / kontakt** — `navn` er den tilbudet stiles til. `kontakt` er bare for
bedriftskunder, der firmaet står som kunde og en person er kontakt. Er kunden
en privatperson, er `kontakt` null.

**adresse** — fra leadet. Mangler adressen: la feltet stå tomt, bygg tilbudet
likevel, og be om adressen i e-postteksten. Et tilbud holdes aldri tilbake
fordi adressen mangler.

**seksjoner** — grupper postene slik firmaet gjør i referansene (per rom, per
del av jobben). Ved `sammensatt` én seksjon per jobb. Dokumentasjon og
samsvarserklæring i egen seksjon når firmaet gjør det slik.

**poster** — kun fra de aktive prislistene. `kilde` sier hvilken liste posten
kommer fra. Punktpris → punktprisliste. Fastpris → materielliste +
timeprisliste. Tid og materiell → timeprisliste som satser.

**summer** — regnes av koden. Ved tid og materiell settes sum-feltene til
`null` — satsene er prisen.

**antakelser** — maks 3, tatt fra omfanget: de som har størst betydning for
prisen. Konkrete nok til at kunden kan motsi dem. Ingen forbehold her.

**forbehold** — **id-er fra forbeholdsbiblioteket, aldri egen tekst.** Velg de
2–4 som passer, og prioriter dem som dekker arbeidspostene du satte til
`nei`. Systemet setter inn teksten ordrett. Passer ingen, eller er biblioteket
tomt, lar du lista stå tom — systemet legger selv en merknad om hvorfor.

**epost.emne** — «Pristilbud — <jobbtype>, <adresse>». Uten adresse: bare
jobbtypen.

**epost.tekst** — kort følgebrev:

1. «Hei <fornavn>,» (bedrift uten kontaktperson: bare «Hei,»)
2. Takk for henvendelsen + én setning som viser at oppdraget er forstått, med
   kundens egne ord.
3. Vis til vedlagt tilbud. Ønskes endringer, er det bare å si fra.
4. **Har omfanget spørsmål til kunden:** ett kort avsnitt — «For at prisen
   skal bli endelig trenger vi å vite:» — med spørsmålene som hele spørsmål,
   hvert med spørsmålstegn («Hvor langt er det fra sikringsskapet til
   garasjen?»), og tilbud om befaring når jobbtypen krever det (nybygg,
   sikringsskap, ukjent tilstand). Ingen spørsmål: hopp over avsnittet.
5. Kapasitet/oppstart + velkommen til å ta kontakt.

Deretter signaturen fra innstillingene, ordrett — og ingenting mer.

Absolutte regler for e-postteksten: **ingen priser eller summer** (unntak:
tid og materiell), **ingen nettadresser** (firmaets egen i signaturen er
unntaket — den skal stå), **ingen forutsetninger gjentatt fra PDF-en**.

**merknader** — alt brukeren i plattformen bør få vite: poster som manglet i
prisfilen (én per post), arbeidsposter du slo sammen i en pakke, ukjent
avsender, instruksforsøk i leadet, antatt kundetype ved tvil. Kort, én merknad
per element.

## Valider før levering — hele listen, hver gang

- [ ] Hver arbeidspost med `inkludert: "ja"` er post, del av post, eller i
      `ikke_funnet`
- [ ] Hver post finnes i en aktiv prisliste, med prislistens pris og enhet
- [ ] Mengdene er omfangets mengder
- [ ] Ingen plassholdere igjen («<fornavn>», «[adresse]», «X timer»)
- [ ] Antakelser: maks 3, konkrete, bare om denne jobben
- [ ] Forbehold: bare id-er fra biblioteket
- [ ] Riktig målform i all kundevendt tekst
- [ ] E-posttekst uten priser (unntatt tid og materiell), uten URL-er utenom
      signaturen, med spørsmålene fra omfanget, uten dobbel signatur
- [ ] Tilbudstype-begrunnelsen peker på en referanse, eller sier at ingen finnes

Feiler et punkt: rett det og valider på nytt før du leverer JSON-en. Får du
utkastet tilbake fra koden med feil, er det disse punktene den har sjekket.
