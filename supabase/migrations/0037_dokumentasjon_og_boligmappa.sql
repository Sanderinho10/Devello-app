-- Dokumentasjon på ordren, og Boligmappa.
--
-- Dokumentasjonen er kvalitetskontrollen til elektrikaren, og ho skal
-- fyllast ut av montøren — manuelt, utan AI. Det Devello gjer er å ta bort
-- friksjonen rundt: rett skjema klart på ordren med firma, kunde og adresse
-- ferdig utfylt, utfylling på mobilen ute på jobb, PDF med firmaets
-- merkevare, og éin knapp til Boligmappa.
--
-- Tre val som er gjort med vilje:
--
-- 1. Malane ligg i koden (src/lib/dokumentasjon/malar), ikkje i databasen.
--    Dokumentet frys malnøkkel og versjon, så eit gammalt skjema alltid kan
--    visast slik det var sjølv om malen blir endra seinare.
--
-- 2. Signatur er innlogga brukar + tidsstempel + låsing, tydeleg merkt
--    «Signert i Devello av …». Ingen BankID. Det er det fagsystema gjer òg.
--
-- 3. Boligmappa-tokenane er hemmelege: ingen policy for authenticated,
--    same som postkassa. Innstillingssida les status via service role.

create type document_kind as enum ('skjema', 'fil');
create type document_status as enum ('utkast', 'ferdig');

create table order_documents (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  order_id         uuid not null references orders(id) on delete cascade,
  kind             document_kind not null,
  -- Skjema: kva mal og versjon. Malen ligg i koden (src/lib/dokumentasjon/malar),
  -- versjonen er frosen på dokumentet så eit gammalt skjema alltid kan visast
  -- slik det var.
  template_key     text,                        -- 'elektro.samsvarserklaering' …
  template_version integer,
  title            text not null,
  data             jsonb not null default '{}'::jsonb,   -- feltverdiar for skjema
  status           document_status not null default 'utkast',
  -- Fil: opplasta av brukaren (bilete, PDF, datablad). Skjema: den genererte PDF-en.
  storage_path     text,
  file_name        text,
  mime_type        text,
  pdf_path         text,
  signed_by        uuid references users(id) on delete set null,
  signed_name      text,                        -- namnet slik det stod på signaturen
  signed_at        timestamptz,
  boligmappa_file_id   text,
  boligmappa_sent_at   timestamptz,
  boligmappa_error     text,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index order_documents_order_idx on order_documents (order_id, created_at desc);

comment on table order_documents is
  'Dokumentasjon på ordren: skjema frå mal (data + generert PDF) eller opplasta fil. Ferdige skjema er låste.';

-- Boligmappa-kopling per selskap. Tokenar er hemmelege: ingen policy.
create table boligmappa_connections (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null unique references companies(id) on delete cascade,
  environment    text not null default 'production',     -- 'production' | 'staging'
  access_token   text,
  refresh_token  text not null,
  expires_at     timestamptz,
  bm_user_name   text,                          -- frå id_token, vist i UI
  bm_company_name text,
  status         connection_status not null default 'aktiv',
  status_reason  text,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Eigedom og plant per ordre. Boligmappa-nummeret er nøkkelen; plant-id er
-- firmaets arbeidsflate på den eigedomen og skal gjenbrukast på neste ordre
-- på same adresse.
alter table orders
  add column boligmappa_number text,
  add column boligmappa_property jsonb;         -- det brukaren bekrefta: adresse, eining, matrikkel

create table boligmappa_plants (
  company_id        uuid not null references companies(id) on delete cascade,
  boligmappa_number text not null,
  plant_id          bigint not null,
  created_at        timestamptz not null default now(),
  primary key (company_id, boligmappa_number)
);

alter table order_documents enable row level security;
alter table boligmappa_connections enable row level security;
alter table boligmappa_plants enable row level security;
create policy order_documents_select on order_documents
  for select to authenticated using (company_id = auth_company_id());
create policy boligmappa_plants_select on boligmappa_plants
  for select to authenticated using (company_id = auth_company_id());

insert into storage.buckets (id, name, public)
  values ('order-documents', 'order-documents', false)
  on conflict (id) do nothing;

create trigger order_documents_updated_at before update on order_documents
  for each row execute function set_updated_at();
create trigger boligmappa_connections_updated_at before update on boligmappa_connections
  for each row execute function set_updated_at();
