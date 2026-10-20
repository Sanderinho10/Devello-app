-- Kontaktregister: kunderegisteret blir eit register over kundar og
-- leverandørar.
--
-- Kvifor: Same firma kan vere både ein me kjøper av og ein me sel til, og
-- det er tungvint å ha leverandørane ein annan stad enn kundane. Ein
-- kontakt har no to avkryssingar — kunde og leverandør — og minst éi av dei
-- må vere på.
--
-- Tre val som er gjort med vilje:
--
-- 1. Tabellen heiter framleis customers, og customer_id på leads og ordrar
--    står som før. Ein omdøyping ville rørt kvar spørring utan å endre noko
--    for brukaren.
--
-- 2. Alle som finst frå før er kundar (default true). Dei kom inn frå
--    tilbod og ordrar.
--
-- 3. Blir ein kontakt kopla til eit tilbod eller ein ordre, er han kunde.
--    finn_eller_opprett_kunde slår difor på is_customer når han finn ein
--    som berre var leverandør. Det er ikkje eit vilkår for noko: overføringa
--    til PowerOffice Go les kundefelta på ordren, ikkje registeret, og blir
--    ikkje påverka av denne endringa.

alter table customers
  add column is_customer boolean not null default true,
  add column is_supplier boolean not null default false,
  add constraint customers_kunde_eller_leverandor check (is_customer or is_supplier);

comment on table customers is
  'Kontaktregisteret: ein rad per kontakt per selskap — kunde, leverandør eller begge. Leads og ordrar peikar hit via customer_id.';

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

  -- 2. Same namn, og den me har manglar e-post: det er same kontakt, og no
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
     set email       = coalesce(nullif(email, ''), v_email),
         phone       = coalesce(nullif(phone, ''), v_phone),
         contact     = coalesce(nullif(contact, ''), v_contact),
         address     = coalesce(nullif(address, ''), v_address),
         is_customer = true
   where id = v_id
     and (
       not is_customer or
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
