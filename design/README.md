# design/

Statiske mockupar for tilbudsagenten. Dei lenkjer til `../src/app/globals.css`
— den same fila appen brukar — slik at mockup og implementasjon ikkje driv frå
kvarandre. Endrar du designsystemet, endrar begge seg.

Opne filene direkte i nettlesaren (`file://`), ingen byggesteg.

| Fil | Viser |
| --- | --- |
| `dashboard.html` | Leads-lista og navigasjonsmønsteret: éin knapp per agent, med agentens faner inni. |
| `draft-dokument.html` | Utkast for punktpris og fastpris — dokument-forhandsvisning med type-bryter og kort e-posttekst. |
| `draft-tekst.html` | Utkast for tid og materiell — redigerbar tekst, ingen PDF. |

Sjølve tilbods-PDF-en har eit eige uttrykk (`src/lib/pdf/template.ts`) og er
ikkje ein av desse mockupane. For å sjå den:

```sh
npm run preview:pdf            # punktpris
npm run preview:pdf -- fastpris
```
