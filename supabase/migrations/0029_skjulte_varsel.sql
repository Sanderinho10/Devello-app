-- Varsler man har tatt til etterretning.
--
-- «Koble til en Microsoft 365-postkasse» er riktig og nyttig én gang. For den
-- som har valgt å jobbe med manuelle henvendelser, er den en oransje stripe
-- øverst på siden de bruker mest, hver eneste dag, om noe de allerede har
-- bestemt seg for. Da slutter folk å lese oransje striper — også den ene
-- gangen det haster.
--
-- Per bruker, ikke per selskap: den ene har bestemt seg, kollegaen har kanskje
-- ikke sett varselet ennå.
--
-- En liste av id-er, ikke en kolonne per varsel. Det kommer flere, og de skal
-- ikke koste en migrasjon hver.

alter table users add column skjulte_varsel text[] not null default '{}';

comment on column users.skjulte_varsel is
  'Id-er for varsler brukeren har krympet bort. Se components/SkjulbartVarsel.';
