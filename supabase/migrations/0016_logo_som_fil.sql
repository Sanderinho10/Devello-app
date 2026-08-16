-- Logoen skal lastes opp, ikke lenkes til.
--
-- logo_url krevde at kunden hadde bildet liggende på en offentlig adresse et
-- annet sted. Det har en håndverksbedrift sjelden — logoen ligger på en
-- maskin, ikke på en server. Og en lenke kan råtne: dagen nettsiden deres
-- bygges om, forsvinner logoen ut av PDF-ene uten at noen skjønner hvorfor.
--
-- Nå lagres selve fila hos oss, og PDF-en bygger den inn som data-URI ved
-- rendring. Da er den der uansett hva som skjer med nettsiden deres, og
-- Chromium slipper å hente noe utenfra mens PDF-en lages.

insert into storage.buckets (id, name, public)
values ('brand-logos', 'brand-logos', false)
on conflict (id) do nothing;

alter table company_brand add column logo_path text;

comment on column company_brand.logo_path is
  'Sti i brand-logos-bøtta. Leses bare av service role.';

-- Ingen rader har en logo_url i dag, så det er ingenting å ta vare på.
alter table company_brand drop column logo_url;
