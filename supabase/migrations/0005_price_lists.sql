-- Prisrader hører nå til en navngitt liste, og hver type kan ha flere.
--
-- Star Elektro har ikke én prisfil — de har en punktprisliste, en
-- materielliste og en timeprisliste, og kan ha flere av hver (f.eks. en liste
-- per leverandør, eller en egen for næringskunder). Agenten velger liste ut fra
-- tilbudstypen; hvilken liste innenfor typen blir spesifisert senere.

create table price_lists (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  kind        price_item_kind not null,
  name        text not null,
  description text,
  -- Inaktive lister blir liggende, men agenten henter ikke fra dem.
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index price_lists_company_idx on price_lists (company_id, kind, active);

-- Gjør det mulig å binde en prisrad til både liste og type i én nøkkel.
alter table price_lists add constraint price_lists_id_kind_key unique (id, kind);

create trigger price_lists_updated_at before update on price_lists
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Knytt eksisterende rader til en liste
-- ---------------------------------------------------------------------------

alter table price_list_items add column price_list_id uuid;

insert into price_lists (company_id, kind, name)
select distinct
  company_id,
  kind,
  case kind
    when 'punktpris' then 'Punktprisliste'
    when 'materiell' then 'Materielliste'
    when 'time'      then 'Timeprisliste'
  end
from price_list_items;

update price_list_items item
set price_list_id = list.id
from price_lists list
where list.company_id = item.company_id
  and list.kind = item.kind;

alter table price_list_items alter column price_list_id set not null;

-- Sammensatt fremmednøkkel: en prisrads type MÅ være lik listens type.
-- Databasen holder dette sant, så det finnes ingen vei til at de kommer i utakt.
alter table price_list_items
  add constraint price_list_items_list_kind_fk
  foreign key (price_list_id, kind)
  references price_lists (id, kind)
  on update cascade
  on delete cascade;

create index price_list_items_list_idx on price_list_items (price_list_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table price_lists enable row level security;

create policy price_lists_all on price_lists
  for all using (company_id = auth_company_id())
  with check (company_id = auth_company_id());
