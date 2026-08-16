# Leads (speiler Leads-siden i plattformen)

Arbeidsflaten. To måter et lead kommer inn på i produksjon:

1. **Postkasse-skann** — «hent ut leads» leser tilkoblet Microsoft
   365-postkasse. Alt som beskriver et oppdrag noen vil ha pris på er et lead,
   uansett avsender. Nyhetsbrev, fakturaer og reklame er det ikke.
2. **Tekst lagt inn i plattformen** — f.eks. stikkord fra en telefonsamtale.
   Samme løype: agenten antar heller enn å spørre, og leverer utkast.

I test her ligger leads som filer i `innkommende/` (eller limes inn i
test-chatten).

## Hva som skjer med et lead

Agenten leverer `leads/<lead-id>/tilbudsdata.json` → leadet står som **Utkast
klart** i listen. Deretter er agenten ute av bildet:

- Brukeren redigerer utkastet **direkte i plattformens felt** — aldri via
  agenten.
- «Generer på nytt» (evt. med annen tilbudstype) er eneste vei tilbake til
  agenten, og gir et helt nytt utkast.
- «Bekreft og lag kladd» → plattformen lagrer endelig versjon
  (`status: "bekreftet"`), genererer PDF, lager Outlook-kladd med PDF vedlagt
  (brukeren sender selv), og skriver oppføringen i `referanseliste/`.

I test simulerer utvikleren dette i chatten: «generer på nytt som fastpris»,
«bekreft». Sluttkunden bruker aldri chat.

## Testleads som følger med

| Fil | Forventet tilbudstype (fasit) |
|---|---|
| `innkommende/lead-01-marit-aasen.md` | Punktpris |
| `innkommende/lead-02-nordvik-bygg.md` | Fastpris |
| `innkommende/lead-03-hanne-lie.md` | Tid og materiell |

Start en test med: «Behandle lead-01» — eller lim inn et helt nytt lead.
