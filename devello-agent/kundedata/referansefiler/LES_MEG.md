# Referansefiler (speiler Referansefiler-siden i plattformen)

Kundens egne tidligere tilbud, merket med tilbudstype. Dette er fasiten agenten
matcher mot når den foreslår tilbudstype, tone, typiske mengder og
forutsetninger. I plattformen laster kunden opp ca. 20 PDF-er; i test her
ligger de som strukturert tekst (.md), som er formatet agenten faktisk leser.

Tre demo-referanser følger med — én per tilbudstype:

| Fil | Tilbudstype |
|---|---|
| `ref-punktpris-bjorkevegen.md` | Punktpris |
| `ref-fastpris-sikringsskap-nordvik.md` | Fastpris |
| `ref-tid-materiell-hafstadvegen.md` | Tid og materiell |

Referansefilene er **kaldstart**. Etter hvert som agenten brukes, bygges den
skjulte `referanseliste/` opp av bekreftede tilbud — den blir gradvis viktigere
enn filene her.
