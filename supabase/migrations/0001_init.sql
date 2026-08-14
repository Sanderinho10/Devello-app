-- Devello — grunnskjema for tilbudsagenten.
-- Fase 0: fundament. Se produktbyggspec §1.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- De tre tilbudstypene. Kjernelogikken i §2.
create type quote_type as enum ('punktpris', 'fastpris', 'tid_og_materiell');

-- Prisrader er strukturerte, aldri fritekst. Agenten slår opp — regner aldri selv.
--   punktpris : én buntet pris (arbeid + materiell samlet), f.eks. "montering stikkontakt"
--   materiell : materiellpost brukt i fastpris-spesifikasjon
--   time      : timepris (fastpris + tid og materiell)
create type price_item_kind as enum ('punktpris', 'materiell', 'time');

create type lead_status as enum ('ny', 'utkast_klar', 'bekrefta');

create type mailbox_provider as enum ('microsoft');
create type mailbox_status as enum ('aktiv', 'token_utlopt', 'kopla_fra', 'feil');

-- Hver versjon i draft_versions er merket med hvor teksten kom fra.
create type draft_version_source as enum ('ai', 'redigering', 'endelig');

create type agent_run_kind as enum ('hent_leads', 'generer_utkast');
create type agent_run_status as enum ('koeyrer', 'ok', 'feil');

-- ---------------------------------------------------------------------------
-- companies — Devello-kundene
-- ---------------------------------------------------------------------------
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  org_nr        text,
  -- Tone-innstillinger styrer hvordan Claude formulerer e-postteksten.
  -- { "formalitet": "de|du", "signatur": "...", "tillegg": "..." }
  tone_settings jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- company_brand — merkevare hentet fra referansefiler
-- Brukt i PDF-genereringen: Devellos faste mal, med kundens logo/farge/kontaktinfo
-- injisert. Dette er IKKE en etterlikning av kundens gamle Word/PDF-layout.
-- ---------------------------------------------------------------------------
create table company_brand (
  company_id      uuid primary key references companies(id) on delete cascade,
  logo_url        text,
  primary_color   text not null default '#1d1d1f',
  accent_color    text,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  address_line    text,
  postal_code     text,
  city            text,
  website         text,
  -- Fritekst som blir lagt nederst i PDF-en (org.nr, bankkonto, vilkår).
  footer_note     text,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- users — innloggede brukere per company
-- id peker på auth.users. Supabase Auth eier selve innloggingen.
-- ---------------------------------------------------------------------------
create table users (
  id         uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'medlem',
  created_at timestamptz not null default now()
);

create index users_company_id_idx on users (company_id);

-- ---------------------------------------------------------------------------
-- mailbox_connections — OAuth-tokens per tilkoblet postkasse
-- Scope: Mail.Read + Mail.ReadWrite. Aldri Mail.Send — mennesket trykker send selv.
-- ---------------------------------------------------------------------------
create table mailbox_connections (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  provider       mailbox_provider not null default 'microsoft',
  email_address  text not null,
  display_name   text,
  ms_tenant_id   text,
  ms_user_id     text,
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  scope          text,
  status         mailbox_status not null default 'aktiv',
  -- Vi henter bare e-post som kom inn etter dette tidspunktet.
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, email_address)
);

create index mailbox_connections_company_id_idx on mailbox_connections (company_id);

-- ---------------------------------------------------------------------------
-- price_list_items — strukturerte prisrader
-- ---------------------------------------------------------------------------
create table price_list_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  kind        price_item_kind not null,
  code        text,
  name        text not null,
  description text,
  unit        text not null default 'stk',
  unit_price  numeric(12, 2) not null,
  -- For punktpris er begge true (buntet pris). For materiell/time er bare én true.
  includes_labour   boolean not null default false,
  includes_material boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index price_list_items_company_id_idx on price_list_items (company_id);
