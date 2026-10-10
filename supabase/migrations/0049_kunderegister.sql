-- Kunderegister.
--
-- Kvifor: Kunden finst i dag berre som tekstfelt på leadet, i tilbuds-
-- dokumentet og på ordren — same person tre stader, utan noko som bind dei
-- saman. Eit enkelt register gjev ein rad per kunde og ein peikar frå lead
-- og ordre dit, så ein kan opne kunden og sjå alle tilbod, ordrar og
-- fakturaforslag som høyrer til.
--
-- Tre val som er gjort med vilje:
--
-- 1. Kundefelta på lead, tilbod og ordre står som før. Registeret er ein
--    peikar i tillegg, ikkje ein erstatning: ordren skal framleis vise den
--    kontaktpersonen som gjaldt på jobben, sjølv om kunden seinare byter.
--
-- 2. Kundar blir kopla automatisk. Ein ny kunde oppstår fyrste gong eit
--    tilbod eller ein ordre har eit namn eller ei e-postadresse me ikkje har
--    sett før. Treff går på e-post fyrst, så på namn — berre når den me har
--    med namnet manglar e-post, så to ulike «Ola Nordmann» ikkje blir slått
--    saman berre fordi dei heiter det same.
--
-- 3. Berre service role skriv. RLS gjev lesing til eige selskap; API-et
--    skriv med company_id frå sesjonen, som alt anna.

create table customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  contact     text,
  email       text,
  phone       text,
  address     text,
  org_nr      text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table customers is
  'Kunderegisteret: ein rad per kunde per selskap. Leads og ordrar peikar hit via customer_id.';

create index customers_company_name_idx on customers (company_id, lower(name));
-- Éi e-postadresse er éin kunde innanfor selskapet. Tomme adresser er ikkje med.
create unique index customers_company_email_unik
  on customers (company_id, lower(email)) where email is not null and email <> '';

create trigger customers_updated_at before update on customers
  for each row execute function set_updated_at();

alter table customers enable row level security;
create policy customers_select on customers
  for select to authenticated using (company_id = auth_company_id());

alter table leads  add column customer_id uuid references customers(id) on delete set null;
alter table orders add column customer_id uuid references customers(id) on delete set null;
create index leads_customer_idx  on leads  (customer_id) where customer_id is not null;
create index orders_customer_idx on orders (customer_id) where customer_id is not null;

-- Finn kunden som passar, eller opprett ein ny. Fyller inn felt som manglar
-- på ein kunde me alt har (e-post, telefon, adresse), men skriv aldri over
-- noko som står der. Returnerer null når det ikkje er noko å kjenne kunden
-- att på — korkje namn eller e-post.
create or replace function finn_eller_opprett_kunde(
  p_company uuid,
  p_name    text,
  p_email   text default null,
  p_phone   text default null,
  p_contact text default null,
  p_address text default null
)
returns uuid
language plpgsql
as $$
declare
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_id      uuid;
begin
  if v_name is null and v_email is null then
    return null;
  end if;

  -- 1. E-post er den sikraste nøkkelen.
  if v_email is not null then
    select id into v_id from customers
     where company_id = p_company and lower(email) = v_email
     limit 1;
  end if;

  -- 2. Same namn, og den me har manglar e-post: det er same kunde, og no
  --    veit me adressa.
  if v_id is null and v_name is not null then
    select id into v_id from customers
     where company_id = p_company
       and lower(name) = lower(v_name)
       and (email is null or email = '' or v_email is null)
     order by created_at
     limit 1;
  end if;

  if v_id is null then
    begin
      insert into customers (company_id, name, email, phone, contact, address)
      values (p_company, coalesce(v_name, v_email), v_email, v_phone, v_contact, v_address)
      returning id into v_id;
    exception when unique_violation then
      -- To ordrar på same kunde i same sekund: den andre finn den fyrste.
      select id into v_id from customers
       where company_id = p_company and lower(email) = v_email;
    end;
    return v_id;
  end if;

  update customers
     set email   = coalesce(nullif(email, ''), v_email),
         phone   = coalesce(nullif(phone, ''), v_phone),
         contact = coalesce(nullif(contact, ''), v_contact),
         address = coalesce(nullif(address, ''), v_address)
   where id = v_id
     and (
       (nullif(email, '') is null and v_email is not null) or
       (nullif(phone, '') is null and v_phone is not null) or
       (nullif(contact, '') is null and v_contact is not null) or
       (nullif(address, '') is null and v_address is not null)
     );
  return v_id;
end;
$$;
revoke execute on function finn_eller_opprett_kunde(uuid, text, text, text, text, text)
  from public, anon, authenticated;

-- Backfill. Ordrane fyrst — dei har dei rikaste kundefelta — så leads, der
-- tilbodsdokumentet står over avsendaren på e-posten.
do $$
declare
  r record;
begin
  for r in
    select id, company_id, customer_name, customer_email, customer_phone, customer_contact, site_address
      from orders
     where customer_id is null
     order by created_at
  loop
    update orders
       set customer_id = finn_eller_opprett_kunde(
         r.company_id, r.customer_name, r.customer_email, r.customer_phone, r.customer_contact, r.site_address)
     where id = r.id;
  end loop;

  -- Leads som alt har ein ordre arvar kunden derifrå.
  update leads l
     set customer_id = o.customer_id
    from orders o
   where o.lead_id = l.id
     and o.customer_id is not null
     and l.customer_id is null;

  for r in
    select l.id, l.company_id,
           coalesce(nullif(btrim(d.document->'customer'->>'name'), ''),    l.from_name)  as name,
           coalesce(nullif(btrim(d.document->'customer'->>'email'), ''),   l.from_email) as email,
           nullif(btrim(d.document->'customer'->>'phone'), '')   as phone,
           nullif(btrim(d.document->'customer'->>'contact'), '') as contact,
           nullif(btrim(d.document->'customer'->>'address'), '') as address
      from leads l
      left join drafts d on d.lead_id = l.id
     where l.customer_id is null
     order by l.created_at
  loop
    update leads
       set customer_id = finn_eller_opprett_kunde(
         r.company_id, r.name, r.email, r.phone, r.contact, r.address)
     where id = r.id;
  end loop;
end;
$$;
