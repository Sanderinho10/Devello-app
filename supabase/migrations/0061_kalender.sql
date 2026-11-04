-- Kalender: kven er kvar, og når.
--
-- Kvifor: Sjefen skal kunne setje opp at montør Noah er på ordre 1001
-- måndag 10–15, og leggje inn ting som ikkje er ordrar — interne møte,
-- ferie, kurs. Montøren skal sjå sitt eige program i appen.
--
-- Korleis:
--   - calendar_events: éi rad per avtale. order_id er sett for oppdrag og
--     tom for alt anna. kind seier kva slags avtale det er, så kalenderen
--     kan fargeleggje og filtrere utan å gjette.
--   - calendar_event_users: deltakarane. Ein avtale kan ha fleire (to
--     montørar på same jobb, heile firmaet på møte), og ein montør kan ha
--     mange avtalar.
--   - Tidene er timestamptz. Heildagsavtalar går frå midnatt til midnatt
--     lokal tid, med all_day = true så dei blir viste øvst og utan klokke.
--   - Lesing innanfor eige selskap med RLS. Skriving går gjennom API-et med
--     service role og rollesjekk (berre administrator), som resten av
--     ordremodulen.
--   - Kan køyrast fleire gonger. Ingen semikolon i tekstane.

create table if not exists calendar_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  -- Oppdraget avtalen gjeld. Tom for møte, fråvær og anna.
  order_id    uuid references orders(id) on delete cascade,
  kind        text not null default 'annet'
              check (kind in ('oppdrag', 'mote', 'fravaer', 'annet')),
  -- Tom tittel på eit oppdrag betyr ordretittelen.
  title       text not null default '',
  description text,
  location    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  all_day     boolean not null default false,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'oppdrag' or order_id is not null)
);
create index if not exists calendar_events_company_tid_idx on calendar_events (company_id, starts_at);
create index if not exists calendar_events_order_idx on calendar_events (order_id) where order_id is not null;

comment on table calendar_events is
  'Ein avtale i kalenderen: eit oppdrag på ein ordre, eit møte, fråvær eller anna.';
comment on column calendar_events.title is
  'Tom på eit oppdrag betyr ordretittelen.';

create table if not exists calendar_event_users (
  event_id   uuid not null references calendar_events(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  primary key (event_id, user_id)
);
create index if not exists calendar_event_users_user_idx on calendar_event_users (company_id, user_id);

comment on table calendar_event_users is
  'Kven som er med på avtalen. Ein montør kan ha mange avtalar, ein avtale fleire montørar.';

alter table calendar_events enable row level security;
alter table calendar_event_users enable row level security;

drop policy if exists calendar_events_select on calendar_events;
create policy calendar_events_select on calendar_events
  for select to authenticated using (company_id = auth_company_id());

drop policy if exists calendar_event_users_select on calendar_event_users;
create policy calendar_event_users_select on calendar_event_users
  for select to authenticated using (company_id = auth_company_id());

drop trigger if exists calendar_events_updated_at on calendar_events;
create trigger calendar_events_updated_at before update on calendar_events
  for each row execute function set_updated_at();
