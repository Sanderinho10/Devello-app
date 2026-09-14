-- Grossistkatalog: materiellet montøren fører på ordren.
--
-- Materiell skal velges fra grossistens egen varefil (EFO/NELFO 4.0 fra
-- Onninen, Ahlsell, Solar …), ikke skrives inn fritt. Da får hver linje et
-- elnummer og en nettopris vi kan stole på, og fakturaforslaget i steg 4 har
-- et tall å regne fra.
--
-- Tre ting som er gjort med vilje:
--
-- 1. Katalogen er noe annet enn kundens egen prisfil (price_list_items).
--    Prisfilen er det firmaet selger for; katalogen er det firmaet kjøper for.
--    De to blandes ikke, og tilbudsagenten ser ikke katalogen.
--
-- 2. Prisen lagres per måleenhet, ikke per prisenhet. Grossisten priser
--    kabel per 100 meter (HMT); montøren fører meter. Omregningen skjer én
--    gang, ved import, og feltene fra fila står igjen for sporbarhet.
--
-- 3. Søket skjer i Postgres. Med 200 000 varer per grossist er det
--    trigramindeksen på navnet og prefiksindeksen på nummeret som gjør at
--    «stikk» svarer på under 100 ms — ikke noe vi kan gjøre i Node.

create extension if not exists pg_trgm;

-- Grossistar per selskap. Éin rad per grossist selskapet handlar hos.
create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,                 -- «Onninen», «Ahlsell», «Solar»
  -- Kundenummeret hos grossisten. Står i prisfila (KundeNr i VH) og på fakturaen.
  customer_no   text,
  -- Frå fila: SelgersID (org.nr) og firmanavn, så vi kan sjå at fila er frå rett grossist.
  seller_id     text,
  active        boolean not null default true,
  last_import_at     timestamptz,
  last_import_status text,                     -- 'ok' | 'feil'
  last_import_note   text,                     -- «12 431 varer, 9 812 med rabatt»
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, name)
);

-- Varene. Per selskap og grossist — listeprisar er like for alle kundar hos
-- ein grossist, men rabatten er per kunde, og fila kjem frå kundens eige
-- FTP-område. Blir det mange selskap, kan katalogen delast per grossist
-- seinare; elnummeret er nøkkelen som gjer det mogleg.
create table supplier_items (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  supplier_id        uuid not null references suppliers(id) on delete cascade,
  -- VareMrk + VareNr frå fila. item_no er elnummeret (VareMrk 1) når det finst.
  item_kind          smallint not null,          -- 0 ukjent, 1 elnr, 2 EAN, 3 fabrikant, 4 NRF, 9 tillegg
  item_no            text not null,
  name               text not null,              -- VaBetg (+ VaBetg2)
  -- Måleeininga montøren fører i: stk, m, l, kg (MåleEnhet 1–4).
  unit               text not null,
  -- Prisenhet frå fila (UN-kode, t.d. EA, MTR, HMT) og kor mange måleeiningar
  -- ho dekkjer (Mengde/10000). Behalde for sporbarheit — appen reknar alt om
  -- til pris per måleeining.
  price_unit         text,
  qty_per_price_unit numeric(12, 4) not null default 1,
  -- Pris per prisenhet slik fila seier (Pris/100), og det vi faktisk brukar.
  list_price         numeric(12, 2) not null,
  list_price_per_unit numeric(12, 4) not null,
  discount_group     text,
  discount_pct       numeric(6, 2),              -- frå rabatt-/pristilbodsfil, null utan
  net_price_per_unit numeric(12, 4),             -- listepris × (1 − rabatt), null utan rabatt
  brand              text,                       -- Fabrikat
  product_type       text,                       -- Type
  stocked            boolean,                    -- Lagerført J/N
  sales_pack         numeric(12, 4),             -- SalgsPakning/10000
  block_no           text,                       -- BlokkNummer (EFO-basen)
  gtin               text,                       -- frå VA-post med VaType V og VareMrk 2, om det finst
  active             boolean not null default true,  -- Status 3 = utgått → false
  price_date         date,
  imported_at        timestamptz not null default now(),
  unique (supplier_id, item_kind, item_no)
);

create index supplier_items_company_idx on supplier_items (company_id, supplier_id, active);
-- Søk: montøren skriv «stikk» eller «1234567». Trigram på namn, prefiks på nummer.
-- text_pattern_ops: en vanlig btree dekker ikke «like '1234%'» under en
-- nb_NO/en_US-collation, og da leser Postgres hele tabellen for et elnummer.
create index supplier_items_item_no_idx on supplier_items (company_id, item_no text_pattern_ops);
create index supplier_items_name_trgm on supplier_items using gin (name gin_trgm_ops);

-- Standardpåslag på materiell ved fakturering, i prosent.
alter table companies add column materials_markup_pct numeric(5, 2) not null default 25;
comment on column companies.materials_markup_pct is
  'Standardpåslag på materiell i prosent. Kopieres inn på hver materiellinje og kan overstyres der.';

-- Søk i katalogen. Siffer → prefiks på varenummer; ellers trigram på navn.
-- Kalles fra API-et med service role, som neste_ordrenummer().
create or replace function sok_grossistvarer(p_company uuid, p_q text, p_limit int default 20)
returns setof supplier_items
language sql stable
as $$
  select *
    from supplier_items
   where company_id = p_company
     and active
     and (
       (p_q ~ '^[0-9]+$' and item_no like p_q || '%')
       or (p_q !~ '^[0-9]+$' and name ilike '%' || p_q || '%')
     )
   order by
     case when item_no = p_q then 0 else 1 end,
     similarity(name, p_q) desc,
     name
   limit p_limit;
$$;
revoke execute on function sok_grossistvarer(uuid, text, int) from public, anon, authenticated;

-- Rabatt per rabattgruppe, fra rabattfila. Setter prosenten og regner
-- nettoprisen om i samme setning, så de to aldri kan sprike. Returnerer
-- antall varer som ble truffet.
create or replace function sett_rabatt(p_supplier uuid, p_gruppe text, p_pct numeric)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update supplier_items
     set discount_pct = p_pct,
         net_price_per_unit = round(list_price_per_unit * (1 - p_pct / 100), 4)
   where supplier_id = p_supplier
     and discount_group = p_gruppe;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function sett_rabatt(uuid, text, numeric) from public, anon, authenticated;

-- Etter en ny varefil har listeprisene endret seg, men rabatten per gruppe
-- står. Nettoprisen må følge listeprisen — ellers ville en prisøkning hos
-- grossisten aldri nådd materiellinjene.
create or replace function rekn_om_nettoprisar(p_supplier uuid)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update supplier_items
     set net_price_per_unit = round(list_price_per_unit * (1 - discount_pct / 100), 4)
   where supplier_id = p_supplier
     and discount_pct is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function rekn_om_nettoprisar(uuid) from public, anon, authenticated;

alter table suppliers enable row level security;
alter table supplier_items enable row level security;
create policy suppliers_select on suppliers
  for select to authenticated using (company_id = auth_company_id());
create policy supplier_items_select on supplier_items
  for select to authenticated using (company_id = auth_company_id());

create trigger suppliers_updated_at before update on suppliers
  for each row execute function set_updated_at();
