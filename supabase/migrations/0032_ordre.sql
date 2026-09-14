-- Ordre: det som skjer etter at kunden har sagt ja.
--
-- Tilbudsagenten stopper der tilbudet er sendt. Alt som kommer etterpå —
-- timer, materiell, dokumentasjon, faktura — trenger ett sted å høre hjemme,
-- og det stedet er ordren. Dette er grunnmuren: selve ordren, løpenummeret
-- montøren skriver på grossistbestillingen, og en hendelseslogg. Timer,
-- materiell og faktura kommer i egne migrasjoner og skriver mot denne.
--
-- Tre valg som er gjort med vilje:
--
-- 1. Moduler er en kolonne på selskapet, ikke en rad i abonnementskatalogen.
--    Tilbud skal kunne selges alene, og ordre-pakken er ikke priset ennå.
--    Inntil den er det, styrer companies.moduler både sidemenyen og API-et,
--    og Devello setter den for hånd.
--
-- 2. Ordren fryser tilbudet. Tilbudet kan redigeres videre i tilbudsmodulen
--    etter at ordren er opprettet, men ordren skal vise det kunden faktisk
--    sa ja til. Derfor en kopi i quote_snapshot, ikke en oppslag via draft_id.
--
-- 3. Løpenummeret deles ut av en funksjon som bare service role får kalle.
--    Et «select max + 1» fra to faner samtidig gir to ordrer med samme nummer,
--    og nummeret er det som står på bestillingen hos grossisten.

-- companies
alter table companies
  add column moduler text[] not null default '{tilbud}',
  add column next_order_no integer not null default 1000;
comment on column companies.moduler is
  'Hvilke moduler selskapet har: tilbud, ordre. Styrer sidemeny og API-tilgang. Settes av Devello inntil pakkene er priset.';
comment on column companies.next_order_no is
  'Neste ledige løpenummer for ordre. Deles ut av neste_ordrenummer(); aldri les og øk i to steg.';

-- status
create type order_status as enum ('opna', 'paagaar', 'ferdig', 'fakturert', 'avbrutt');

create table orders (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  -- Løpenummer per selskap. Dette er nummeret montøren skriver på
  -- grossistbestillingen, så det må være kort og menneskelig.
  order_no         integer not null,
  status           order_status not null default 'opna',
  title            text not null,
  -- Kort arbeidsbeskrivelse. Skrevet av agenten ved oppretting fra tilbud,
  -- fritt redigerbar etterpå. Null når ingen har skrevet noe.
  description      text,
  description_source text,            -- 'ai' | 'manuell' | null

  customer_name    text not null default '',
  customer_contact text,
  customer_email   text,
  customer_phone   text,
  -- Adressen der jobben gjøres. Trengs senere for Boligmappa.
  site_address     text,

  -- Hvor ordren kom fra. Begge null for en ordre uten tilbud.
  lead_id          uuid references leads(id) on delete set null,
  draft_id         uuid references drafts(id) on delete set null,
  quote_type       quote_type,
  -- Frosset kopi av tilbudet slik det var da ordren ble opprettet:
  -- { quote_type, document: QuoteDocument | null, totals: QuoteTotals | null }.
  -- Tilbudet kan redigeres videre i tilbudsmodulen; ordren skal vise det
  -- kunden faktisk sa ja til.
  quote_snapshot   jsonb,
  -- Planlagt sum eks. mva fra snapshotet. Null for tid og materiell.
  planned_total    numeric(12, 2),

  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  closed_at        timestamptz,

  unique (company_id, order_no)
);
create index orders_company_status_idx on orders (company_id, status, created_at desc);
-- Ett tilbud gir én ordre. To klikk eller to faner skal svare med den samme.
create unique index orders_ein_per_draft on orders (draft_id) where draft_id is not null;

comment on table orders is
  'En jobb kunden har sagt ja til. Alt som skjer på jobben samles på ordrenummeret.';
comment on column orders.quote_snapshot is
  'Tilbudet slik det var da ordren ble opprettet. Tilbudet kan endres videre; dette kan ikke.';

-- Hendelseslogg. Statusendringer nå; timer, materiell og faktura kommer til
-- å skrive hit senere.
create table order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  kind       text not null,               -- 'oppretta' | 'status' | 'redigert'
  note       text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, created_at desc);

-- Atomisk løpenummer. Kalles fra API-et med service role.
create or replace function neste_ordrenummer(p_company uuid)
returns integer
language sql
as $$
  update companies
     set next_order_no = next_order_no + 1
   where id = p_company
   returning next_order_no - 1;
$$;
-- Bare service role skal dele ut nummer.
revoke execute on function neste_ordrenummer(uuid) from public, anon, authenticated;

alter table orders enable row level security;
alter table order_events enable row level security;

-- Lesing innenfor eget selskap. Skriving går gjennom API-et med service role,
-- som subscriptions og agent_lessons — ingen insert/update-policy her.
create policy orders_select on orders
  for select to authenticated using (company_id = auth_company_id());
create policy order_events_select on order_events
  for select to authenticated using (
    exists (select 1 from orders o where o.id = order_events.order_id
              and o.company_id = auth_company_id())
  );

create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();
