-- Kontaktkortet får firma/person og tre adresser.
--
-- Kvifor: Ein kontakt har ofte ei anna fakturaadresse enn der han held til
-- (rekneskapsførar, hovudkontor), og jobben skjer ofte ein tredje stad
-- (hytta, utleigebustaden). Kortet blir sett opp som i PowerOffice Go:
-- ei hovudadresse, og fakturaadresse og oppdragsadresse som berre gjeld
-- når dei er kryssa av som eigne. Utan avkryssing er dei lik hovudadressa.
--
-- Val som er gjort med vilje:
--
-- 1. address står att som fyrste adresselinje i hovudadressa. Det som alt
--    står der (ofte heile adressa på éi linje, frå tilbod og ordrar) blir
--    ikkje forsøkt delt opp — ein gjettar på postnummer og stad gjer meir
--    skade enn ei linje som er litt for lang.
--
-- 2. Eigne felt i staden for jsonb: dei er få, faste og skal kunne søkjast i.
--
-- 3. Ingenting her blir lese av overføringa til PowerOffice Go. Den les
--    kundefelta på ordren, som før.

alter table customers
  add column is_person          boolean not null default false,
  add column website            text,
  add column address2           text,
  add column postal_code        text,
  add column city               text,
  add column country            text not null default 'Norge',
  add column invoice_separate   boolean not null default false,
  add column invoice_address    text,
  add column invoice_address2   text,
  add column invoice_postal_code text,
  add column invoice_city       text,
  add column invoice_country    text,
  add column site_separate      boolean not null default false,
  add column site_address       text,
  add column site_address2      text,
  add column site_postal_code   text,
  add column site_city          text;

comment on column customers.address is 'Hovudadresse, fyrste linje.';
comment on column customers.invoice_separate is 'Fakturaadressa er ei anna enn hovudadressa. Elles gjeld hovudadressa.';
comment on column customers.site_separate is 'Oppdragsadressa er ei anna enn hovudadressa. Elles gjeld hovudadressa.';
