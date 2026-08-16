-- Opplastede referansefiler inn i samme søkbare pool som bekreftede tilbud.
--
-- En referansefil som lastes opp får nå teksten trukket ut, tagget, og skrevet
-- som en rad i quote_references med draft_id = null og lead_id = null. Da
-- treffer sok_referanser begge kildene, og agenten ser innholdet i kundens
-- gamle tilbud — ikke bare filnavnet.
--
-- reference_quote_id binder raden til fila. Cascade, så sletter brukeren
-- referansefila i UI-et, forsvinner søkeraden med den — en slettet referanse
-- skal ikke fortsette å forme nye tilbud fra skyggene.

alter table quote_references
  add column reference_quote_id uuid references reference_quotes(id) on delete cascade;

create index quote_references_reference_quote_idx
  on quote_references (reference_quote_id)
  where reference_quote_id is not null;
