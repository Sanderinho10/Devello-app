-- Ett utkast, én referanse.
--
-- saveQuoteReference gjorde en ren insert, og bekreft kan trykkes flere
-- ganger: retter man en linje og bekrefter på nytt, lå det plutselig to rader
-- for samme tilbud. Én av dem var utdatert, begge var søkbare, og agenten
-- leser dem som to uavhengige eksempler på hvordan firmaet skriver tilbud.
-- Da teller det samme tilbudet dobbelt i mønsteret den lærer av.
--
-- Det er ikke teoretisk: ett utkast lå allerede med tre rader.
--
-- Rader fra opplastede referansefiler har draft_id null. Postgres regner
-- NULL-er som forskjellige i en unik indeks, så de er ikke berørt — det er
-- meningen, en kunde kan laste opp så mange filer de vil.

-- Behold den nyeste per utkast.
delete from quote_references a
using quote_references b
where a.draft_id is not null
  and a.draft_id = b.draft_id
  and (a.confirmed_at, a.id) < (b.confirmed_at, b.id);

create unique index quote_references_eitt_per_utkast
  on quote_references (draft_id);
