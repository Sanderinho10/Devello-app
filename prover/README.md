# prover/

Ekte fakturafiler frå grossistane, til `npm run test:fakturafil`.

Innhaldet her er **kundedata** (fakturaer med prisar og leveringsadresser)
og skal **aldri committast**. Mappa er gitignored; berre `.gitkeep` og
denne fila går inn i git.

Legg filene rett i mappa: `prover/F4…txt` (NELFO 4.0), `prover/…xml` (EHF).
Testen finn adapter etter innhald, ikkje filnamn, og skriv ut per fil:
format, tal fakturaer, og per faktura nummer, dato, org.nr, referansar,
tal linjer og sum av linjene mot totalen.
