-- Hvorfor postkassen falt ut.
--
-- «Tilgangen til postkassen har gått ut» var det eneste brukeren fikk vite,
-- uansett årsak. Da vi endelig så på Microsofts eget svar, sto det noe helt
-- annet enn utløpt tid:
--
--   AADSTS50076: you must use multi-factor authentication to access …
--
-- Altså: tokenet var ikke gammelt, men tenanten krever to-faktor, og en
-- fornying i bakgrunnen kan ikke be noen om en engangskode. Det er en helt
-- annen beskjed å gi enn «prøv igjen».

alter table mailbox_connections add column status_reason text;

comment on column mailbox_connections.status_reason is
  'Hva som faktisk gikk galt, i klartekst. Vises i banneret over leads.';