create index price_list_items_lookup_idx on price_list_items (company_id, kind, active);

-- ---------------------------------------------------------------------------
-- reference_quotes — opplastede referansetilbud
-- Dette er fasiten agenten matcher mot når han skal foreslå tilbudstype.
-- ---------------------------------------------------------------------------
create table reference_quotes (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  title           text not null,
  type            quote_type not null,
  -- Hva slags jobb tilbudet gjaldt. Dette er teksten klassifiseringen matcher mot.
  job_description text,
  file_name       text,
  storage_path    text,
  mime_type       text,
  extracted_text  text,
  created_at      timestamptz not null default now()
);

create index reference_quotes_company_id_idx on reference_quotes (company_id);
create index reference_quotes_type_idx on reference_quotes (company_id, type);

-- ---------------------------------------------------------------------------
-- leads — én rad per innkommende e-post
-- ---------------------------------------------------------------------------
create table leads (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  mailbox_connection_id uuid references mailbox_connections(id) on delete set null,
  -- Graph message-id. Dedupe skjer på denne.
  external_message_id   text not null,
  conversation_id       text,
  from_name             text,
  from_email            text,
  subject               text,
  body_preview          text,
  body_text             text,
  received_at           timestamptz,
  status                lead_status not null default 'ny',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, external_message_id)
);

create index leads_company_status_idx on leads (company_id, status, received_at desc);

-- ---------------------------------------------------------------------------
-- drafts — AI-generert utkast
-- document er null for tid og materiell (bare tekst, ingen PDF).
-- ---------------------------------------------------------------------------
create table drafts (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null unique references leads(id) on delete cascade,
  quote_type          quote_type not null,
  -- Hvorfor agenten foreslo denne typen. Vist til brukeren over type-bryteren.
  classification_note text,
  email_subject       text not null default '',
  email_body          text not null default '',
  -- Strukturert dokumentinnhold for punktpris/fastpris. Se src/lib/types.ts
  -- (QuoteDocument) for formen. Null for tid og materiell.
  document            jsonb,
  pdf_path            text,
  -- Outlook-kladden som ble opprettet ved bekreft.
  outlook_draft_id    text,
  outlook_web_link    text,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- draft_versions — logg av hver versjon. Læringsdata: logg alltid.
-- Original AI-tekst + hver redigering + endelig, uansett om noe ble endret.
-- ---------------------------------------------------------------------------
create table draft_versions (
  id          uuid primary key default gen_random_uuid(),
  draft_id    uuid not null references drafts(id) on delete cascade,
  version     integer not null,
  source      draft_version_source not null,
  quote_type  quote_type not null,
  email_subject text,
  email_body  text,
  document    jsonb,
  -- Endringer mot forrige versjon: { "felt": { "for": ..., "etter": ... } }
  diff        jsonb,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (draft_id, version)
);

create index draft_versions_draft_id_idx on draft_versions (draft_id, version);

-- ---------------------------------------------------------------------------
-- agent_runs — kjørelogg
-- ---------------------------------------------------------------------------
create table agent_runs (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  mailbox_connection_id uuid references mailbox_connections(id) on delete set null,
  kind                  agent_run_kind not null,
  status                agent_run_status not null default 'koeyrer',
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  leads_found           integer not null default 0,
  leads_new             integer not null default 0,
  error                 text,
  triggered_by          uuid references users(id) on delete set null
);

create index agent_runs_company_idx on agent_runs (company_id, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at-trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_updated_at before update on companies
  for each row execute function set_updated_at();
create trigger company_brand_updated_at before update on company_brand
  for each row execute function set_updated_at();
create trigger mailbox_connections_updated_at before update on mailbox_connections
  for each row execute function set_updated_at();
create trigger price_list_items_updated_at before update on price_list_items
  for each row execute function set_updated_at();
create trigger leads_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger drafts_updated_at before update on drafts
  for each row execute function set_updated_at();
