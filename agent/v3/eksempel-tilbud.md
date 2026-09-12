# Eksempel: steg 2 — tilbud

Ett fullstendig eksempel på riktig tilbudsdata, bygget på elbillader-omfanget i
`eksempel-omfang.md`. Formen er det viktige: hver inkludert arbeidspost er
enten en post, nevnt i en pakkeposts beskrivelse, eller i `ikke_funnet`;
mengdene er omfangets; spørsmålene står i e-posten; ingen priser i e-posten.

`price_item_id`-ene her (`P010` …) er fra eksempelprislisten til demo-firmaet.
I et ekte tilbud bruker du **bare** id-er som står i prislistene i konteksten.

<example>
<omfang_sammendrag>
Inkludert (ja): laderboks (1), ny kurs (1), jordfeilautomat (1), kabel inntil
10 m, hulltaking (1), oppmøte/servicebil (1), dokumentasjon og samsvarserklæring.
Nei → forbehold/spørsmål: overspenningsvern, ombygging av skap.
Spørsmål: avstand skap → lader; overspenningsvern fra før?
</omfang_sammendrag>
<prisliste_utdrag>
- id: P070  liste: punktprisliste  navn: Pakkepris elbillader inntil 32 A 1-fase, ferdig montert  enhet: stk  enhetspris_eks_mva: 11160
  beskrivelse: Inkl. ladar, ny kurs med jordfeilautomat type B, inntil 10 m tilførsel, tilkopling og igangkøyring
- id: P071  liste: punktprisliste  navn: Kabelfremlegg utover 10 m, inkl. arbeid og materiell  enhet: m  enhetspris_eks_mva: 250
- id: P080  liste: punktprisliste  navn: Hulltaking gjennom trevegg  enhet: stk  enhetspris_eks_mva: 450
- id: P090  liste: punktprisliste  navn: Servicebil / oppmøte  enhet: stk  enhetspris_eks_mva: 560
- id: P093  liste: punktprisliste  navn: Dokumentasjon i hht NEK 400  enhet: stk  enhetspris_eks_mva: 0
- id: P094  liste: punktprisliste  navn: Samsvarserklæring  enhet: stk  enhetspris_eks_mva: 0
</prisliste_utdrag>
<forbeholdsbibliotek_utdrag>
- F1: Plass og kapasitet i sikringsskapet  (brukt 12 ganger)
- F2: Dersom overspenningsvern ikke er montert fra før vil dette komme som tillegg  (brukt 11 ganger)
- F3: Eventuell graving av grøfter for kabelforlegging under bakke er ikke med i pris  (brukt 9 ganger)
- F4: Annet arbeid enn spesifisert i tilbud kan utføres etter medgått tid og materiell eller etter avtalt pris  (brukt 15 ganger)
</forbeholdsbibliotek_utdrag>
<tilbudsdata>
{
  "tilbudstype": "punktpris",
  "typebegrunnelse": "Ett standardisert ladepunkt med kjent omfang, dekket av pakkeposten i punktprislisten. Samme mønster som referansetilbudet «Elbillader, enebolig» (punktpris).",
  "status": "utkast",
  "dokument": {
    "kunde": { "navn": "Kari Berg", "kontakt": null, "epost": "kari.berg@gmail.com", "telefon": null, "adresse": "Sagevegen 4, Førde" },
    "tittel": "Tilbod — elbilladar i garasje",
    "seksjoner": [
      {
        "tittel": "Elbilladar",
        "poster": [
          { "price_item_id": "P070", "description": "Pakkepris elbilladar inntil 32 A 1-fase, ferdig montert og driftsett. Inkluderer ladar, ny kurs med jordfeilautomat, inntil 10 m tilførsel frå sikringsskap, tilkopling og igangkøyring.", "quantity": 1 },
          { "price_item_id": "P080", "description": "Hulltaking gjennom vegg mellom hus og garasje", "quantity": 1 },
          { "price_item_id": "P090", "description": "Servicebil / oppmøte", "quantity": 1 }
        ]
      },
      {
        "tittel": "Dokumentasjon",
        "poster": [
          { "price_item_id": "P093", "description": "Dokumentasjon av installasjonen i høve til NEK 400", "quantity": 1 },
          { "price_item_id": "P094", "description": "Samsvarserklæring for utført arbeid", "quantity": 1 }
        ]
      }
    ]
  },
  "antakelser": [
    "Framlegg frå sikringsskap til ladar er rekna til inntil 10 meter.",
    "Ladaren er 1-fase inntil 32 A og blir levert av oss."
  ],
  "forbehold": ["F1", "F2", "F4"],
  "estimat_timer": null,
  "epost": {
    "emne": "Pristilbod — elbilladar, Sagevegen 4",
    "tekst": "Hei Kari,\n\nTakk for førespurnaden. Slik vi forstår det ønskjer de ein elbilladar montert i garasjen som står vegg i vegg med huset, og det er straum i garasjen frå før.\n\nVedlagt ligg tilbodet vårt. Ønskjer de endringar, er det berre å seie frå.\n\nFor at prisen skal bli endeleg treng vi å vite kor langt det er frå sikringsskapet til der ladaren skal henge, og om det er montert overspenningsvern i skapet frå før. Vi kjem gjerne på ei kort befaring om det er enklast.\n\nVi har kapasitet til å starte i løpet av to–tre veker. Ta gjerne kontakt om noko er uklart.\n\nMed venleg helsing\nStar Elektro AS"
  },
  "ikke_funnet": [],
  "merknader": [
    "Ny kurs, jordfeilautomat og inntil 10 m kabel er dekt av pakkeposten P070 — sagt i postteksten.",
    "Overspenningsvern og eventuell ombygging av skapet er tatt som forbehold (F2, F1), ikkje prisa."
  ]
}
</tilbudsdata>
</example>
