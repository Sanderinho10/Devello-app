-- Rekkefølgen fra prisfila.
--
-- Prisradene ble vist alfabetisk fordi det var det eneste stabile å sortere
-- på: en import skriver hundrevis av rader i samme insert, så created_at er
-- lik for alle, og id er tilfeldig. Firmaet har bygd opp fila si i en
-- rekkefølge som betyr noe — stikkontakter sammen, samtaleanlegg sammen,
-- vanligst først — og den skal listen vise.
--
-- Eksisterende rader får posisjon etter navn, altså slik de allerede vises.
-- Den opprinnelige rekkefølgen er ikke lagret noe sted og kan ikke hentes
-- tilbake; en ny import med «Erstatt» gir den.

alter table price_list_items add column position integer;

update price_list_items item
set position = nummerert.rad
from (
  select id, row_number() over (partition by price_list_id order by name, id) as rad
  from price_list_items
) nummerert
where nummerert.id = item.id;

alter table price_list_items alter column position set not null;
alter table price_list_items alter column position set default 0;

create index price_list_items_position_idx on price_list_items (price_list_id, position);
