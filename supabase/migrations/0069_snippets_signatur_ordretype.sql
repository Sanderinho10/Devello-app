-- Snippets, ordretype, signaturer og nye versjoner av dokumentasjon.
--
-- Hvorfor: Etter første runde med Star Elektro mangler fem ting i ordre-
-- modulen, og alle trenger litt i databasen.
--
--   1. Snippets. Ferdige tekster firmaet lager selv (elbillader,
--      sikringsskap, kjøkken) og setter inn i beskrivelsen på en ordre,
--      som snippets i HubSpot. Så mange de vil, og hvem som helst i
--      selskapet kan lage en.
--   2. Ordretype. En ordre uten tilbud har ingen tilbudstype, men kontoret
--      må likevel vite om jobben er fastpris eller timer og materiell når
--      den skal faktureres. order_type står på alle ordrer. For ordrer fra
--      tilbud følger den tilbudstypen.
--   3. Signaturer. Samsvarserklæringen skal ha en ekte signatur. Den som
--      godkjenner velger blant signaturbilder firmaet har lagret. Bildet
--      ligger i order-documents-bøtta under <selskap>/signaturer/.
--   4. Til godkjenning. Montøren fyller ut og skriver navnet sitt, og ber
--      om godkjenning. approval_requested_at sier at skjemaet venter på
--      den som har signatur.
--   5. Ny versjon. Gjenåpnes et dokument som alt er sendt til Boligmappa,
--      lages en kopi. Begge versjonene blir liggende. copied_from peker på
--      forrige, og revision teller.
--
-- Kan kjøres flere ganger. Ingen semikolon i tekstene.

-- snippets

create table if not exists order_snippets (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  text       text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_snippets_company_idx on order_snippets (company_id, lower(name));

comment on table order_snippets is
  'Ferdige tekster som settes inn i beskrivelsen på en ordre. Laget av firmaet selv.';

alter table order_snippets enable row level security;
drop policy if exists order_snippets_select on order_snippets;
create policy order_snippets_select on order_snippets
  for select to authenticated using (company_id = auth_company_id());

drop trigger if exists order_snippets_updated_at on order_snippets;
create trigger order_snippets_updated_at before update on order_snippets
  for each row execute function set_updated_at();

-- ordretype

alter table orders add column if not exists order_type text;
alter table orders drop constraint if exists orders_order_type_gyldig;
alter table orders add constraint orders_order_type_gyldig
  check (order_type is null or order_type in ('fastpris', 'tid_og_materiell'));

comment on column orders.order_type is
  'fastpris eller tid_og_materiell. Følger tilbudstypen for ordrer fra tilbud, velges for hånd ellers. Null = ikke valgt.';

update orders
   set order_type = case when quote_type = 'tid_og_materiell' then 'tid_og_materiell' else 'fastpris' end
 where order_type is null and quote_type is not null;

-- Kontoret filtrerer ut ferdige ordrer for å fakturere dem.
create index if not exists orders_ferdig_idx on orders (company_id, closed_at desc) where status = 'ferdig';

-- signaturer

create table if not exists company_signatures (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- Navnet som står under signaturen på arket.
  name       text not null,
  -- «Faglig ansvarlig», «Installatør». Valgfri.
  title      text,
  -- Brukeren signaturen tilhører. Den brukeren kan signere med den selv.
  -- Administrator kan velge alle.
  user_id    uuid references users(id) on delete set null,
  image_path text not null,
  mime_type  text not null default 'image/png',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists company_signatures_company_idx on company_signatures (company_id, lower(name));

comment on table company_signatures is
  'Lagrede signaturbilder. Brukes når samsvarserklæringen godkjennes.';

alter table company_signatures enable row level security;
drop policy if exists company_signatures_select on company_signatures;
create policy company_signatures_select on company_signatures
  for select to authenticated using (company_id = auth_company_id());

-- dokumentasjon

alter table order_documents
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_requested_by uuid references users(id) on delete set null,
  add column if not exists signature_id uuid references company_signatures(id) on delete set null,
  add column if not exists copied_from uuid references order_documents(id) on delete set null,
  add column if not exists revision integer not null default 1;

comment on column order_documents.approval_requested_at is
  'Montøren har fylt ut og bedt om godkjenning. Skjemaet er fortsatt utkast til noen med signatur godkjenner.';
comment on column order_documents.copied_from is
  'Forrige versjon. Satt når et dokument som alt var sendt til Boligmappa ble gjenåpnet som kopi.';
