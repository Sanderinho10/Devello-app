-- Prisrader høyrer no til ei namngjeven liste, og kvar type kan ha fleire.
--
-- Star Elektro har ikkje éi prisfil — dei har ei punktprisliste, ei
-- materielliste og ein timeprisliste, og kan ha fleire av kvar (t.d. ei liste
-- per leverandør, eller ei eiga for næringskundar). Agenten vel liste ut frå
-- tilbudstypen; kva liste innanfor typen blir spesifisert seinare.

create table price_lists (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  kind        price_item_kind not null,
  name        text not null,
  description text,
  -- Inaktive lister blir liggjande, men agenten hentar ikkje frå dei.
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index price_lists_company_idx on price_lists (company_id, kind, active);

-- Gjer det mogleg å binde ein prisrad til både liste og type i éin nøkkel.
alter table price_lists add constraint price_lists_id_kind_key unique (id, kind);

create trigger price_lists_updated_at before update on price_lists
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Knyt eksisterande rader til ei liste
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

-- Samansett framandnøkkel: ein prisrad sin type MÅ vere lik lista sin type.
-- Databasen held dette sant, så det finst ingen veg til at dei kjem i utakt.
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
