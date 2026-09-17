-- Fakturaforslag: frå ordre til fakturautkast i rekneskapssystemet.
--
-- No ligg alt på ordren: tilbodet kunden sa ja til (frosen kopi), timane
-- montøren førte, materiellet — både det manuelle og linjene frå
-- grossistfakturaene. Steg 4 er poenget med heile ordremodulen: eit
-- fakturaforslag som er rett fyrste gong, fordi det er bygd av det som
-- faktisk skjedde. Brukaren redigerer, godkjenner, og forslaget blir lagt
-- som ordre-UTKAST i PowerOffice Go. Kunden fakturerer og sender frå Go —
-- Devello sender aldri.
--
-- Tre val som er gjort med vilje:
--
-- 1. Same prinsipp som tilbodsagenten: modellen bestemmer struktur, tekst og
--    kva som er tillegg — aldri ein pris. Kvar linje peikar på kjelder
--    (tilbodslinjer, timeføringar, materiell-linjer), og koden slår opp
--    beløpa. Skjemaet modellen svarar i har ikkje eit einaste talfelt.
--
-- 2. Føringar som er fakturerte peikar på utkastet (invoice_draft_id). Dei
--    kan aldri fakturerast to gonger, og dei kan ikkje endrast etterpå.
--
-- 3. Alt blir versjonslogga, som draft_versions for tilbod: ai → redigering
--    → overført, med diff. Det er læringsdata: kva agenten trefte, og kva
--    mennesket måtte rette.

create type invoice_draft_status as enum ('utkast', 'godkjent', 'overfort', 'feil');

create table invoice_drafts (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  order_id             uuid not null references orders(id) on delete cascade,
  status               invoice_draft_status not null default 'utkast',
  -- Kva agenten valde og kvifor. Sjå src/lib/faktura/typar.ts for forma.
  strategy             text not null,           -- 'fastpris' | 'fastpris_med_tillegg' | 'tid_og_materiell'
  -- Linjene slik dei skal på fakturaen. Alle beløp er rekna av koden.
  -- [{ id, kind, description, quantity, unit, unit_price, unit_price_manual,
  --    line_total, vat_pct, included, sources: [{ type, id }], ai_reason }]
  lines                jsonb not null,
  totals               jsonb not null,          -- { subtotal, vat, total }
  invoice_text         text,                    -- tekst på fakturaen (kort)
  customer_reference   text,                    -- Deres ref
  notes                text[] not null default '{}',     -- agentens merknader
  questions            text[] not null default '{}',     -- spørsmål brukaren bør svare på før overføring
  ai_model             text,
  generated_at         timestamptz,
  approved_by          uuid references users(id) on delete set null,
  approved_at          timestamptz,
  transfer_provider    accounting_provider,
  transfer_external_id text,                    -- Go: SalesOrder Id
  transfer_order_no    text,                    -- Go: ordrenummer, det brukaren ser
  transfer_customer_no text,
  transferred_at       timestamptz,
  transfer_error       text,
  created_by           uuid references users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index invoice_drafts_order_idx on invoice_drafts (order_id, created_at desc);
-- Éitt levande utkast per ordre. Nytt forslag erstattar det gamle (versjonane ligg under).
create unique index invoice_drafts_ein_aktiv_per_ordre on invoice_drafts (order_id) where status <> 'feil';

comment on table invoice_drafts is
  'Fakturaforslaget for ein ordre. Linjene er rekna av koden frå kjeldene; modellen har berre valt struktur og tekst.';

-- Same idé som draft_versions: ai → redigering → overført, med diff. Læringsdata.
create table invoice_draft_versions (
  id          uuid primary key default gen_random_uuid(),
  draft_id    uuid not null references invoice_drafts(id) on delete cascade,
  version     integer not null,
  source      text not null,                    -- 'ai' | 'redigering' | 'overfort'
  lines       jsonb not null,
  totals      jsonb not null,
  invoice_text text,
  diff        jsonb,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (draft_id, version)
);

-- Føringar som er fakturerte peikar på utkastet. Kan aldri fakturerast to gonger.
alter table time_entries     add column invoice_draft_id uuid references invoice_drafts(id) on delete set null;
alter table material_entries add column invoice_draft_id uuid references invoice_drafts(id) on delete set null;
create index time_entries_invoiced_idx on time_entries (invoice_draft_id) where invoice_draft_id is not null;
create index material_entries_invoiced_idx on material_entries (invoice_draft_id) where invoice_draft_id is not null;

-- Produktmapping mot rekneskapssystemet. Produktkodane ber salskonto og mva i Go.
alter table accounting_connections
  add column product_map jsonb not null default '{}'::jsonb,
  add column settings    jsonb not null default '{}'::jsonb;
comment on column accounting_connections.product_map is
  '{ "arbeid": "DEV-ARB", "materiell": "DEV-MAT", "fastpris": "DEV-FAST", "annet": "DEV-ANN" } — produktkoder i regnskapssystemet.';
comment on column accounting_connections.settings is
  '{ "project_per_order": false } — bruk ordrenummeret som prosjektkode i regnskapssystemet.';

-- Dei nye kolonnene er ikkje hemmelege: inn i grantet frå 0035, slik at
-- innstillingssida kan lese mappinga. client_key står framleis utanfor.
grant select (product_map, settings) on accounting_connections to authenticated;

alter table invoice_drafts enable row level security;
alter table invoice_draft_versions enable row level security;
create policy invoice_drafts_select on invoice_drafts
  for select to authenticated using (company_id = auth_company_id());
create policy invoice_draft_versions_select on invoice_draft_versions
  for select to authenticated using (
    exists (select 1 from invoice_drafts d where d.id = invoice_draft_versions.draft_id
              and d.company_id = auth_company_id())
  );
create trigger invoice_drafts_updated_at before update on invoice_drafts
  for each row execute function set_updated_at();
