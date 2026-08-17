-- En invitasjonslenke som tåler å bli klikket av en robot.
--
-- Supabase sin invitasjonslenke er en engangslenke: første GET bruker den opp.
-- I en Microsoft 365-postkasse med Defender skanner serveren lenkene i
-- innkommende e-post før mennesket ser dem — og da er lenken brukt opp når
-- mottakeren klikker. Loggen viser nøyaktig det: invitasjonen ble sendt
-- 23:13:32, og allerede 23:13:47 var lenken innløst. Da kollegaen klikket
-- neste morgen fikk han «Email link is invalid or has expired».
--
-- Vår egen lenke løser det ved at et GET ikke gjør noe som helst — det viser
-- bare et skjema. Først når mennesket sender skjemaet, blir invitasjonen
-- brukt opp. En skanner som henter siden etterlater ingenting.

alter table invitations
  add column token         text not null default encode(gen_random_bytes(24), 'hex'),
  add column token_used_at timestamptz;

create unique index invitations_token_key on invitations (token);

comment on column invitations.token is
  'Hemmeligheten i invitasjonslenken. Bare service role leser den.';
comment on column invitations.token_used_at is
  'Satt når noen faktisk har valgt passord. accepted_at settes av triggeren '
  'idet auth-brukeren blir til, og sier derfor ingenting om at lenken er brukt.';

-- Tokenet skal aldri kunne leses fra nettleseren: den som har det, kan sette
-- passord for adressen. Kolonnerettighetene er en hviteliste — resten av
-- tabellen er allerede lesbar for kolleger i samme selskap gjennom policyen
-- fra 0010, og vi lister her opp alt UNNTATT token.
revoke select on invitations from authenticated;
grant select (
  id, company_id, email, role, invited_by, accepted_at, expires_at,
  created_at, token_used_at
) on invitations to authenticated;
