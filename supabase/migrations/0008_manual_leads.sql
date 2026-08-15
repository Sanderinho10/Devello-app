-- Manuelle henvendelser.
--
-- Ikke alle jobber kommer på e-post. Ringer kunden, skal saksbehandleren kunne
-- skrive inn hva som ble sagt og få et utkast ut av det — samme flyt videre,
-- bare en annen inngang.
--
-- Kilden må stå eksplisitt i raden. Bekreft-flyten svarer på den opprinnelige
-- e-posten når leadet kom på e-post, og det finnes ingen melding å svare på
-- her. Å utlede det av «mailbox_connection_id er null» ville virket i dag og
-- blitt feil den dagen noe annet setter feltet til null.

create type lead_source as enum ('epost', 'manuell');

alter table leads
  add column source lead_source not null default 'epost';

-- external_message_id er not null og unik per selskap. Manuelle leads får en
-- syntetisk id («manuell:<uuid>») fra API-et, så nøkkelen holder uten at vi må
-- gjøre kolonnen nullbar og miste dedupe-garantien for e-post.
