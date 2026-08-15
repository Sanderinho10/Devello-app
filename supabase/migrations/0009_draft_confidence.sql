-- Hvor mye vekt utkastet tåler.
--
-- Vurderingen kommer ikke fra modellen. En modell som sier den er sikker tar
-- like ofte feil som en som nøler, så nivået avledes av to ting vi kan slå opp:
-- om kunden har referansetilbud av samme type, og om alle postene fant et treff
-- i prisfilen. Se src/lib/drafts/confidence.ts.
--
-- Nivået lagres per utkast fordi det avhenger av tilbudstypen, og typen kan
-- byttes. confidence_note holder signalene bak vurderingen, én per linje, så
-- hjelpeboblen kan vise hvorfor og ikke bare hva.

create type quote_confidence as enum ('hoeg', 'middels', 'laag');

alter table drafts
  add column confidence quote_confidence not null default 'middels',
  add column confidence_note text;
