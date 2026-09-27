-- Hvor ofte firmaet faktisk har brukt hver prisrad.
--
-- Bakgrunn: Star Elektro har 241 aktive punktpriser, og flere er plausible
-- svar på samme forespørsel — «8 doble stikkontaktar» kan peke på fire ulike
-- rader, og navnet skiller dem ikke. Agenten valgte på navn alene. Men firmaet
-- har allerede svart i praksis: de har brukt én av dem, flere ganger.
--
-- Telles fra den ENDELIGE versjonen der den er logget, ellers fra drafts-raden.
-- En rad teller først når et menneske lot den stå i det som ble sendt — ellers
-- ville agenten fått sine egne valg tilbake som bevis for at de var riktige.
create or replace function prisrad_bruk(p_company_id uuid)
returns table (price_item_id text, antall bigint, sist date)
language sql
stable
security definer
set search_path = public
as $$
  with endelig as (
    select distinct on (v.draft_id) v.draft_id, v.document
    from draft_versions v
    join drafts d on d.id = v.draft_id
    join leads l on l.id = d.lead_id
    where v.source = 'endelig' and d.confirmed_at is not null and l.company_id = p_company_id
    order by v.draft_id, v.version desc
  ),
  kjelde as (
    select d.id as draft_id, coalesce(e.document, d.document) as document, d.confirmed_at
    from drafts d
    join leads l on l.id = d.lead_id
    left join endelig e on e.draft_id = d.id
    where d.confirmed_at is not null and l.company_id = p_company_id
  )
  -- distinct på draft_id: en rad som står to ganger i samme tilbud er
  -- fortsatt ett tilbud.
  select x.value->>'price_item_id' as price_item_id,
         count(distinct k.draft_id) as antall,
         max(k.confirmed_at)::date as sist
  from kjelde k,
       lateral jsonb_array_elements(coalesce(k.document->'sections','[]')) s,
       lateral jsonb_array_elements(s->'lines') x
  where x.value->>'price_item_id' is not null
  group by 1;
$$;

revoke all on function prisrad_bruk(uuid) from public;
grant execute on function prisrad_bruk(uuid) to service_role;
