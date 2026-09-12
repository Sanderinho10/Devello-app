# Eksempler: steg 1 — omfang

To fullstendige eksempler på riktig omfang. Formen er det viktige: hver setning
i leadet er sitert, hele sjekklisten er vurdert, mengder har kilde, og
spørsmålene er få og prisbærende. Innholdet er fiktivt (demo-firma på
nynorsk); `kva` og `begrunnelse` er interne felt og står på bokmål.

<example>
<lead>
Emne: Pris på elbillader i garasjen?
Fra: Kari Berg <kari.berg@gmail.com>

Hei! Vi har nettopp kjøpt elbil og treng ein ladar montert i garasjen i
Sagevegen 4 i Førde. Garasjen står vegg i vegg med huset (enebustad), og det
er straum i garasjen frå før.

Kva kostar det?
</lead>
<omfang>
{
  "jobbtype": "elbillader",
  "kundetype": "forbruker",
  "status": "utkast",
  "arbeidsposter": [
    { "kva": "Laderboks, levert og montert av firmaet", "sitat": "treng ein ladar montert i garasjen", "mengde": 1, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Ny kurs fra sikringsskap til lader", "sitat": "", "mengde": 1, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": "en lader skal ha egen kurs" },
    { "kva": "Jordfeilautomat / vern for laderkursen", "sitat": "", "mengde": 1, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Kabel og fremlegg fra skap til garasje", "sitat": "Garasjen står vegg i vegg med huset", "mengde": 10, "enhet": "m", "kilde": "antakelse", "inkludert": "ja", "begrunnelse": "vegg i vegg — kort fremlegg antatt" },
    { "kva": "Overspenningsvern i skapet", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "nei", "begrunnelse": "ukjent om det finnes — tas som forbehold" },
    { "kva": "Lastbalansering / effektstyring", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "nei", "begrunnelse": "ikke etterspurt; én lader i enebolig" },
    { "kva": "Hulltaking gjennom vegg", "sitat": "vegg i vegg med huset", "mengde": 1, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": "ett gjennomføringspunkt mellom hus og garasje" },
    { "kva": "Graving / kabelbeskyttelse utendørs", "sitat": "", "mengde": null, "enhet": "m", "kilde": "sjekkliste", "inkludert": "ikke_relevant", "begrunnelse": "garasjen er sammenbygd med huset" },
    { "kva": "Ombygging av sikringsskap ved plassmangel", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "nei", "begrunnelse": "avklares på befaring — forbehold" },
    { "kva": "Oppmøte / servicebil", "sitat": "", "mengde": 1, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Dokumentasjon og samsvarserklæring", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": "lovpålagt" },
    { "kva": "Melding til nettselskap", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ikke_relevant", "begrunnelse": "én 1-fase lader krever normalt ikke melding" }
  ],
  "antakelser": [
    "Fremlegg frå sikringsskap til ladar er rekna til inntil 10 meter.",
    "Ladaren er 1-fase inntil 32 A og blir levert av oss."
  ],
  "sporsmal_til_kunden": [
    "Kor langt er det frå sikringsskapet til der ladaren skal henge?",
    "Er det montert overspenningsvern i sikringsskapet frå før?"
  ]
}
</omfang>
</example>

<example>
<lead>
Emne: Elektrisk i nybygg — komplett
Fra: Roger Myklebust <roger.myklebust@gmail.com>

Hei,

Vi byggjer einebustad i Fjellvegen 30 og treng pris på det elektriske:

- 24 doble stikkontaktar fordelt på stove, kjøkken, tre soverom og gang
- 14 takpunkt med brytar
- 6 nye kursar frå sikringsskapet
- Nytt sikringsskap med jordfeilvern
- 4 utelys med sensor
- Opplegg for komfyr og oppvaskmaskin

Veggane er opne. Kan de gi ein samla pris?
</lead>
<omfang>
{
  "jobbtype": "nybygg_tilbygg_komplett",
  "kundetype": "forbruker",
  "status": "utkast",
  "arbeidsposter": [
    { "kva": "Punkt for dobbel stikkontakt", "sitat": "24 doble stikkontaktar fordelt på stove, kjøkken, tre soverom og gang", "mengde": 24, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Takpunkt med bryter", "sitat": "14 takpunkt med brytar", "mengde": 14, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Ny kurs fra sikringsskap", "sitat": "6 nye kursar frå sikringsskapet", "mengde": 6, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Nytt sikringsskap med jordfeilautomater", "sitat": "Nytt sikringsskap med jordfeilvern", "mengde": 1, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Overspenningsvern i nytt skap", "sitat": "", "mengde": 1, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": "krav i nytt anlegg" },
    { "kva": "Utelys med sensor", "sitat": "4 utelys med sensor", "mengde": 4, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Punkt for komfyr / platetopp inkl. komfyrvakt", "sitat": "Opplegg for komfyr og oppvaskmaskin", "mengde": 1, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": "komfyrvakt er påkrevd i nye anlegg" },
    { "kva": "Punkt for oppvaskmaskin", "sitat": "Opplegg for komfyr og oppvaskmaskin", "mengde": 1, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": null },
    { "kva": "Inntak og hovedsikring", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "nei", "begrunnelse": "ikke nevnt — avklares: er inntak bestilt fra nettselskap?" },
    { "kva": "Jording: hovedjord og utjevning", "sitat": "", "mengde": 1, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": "hører til nytt anlegg" },
    { "kva": "Bad: varmekabel, lys, stikk, vifte, VVB", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "nei", "begrunnelse": "ikke nevnt i listen — spørsmål til kunden" },
    { "kva": "Varmekabel / gulvvarme i øvrige rom", "sitat": "", "mengde": null, "enhet": "m²", "kilde": "sjekkliste", "inkludert": "nei", "begrunnelse": "ikke nevnt — spørsmål" },
    { "kva": "Rør og føringsveier i åpne vegger", "sitat": "Veggane er opne", "mengde": null, "enhet": "stk", "kilde": "lead", "inkludert": "ja", "begrunnelse": "inngår i punktprisene ved åpne vegger" },
    { "kva": "Svakstrøm: data, TV, ringeklokke", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "nei", "begrunnelse": "ikke etterspurt" },
    { "kva": "Kursfortegnelse, dokumentasjon og samsvarserklæring", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": "lovpålagt" },
    { "kva": "Rigg, kjøring og oppmøte over byggeperioden", "sitat": "", "mengde": null, "enhet": "stk", "kilde": "sjekkliste", "inkludert": "ja", "begrunnelse": "flere oppmøter i et nybygg" }
  ],
  "antakelser": [
    "Prisen gjeld opne veggar med fri framføring, slik de skriv.",
    "Bad og eventuell golvvarme er ikkje med — dei er ikkje nemnde i lista."
  ],
  "sporsmal_til_kunden": [
    "Er strøminntaket bestilt frå nettselskapet, eller skal vi ta det?",
    "Skal badet (varmekabel, lys, stikk, vifte) vere med i tilbodet?",
    "Kva golvareal skal eventuelt ha varmekabel?"
  ]
}
</omfang>
</example>
