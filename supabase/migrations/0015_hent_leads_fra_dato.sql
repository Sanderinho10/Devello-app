-- Hvor langt tilbake skal første henting gå?
--
-- Før dette hentet første kjøring de 25 nyeste e-postene i innboksen, uansett
-- alder. En travel postkasse ga da et par dager, en rolig ga flere uker — og
-- brukeren hadde ingen måte å vite hvilket av delene de kom til å få.
--
-- Nå settes et startpunkt ved tilkobling, med dagens dato som standard: den
-- som kobler til vil nesten alltid teste på det som kommer inn nå, ikke grave
-- opp fjoråret. Vil de likevel hente bakover, endrer de datoen før første
-- henting.
--
-- Feltet brukes bare til første henting. Etterpå overtar last_synced_at.

alter table mailbox_connections
  add column initial_fetch_from timestamptz;

comment on column mailbox_connections.initial_fetch_from is
  'Startpunkt for aller første henting. Etter første kjøring styrer last_synced_at.';

-- Eksisterende koblinger: sett startpunktet til der de allerede står, så de
-- ikke plutselig begynner å dra inn gammel post.
update mailbox_connections
set initial_fetch_from = coalesce(last_synced_at, now())
where initial_fetch_from is null;

-- Kolonnerettighetene fra 0007 er en hviteliste — en ny kolonne er usynlig
-- for authenticated til den står her.
grant select (initial_fetch_from) on mailbox_connections to authenticated;
