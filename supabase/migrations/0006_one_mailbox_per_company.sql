-- Én postkasse per selskap.
--
-- Tabellen hadde unique (company_id, email_address), som tillot flere rader per
-- selskap. Men appen leser postkassen med maybeSingle() filtrert bare på
-- company_id tre steder — innstillinger, leads-listen og «Hent leads». Kobler
-- noen til én konto og så en annen, blir det to rader, og alle tre kaster
-- «multiple rows returned».
--
-- v1 er én postkasse per selskap (spec §3), så vi lar databasen si det.
-- «Koble til på nytt» med en annen konto erstatter da raden i stedet for å
-- legge til en til.

-- Behold den nyest oppdaterte raden per selskap.
delete from mailbox_connections m
using mailbox_connections nyere
where m.company_id = nyere.company_id
  and (nyere.updated_at, nyere.id) > (m.updated_at, m.id);

alter table mailbox_connections
  drop constraint if exists mailbox_connections_company_id_email_address_key;

alter table mailbox_connections
  add constraint mailbox_connections_company_id_key unique (company_id);
