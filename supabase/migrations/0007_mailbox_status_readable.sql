-- La brukeren se at postkassen er tilkoblet — uten å se tokenene.
--
-- 0002 slo på RLS for mailbox_connections og ga den med vilje ingen policy:
-- OAuth-tokens skal aldri kunne leses fra nettleseren. Det virket, men det
-- traff for bredt. Innstillinger og leads-listen leser tabellen med brukerens
-- egen sesjon, og uten policy fikk de null rader. Resultatet var at en
-- vellykket tilkobling ble vist som «Ingen postkasse tilkoblet», og at
-- «Hent leads»-knappen ble skjult — selv om tilkoblingen var i orden og
-- /api/leads/fetch (service role) ville ha fungert.
--
-- RLS er radnivå og kan ikke skille kolonner. Løsningen er derfor to lag:
-- kolonnerettigheter bestemmer HVA som kan leses, policyen bestemmer HVILKE
-- rader. Tokenkolonnene står utenfor grantet, så et forsøk på å lese dem gir
-- «permission denied» i stedet for et token — det feiler lukket.
--
-- Merk at kommentaren i 0004 om at «ingen policy er poenget» er utdatert fra
-- og med denne migrasjonen. Poenget er fortsatt at tokens ikke skal ut; det er
-- kolonnerettighetene som holder det nå.

revoke all on mailbox_connections from anon, authenticated;

grant select (
  id,
  company_id,
  provider,
  email_address,
  display_name,
  status,
  last_synced_at,
  created_at,
  updated_at
) on mailbox_connections to authenticated;

-- access_token, refresh_token, scope, expires_at, ms_tenant_id og ms_user_id
-- er bevisst utelatt over. Bare service role rører dem.

create policy mailbox_connections_select on mailbox_connections
  for select
  to authenticated
  using (company_id = auth_company_id());
