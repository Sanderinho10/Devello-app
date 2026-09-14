-- Timer og materiell på ordren.
--
-- Dette er det montøren fører ute på jobb, og det er tallgrunnlaget
-- fakturaforslaget i steg 4 skal lese. Derfor bærer hver linje alt som
-- trengs for å regne: timepris, kostpris, påslag og salgspris — kopiert inn
-- i det linja føres, ikke slått opp i det fakturaen lages.
--
-- Kopieringen er poenget. Timeprislista og grossistkatalogen endrer seg;
-- en føring fra i fjor skal stå med prisen som gjaldt da. price_item_id og
-- supplier_item_id peker tilbake for sporbarhet, men får linja stå selv om
-- kilden slettes (on delete set null).
--
-- material_source har alt verdiene 'faktura' og 'pakkseddel': i steg 3
-- kommer EHF-linjer fra POGO inn her, og enumen skal ikke måtte migreres da.

create table time_entries (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  order_id       uuid not null references orders(id) on delete cascade,
  user_id        uuid not null references users(id) on delete restrict,   -- montøren
  work_date      date not null,
  -- Timetypen frå selskapets timeprisliste. Prisen er kopiert inn: prislista
  -- kan endre seg, føringen skal ikke.
  price_item_id  uuid references price_list_items(id) on delete set null,
  time_type_name text not null,
  unit_price     numeric(12, 2) not null,
  hours          numeric(5, 2) not null check (hours > 0 and hours <= 24),
  note           text,
  billable       boolean not null default true,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index time_entries_order_idx on time_entries (order_id, work_date desc);
create index time_entries_company_idx on time_entries (company_id, work_date desc);

create type material_source as enum ('manuell', 'faktura', 'pakkseddel');

create table material_entries (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  order_id         uuid not null references orders(id) on delete cascade,
  source           material_source not null default 'manuell',
  supplier_item_id uuid references supplier_items(id) on delete set null,
  -- Kopiert fra katalogen (eller skrevet inn) — linjen skal stå selv om
  -- katalogen endres eller varen går ut.
  item_no          text,
  name             text not null,
  unit             text not null default 'stk',
  quantity         numeric(12, 3) not null check (quantity > 0),
  -- Kostpris per enhet eks. mva. Netto fra katalogen; null når ukjent.
  cost_price       numeric(12, 4),
  markup_pct       numeric(5, 2) not null,
  -- Salgspris per enhet eks. mva = cost_price × (1 + markup/100), eller
  -- skrevet inn direkte for en fritekstlinje uten kostpris.
  sale_price       numeric(12, 4) not null,
  note             text,
  billable         boolean not null default true,
  registered_by    uuid references users(id) on delete set null,
  registered_at    timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index material_entries_order_idx on material_entries (order_id, registered_at desc);

-- Lesing innenfor eget selskap. Skriving går gjennom API-et med service
-- role, som orders — der ligger eier/admin-sjekken for timeføringer.
alter table time_entries enable row level security;
alter table material_entries enable row level security;
create policy time_entries_select on time_entries
  for select to authenticated using (company_id = auth_company_id());
create policy material_entries_select on material_entries
  for select to authenticated using (company_id = auth_company_id());
create trigger time_entries_updated_at before update on time_entries
  for each row execute function set_updated_at();
create trigger material_entries_updated_at before update on material_entries
  for each row execute function set_updated_at();
