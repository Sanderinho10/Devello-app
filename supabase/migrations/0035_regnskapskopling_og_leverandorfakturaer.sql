-- Leverandørfakturaer fra regnskapssystemet, inn på ordren.
--
-- Grossisten sender fakturaen som EHF rett til kundens regnskapssystem
-- (PowerOffice Go). Devello er ikke fakturamottak — regnskapet bor i Go.
-- Men EHF-fakturaen har linjer med elnummer, mengde og pris, og en
-- ordrereferanse. Go gir ut original-XML-en via API. Så vi henter
-- fakturahodene, laster ned XML-en, leser linjene, finner ordrenummeret
-- montøren skrev på bestillingen, og legger linjene på ordren som materiell
-- med source = 'faktura'. Kunden endrer ingenting i sin egen flyt.
--
-- Tre valg som er gjort med vilje:
--
-- 1. Client key er hemmelig og leses aldri fra nettleseren. Samme grep som
--    0007 gjorde for postkassen: kolonnerettigheter bestemmer HVA som kan
--    leses, policyen HVILKE rader. Nøkkelkolonnen står utenfor grantet.
--
-- 2. provider-kolonnen finnes fra dag én. Tripletex kommer i steg 6 og skal
--    bruke de samme tabellene — bare klienten i lib/regnskap er per system.
--
-- 3. Materiell fra faktura peker tilbake til fakturalinja, og en manuell
--    linje som fakturaen gjør overflødig peker på den som erstattet den.
--    Montørens føring forsvinner ikke; den går ut av summen og står igjen
--    som «erstattet av faktura», så det er mulig å se hva som ble ført og
--    hva som ble fakturert.

create type accounting_provider as enum ('poweroffice', 'tripletex');
create type accounting_env as enum ('production', 'demo');
create type connection_status as enum ('aktiv', 'feil', 'kopla_fra');

-- Koplinga til rekneskapssystemet. Éin per selskap (steg 6 kan opne for
-- fleire). Client key er hemmeleg: ingen policy for authenticated, som
-- tokenane i mailbox_connections.
create table accounting_connections (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  provider       accounting_provider not null,
  environment    accounting_env not null default 'production',
  client_key     text not null,
  status         connection_status not null default 'aktiv',
  status_reason  text,
  -- Vannmerke for henting: nyaste LastChangedDateTimeOffset vi har sett.
  sync_cursor    timestamptz,
  last_sync_at   timestamptz,
  last_sync_note text,                 -- «12 nye, 9 kopla, 3 ukopla»
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, provider)
);

create type invoice_match_status as enum ('kopla', 'delvis', 'ukopla', 'ignorert');

create table supplier_invoices (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  connection_id       uuid not null references accounting_connections(id) on delete cascade,
  provider            accounting_provider not null,
  external_id         text not null,        -- POGO: Id (voucher-uuid)
  voucher_no          bigint,
  voucher_type        text not null,        -- IncomingInvoice | IncomingCreditNote
  invoice_no          text,
  voucher_date        date,
  due_date            date,
  supplier_external_id text,
  supplier_no         text,
  supplier_name       text,
  supplier_org_nr     text,
  currency            text,
  net_amount          numeric(14, 2),
  total_amount        numeric(14, 2),
  -- Referansar vi fann: POGO PurchaseOrderReference, ProjectCode, og frå EHF:
  -- OrderReference, BuyerReference, Note, kontaktnamn. Rått, for feilsøking.
  references_found    text[] not null default '{}',
  has_ehf             boolean not null default false,
  ehf_storage_path    text,                 -- bucket 'supplier-invoices', XML-en som ho kom
  ehf_parsed_at       timestamptz,
  parse_error         text,
  match_status        invoice_match_status not null default 'ukopla',
  -- Sett når heile fakturaen er kopla til éin ordre. Linjer kan òg koplast kvar for seg.
  order_id            uuid references orders(id) on delete set null,
  line_count          integer not null default 0,
  matched_line_count  integer not null default 0,
  raw                 jsonb,                -- POGO-objektet
  fetched_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, provider, external_id)
);
create index supplier_invoices_company_idx on supplier_invoices (company_id, match_status, voucher_date desc);
create index supplier_invoices_order_idx on supplier_invoices (order_id) where order_id is not null;

create table supplier_invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  invoice_id        uuid not null references supplier_invoices(id) on delete cascade,
  line_no           text,
  item_no           text,                   -- elnummer om funne
  gtin              text,
  name              text not null,
  description       text,
  quantity          numeric(12, 3) not null,
  unit              text not null,          -- stk | m | kg | l — omsett frå unitCode
  unit_price        numeric(12, 4) not null,-- netto per eining = LineExtensionAmount / quantity
  line_total        numeric(14, 2) not null,
  vat_pct           numeric(5, 2),
  order_reference   text,                   -- linjenivå-ref om ho finst, elles hovudets
  supplier_item_id  uuid references supplier_items(id) on delete set null,
  order_id          uuid references orders(id) on delete set null,
  material_entry_id uuid references material_entries(id) on delete set null,
  status            invoice_match_status not null default 'ukopla',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index supplier_invoice_lines_invoice_idx on supplier_invoice_lines (invoice_id);
create index supplier_invoice_lines_order_idx on supplier_invoice_lines (order_id) where order_id is not null;

-- Materiell-linjer som kom frå ei faktura peikar tilbake, og ei manuell linje
-- som fakturaen har gjort overflødig peikar på den som erstatta henne.
alter table material_entries
  add column invoice_line_id uuid references supplier_invoice_lines(id) on delete set null,
  add column replaced_by uuid references material_entries(id) on delete set null;
create index material_entries_invoice_line_idx on material_entries (invoice_line_id) where invoice_line_id is not null;

alter table accounting_connections enable row level security;
alter table supplier_invoices enable row level security;
alter table supplier_invoice_lines enable row level security;
create policy supplier_invoices_select on supplier_invoices
  for select to authenticated using (company_id = auth_company_id());
create policy supplier_invoice_lines_select on supplier_invoice_lines
  for select to authenticated using (company_id = auth_company_id());

-- Statusen på koplinga skal kunne lesast i UI utan nøkkelen. Same grep som
-- 0007 gjorde for postkassa: kolonnerettar bestemmer kva som kan lesast,
-- policyen kva rader. client_key står utanfor grantet og feilar lukka.
revoke all on accounting_connections from anon, authenticated;
grant select (
  id,
  company_id,
  provider,
  environment,
  status,
  status_reason,
  sync_cursor,
  last_sync_at,
  last_sync_note,
  created_at,
  updated_at
) on accounting_connections to authenticated;
create policy accounting_connections_select on accounting_connections
  for select to authenticated using (company_id = auth_company_id());

insert into storage.buckets (id, name, public)
  values ('supplier-invoices', 'supplier-invoices', false)
  on conflict (id) do nothing;

create trigger accounting_connections_updated_at before update on accounting_connections
  for each row execute function set_updated_at();
create trigger supplier_invoices_updated_at before update on supplier_invoices
  for each row execute function set_updated_at();
create trigger supplier_invoice_lines_updated_at before update on supplier_invoice_lines
  for each row execute function set_updated_at();
