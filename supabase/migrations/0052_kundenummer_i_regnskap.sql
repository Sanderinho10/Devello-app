-- Kundenummeret i regnskapssystemet, lagra på kontakten.
--
-- Kvifor: Kvar overføring til PowerOffice Go leitar i dag opp kunden på
-- nytt (org.nr., e-post, telefon). Er det fleire treff, må brukaren velje
-- kvar gong. Når Go fyrst har sagt ja til ein salsordre, veit me kva kunde
-- kontakten er der — det nummeret blir lagra og brukt neste gong.
--
-- Val som er gjort med vilje:
--
-- 1. Nummeret høyrer til éi kopling (accounting_connection_id). Byter
--    selskapet Go-klient, eller går frå demo til produksjon, kjem det ei ny
--    kopling, og nummeret blir ikkje brukt — eit kundenummer frå éin klient
--    peikar på ein heilt annan kunde i ein annan.
--
-- 2. Lagra berre etter at Go har oppretta salsordren, aldri på eit oppslag
--    åleine. Avviser Go seinare nummeret, blir det fjerna, og neste forsøk
--    leitar opp kunden som før.
--
-- 3. Kunden i Go blir aldri endra herifrå.

alter table customers
  add column accounting_customer_no   text,
  add column accounting_connection_id uuid references accounting_connections(id) on delete set null;

comment on column customers.accounting_customer_no is
  'Kundenummeret i regnskapssystemet (PowerOffice Go), lagra etter første vellukka overføring. Gjeld berre for accounting_connection_id.';
