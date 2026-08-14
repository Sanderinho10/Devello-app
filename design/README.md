# design/

Statiske mockuper for tilbudsagenten. De lenker til `../src/app/globals.css`
— den samme filen appen bruker — slik at mockup og implementasjon ikke driver fra
hverandre. Endrer du designsystemet, endrer begge seg.

Åpne filene direkte i nettleseren (`file://`), ingen byggesteg.

| Fil | Viser |
| --- | --- |
| `dashboard.html` | Leads-listen og navigasjonsmønsteret: én knapp per agent, med agentens faner inni. |
| `draft-dokument.html` | Utkast for punktpris og fastpris — dokument-forhåndsvisning med type-bryter og kort e-posttekst. |
| `draft-tekst.html` | Utkast for tid og materiell — redigerbar tekst, ingen PDF. |

Selve tilbuds-PDF-en har et eget uttrykk (`src/lib/pdf/template.ts`) og er
ikke en av disse mockupene. For å se den:

```sh
npm run preview:pdf            # punktpris
npm run preview:pdf -- fastpris
```
