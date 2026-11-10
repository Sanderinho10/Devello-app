-- Kundeadressa som eigne felt når ein kunde blir oppretta frå ei ordre.
--
-- Kvifor: «Ny ordre» har no same adressefelt som kontaktkortet (adresse,
-- linje 2, postnr., sted). Til no tok finn_eller_opprett_kunde berre éi
-- adresselinje, så ein ny kunde fekk heile adressa i «address» og tomt
-- postnummer og sted.
--
-- Val som er gjort med vilje:
--
-- 1. Dei nye parametrane har default null, så alle som kallar funksjonen
--    som før (tilbod, leads), held fram uendra.
-- 2. Den gamle signaturen blir fjerna. Med begge til stades ville eit kall
--    med berre dei gamle namna vore tvitydig.
-- 3. Ein eksisterande kunde får adressa fylt inn berre når «address» er tom,
--    og då alle fire felta saman — ei halv adresse frå to kjelder er verre
--    enn ingen.

drop function if exists finn_eller_opprett_kunde(uuid, text, text, text, text, text);

create or replace function finn_eller_opprett_kunde(
  p_company     uuid,
  p_name        text,
  p_email       text default null,
  p_phone       text default null,
  p_contact     text default null,
  p_address     text default null,
  p_address2    text default null,
  p_postal_code text default null,
  p_city        text default null
)
returns uuid
language plpgsql
as $$
declare
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_email    text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone    text := nullif(btrim(coalesce(p_phone, '')), '');
  v_contact  text := nullif(btrim(coalesce(p_contact, '')), '');
  v_address  text := nullif(btrim(coalesce(p_address, '')), '');
  v_address2 text := nullif(btrim(coalesce(p_address2, '')), '');
  v_postnr   text := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_sted     text := nullif(btrim(coalesce(p_city, '')), '');
  v_id       uuid;
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

  -- 2. Same namn, og den me har manglar e-post: det er same kontakt.
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
      insert into customers (company_id, name, email, phone, contact, address, address2, postal_code, city)
      values (p_company, coalesce(v_name, v_email), v_email, v_phone, v_contact, v_address, v_address2, v_postnr, v_sted)
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
         -- Adressa som ei heilskap: berre når kunden ikkje har nokon.
         address2    = case when nullif(address, '') is null and v_address is not null then v_address2 else address2 end,
         postal_code = case when nullif(address, '') is null and v_address is not null then v_postnr else postal_code end,
         city        = case when nullif(address, '') is null and v_address is not null then v_sted else city end,
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
revoke execute on function finn_eller_opprett_kunde(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
