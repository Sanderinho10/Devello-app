-- Varsel til montøren: når han får, mistar eller får flytta eit oppdrag.
--
-- Kvifor: Sjefen legg inn i kalenderen, montøren skal få vite det utan å
-- måtte sjekke. Push til appen når han har appen, e-post elles.
--
-- Korleis:
--   - user_notifications: varsla som er sende, éi rad per mottakar. Appen
--     viser lista og kan merkje dei lesne. Raden står sjølv om push og
--     e-post feilar — då ser montøren det neste gong han opnar appen.
--   - push_tokens: Expo-tokena til appane brukaren er logga inn i. Ein
--     brukar kan ha fleire telefonar. Tokenet er unikt: logger ein annan
--     inn på same telefon, flyttar tokenet over til han.
--   - Skriving via API-et med service role. Lesing av eigne varsel med RLS.
--   - Kan køyrast fleire gonger. Ingen semikolon i tekstane.

create table if not exists user_notifications (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  -- 'nytt_oppdrag' | 'endra_oppdrag' | 'fjerna_oppdrag'
  kind       text not null,
  title      text not null,
  body       text not null default '',
  event_id   uuid references calendar_events(id) on delete set null,
  order_id   uuid references orders(id) on delete set null,
  -- Kanalane varselet faktisk gjekk ut på: 'push', 'epost'. Tom når berre lista.
  sendt_via  text[] not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_notifications_user_idx on user_notifications (user_id, created_at desc);
create index if not exists user_notifications_ulest_idx on user_notifications (user_id) where read_at is null;

comment on table user_notifications is
  'Varsel til ein brukar, til dømes nytt oppdrag i kalenderen. Står sjølv om push og e-post feilar.';

create table if not exists push_tokens (
  token      text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  platform   text,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on push_tokens (user_id);

comment on table push_tokens is
  'Expo push-token per installert app. Same token på ny brukar flyttar det.';

alter table user_notifications enable row level security;
alter table push_tokens enable row level security;

drop policy if exists user_notifications_select on user_notifications;
create policy user_notifications_select on user_notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_tokens_select on push_tokens;
create policy push_tokens_select on push_tokens
  for select to authenticated using (user_id = auth.uid());
