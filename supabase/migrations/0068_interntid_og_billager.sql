-- Interntid og billager, utan å låne ein ordre til det.
--
-- Kvifor: I Cordel fører elektrikaren interntid på ein ordre som heiter
-- «Interntid», og varene i bilen på ein ordre som heiter «Bilen til Martin».
-- Det er ordrar som aldri skal fakturerast og aldri blir ferdige. Her får
-- begge sin eigen plass.
--
-- Korleis:
--   1. Interntid. Ei timeføring høyrer anten til ein ordre eller til ein
--      intern aktivitet (møte, kurs, lager) — aldri begge, aldri ingen.
--      order_id blir valfri, og internal_activity_id peikar på aktiviteten.
--      Namnet på aktiviteten blir kopiert inn i time_type_name som for
--      timetypar, så føringa står om aktiviteten får nytt namn.
--   2. Billager. Kvar bil (eller lagerrom) er ein lagerstad med eit nummer
--      frå same løpenummerserie som ordrane. Montøren skriv nummeret på
--      bestillinga hos grossisten, og fakturaen finn bilen på same måten som
--      ho finn ein ordre. Behaldninga er summen av rørslene: innkjøp og
--      påfyll er pluss, uttak til ordre er minus, og ei oppteljing er
--      differansen.
--   3. Uttaket heng på materiell-linja på ordren. Blir linja sletta, går
--      rørsla med (on delete cascade), og vara er tilbake i bilen.
--
-- Kan køyrast fleire gonger. Ingen semikolon i tekstane.

-- interntid

create table if not exists internal_activities (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists internal_activities_namn_unik
  on internal_activities (company_id, lower(name));

comment on table internal_activities is
  'Det ein kan føre interntid på: møte, kurs, lager. Styrt av administrator.';

alter table internal_activities enable row level security;
drop policy if exists internal_activities_select on internal_activities;
create policy internal_activities_select on internal_activities
  for select to authenticated using (company_id = auth_company_id());

alter table time_entries alter column order_id drop not null;
alter table time_entries
  add column if not exists internal_activity_id uuid references internal_activities(id) on delete restrict;
create index if not exists time_entries_intern_idx
  on time_entries (company_id, work_date desc) where internal_activity_id is not null;
create index if not exists time_entries_user_idx
  on time_entries (company_id, user_id, work_date desc);

alter table time_entries drop constraint if exists time_entries_ordre_eller_intern;
alter table time_entries add constraint time_entries_ordre_eller_intern
  check ((order_id is not null) <> (internal_activity_id is not null));

comment on column time_entries.internal_activity_id is
  'Sett for interntid. Då er order_id tom, prisen 0 og føringa ikkje fakturerbar.';

-- Eit utval å starte med for selskapa som alt har ordremodulen. Nye selskap
-- får det same første gong lista blir lesen (api/interntid).
insert into internal_activities (company_id, name, position)
select c.id, a.name, a.position
  from companies c
  cross join (values
    ('Møte', 1),
    ('Kurs og opplæring', 2),
    ('Lager og verksted', 3),
    ('Kjøring', 4),
    ('Administrasjon', 5),
    ('Annet', 6)
  ) as a(name, position)
 where 'ordre' = any (c.moduler)
on conflict do nothing;

-- billager

create table if not exists stock_locations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  -- Frå neste_ordrenummer(), så det aldri kolliderer med ein ordre.
  location_no integer not null,
  name        text not null,
  kind        text not null default 'bil' check (kind in ('bil', 'lager')),
  reg_no      text,
  -- Montøren som køyrer bilen. Bilen hans står først når han fører materiell.
  user_id     uuid references users(id) on delete set null,
  note        text,
  active      boolean not null default true,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, location_no)
);

comment on table stock_locations is
  'Ein bil eller eit lagerrom med behaldning. Nummeret er det montøren skriv på bestillinga.';

create table if not exists stock_movements (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  location_id       uuid not null references stock_locations(id) on delete cascade,
  -- inn = innkjøp eller påfyll, uttak = brukt på ein ordre, justering = oppteljing.
  kind              text not null check (kind in ('inn', 'uttak', 'justering')),
  supplier_item_id  uuid references supplier_items(id) on delete set null,
  item_no           text,
  name              text not null,
  unit              text not null default 'stk',
  -- Pluss inn i bilen, minus ut.
  quantity          numeric(12, 3) not null check (quantity <> 0),
  -- Kostpris per eining eks. mva då rørsla skjedde. Null når ukjend.
  cost_price        numeric(12, 4),
  invoice_line_id   uuid references supplier_invoice_lines(id) on delete cascade,
  material_entry_id uuid references material_entries(id) on delete cascade,
  note              text,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists stock_movements_location_idx on stock_movements (location_id, created_at);
create index if not exists stock_movements_invoice_line_idx
  on stock_movements (invoice_line_id) where invoice_line_id is not null;
-- Éi materiell-linje er eitt uttak.
create unique index if not exists stock_movements_material_entry_unik
  on stock_movements (material_entry_id) where material_entry_id is not null;

comment on table stock_movements is
  'Alt som går inn i og ut av ein bil. Behaldninga er summen av quantity per vare.';

alter table stock_locations enable row level security;
alter table stock_movements enable row level security;
drop policy if exists stock_locations_select on stock_locations;
create policy stock_locations_select on stock_locations
  for select to authenticated using (company_id = auth_company_id());
drop policy if exists stock_movements_select on stock_movements;
create policy stock_movements_select on stock_movements
  for select to authenticated using (company_id = auth_company_id());

drop trigger if exists stock_locations_updated_at on stock_locations;
create trigger stock_locations_updated_at before update on stock_locations
  for each row execute function set_updated_at();

-- Materiell teke frå bilen, og fakturaer som gjekk til bilen i staden for ein ordre.
alter table material_entries
  add column if not exists stock_location_id uuid references stock_locations(id) on delete set null;
alter table supplier_invoice_lines
  add column if not exists stock_location_id uuid references stock_locations(id) on delete set null;
alter table supplier_invoices
  add column if not exists stock_location_id uuid references stock_locations(id) on delete set null;

comment on column material_entries.stock_location_id is
  'Sett når vara er teken frå ein bil. Uttaket står i stock_movements.';
comment on column supplier_invoice_lines.stock_location_id is
  'Sett når linja er lagd på ein bil i staden for ein ordre.';
