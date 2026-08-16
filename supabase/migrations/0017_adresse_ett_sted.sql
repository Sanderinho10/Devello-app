-- Adressen skal stå ett sted.
--
-- Den lå både på companies (som fakturaadresse) og på company_brand (som
-- avsenderadresse i PDF-en). To felt for samme opplysning betyr at de før
-- eller siden spriker, og da er spørsmålet hvilken av dem kunden ser — noe
-- ingen kan svare på uten å lese koden.
--
-- Nå eier companies adressen, og PDF-en henter den derfra.

update companies c
set billing_address_line = coalesce(c.billing_address_line, b.address_line),
    billing_postal_code  = coalesce(c.billing_postal_code, b.postal_code),
    billing_city         = coalesce(c.billing_city, b.city)
from company_brand b
where b.company_id = c.id
  and (b.address_line is not null or b.postal_code is not null or b.city is not null);

alter table company_brand
  drop column address_line,
  drop column postal_code,
  drop column city;

-- Tiltaleform er fjernet fra produktet: agenten skriver «du» med mindre
-- tilleggsinstruksen sier noe annet, og et valg ingen bruker er et valg som
-- bare skal bort.
update companies
set tone_settings = tone_settings - 'formalitet'
where tone_settings ? 'formalitet';
