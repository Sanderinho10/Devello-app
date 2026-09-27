-- Avtalt pris per varenummer fra rabattfila.
--
-- Onninens R4rabatt.txt har, i tillegg til rabatt per gruppe, linjer med
-- rabattype 1: en nettopris (eller rabatt) på ett bestemt varenummer.
-- De overstyrer gruppens rabatt. p_varer er {"varenr": {"n": nettopris,
-- "p": rabatt%}} — nettoprisen er per prisenhet, som listeprisen i
-- varefila, så den deles på qty_per_price_unit for pris per enhet.

create or replace function sett_nettoprisar(p_supplier uuid, p_varer jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update supplier_items si
     set net_price_per_unit = case
           when v.n is not null and v.n > 0 then round(v.n / nullif(si.qty_per_price_unit, 0), 4)
           else round(si.list_price_per_unit * (1 - coalesce(v.p, 0) / 100), 4)
         end,
         discount_pct = case
           when v.n is not null and v.n > 0 and si.list_price > 0 then round((1 - v.n / si.list_price) * 100, 2)
           when v.n is not null and v.n > 0 then 0
           else coalesce(v.p, 0)
         end
    from (
      select key as item_no,
             (value->>'n')::numeric as n,
             (value->>'p')::numeric as p
        from jsonb_each(p_varer)
    ) v
   where si.supplier_id = p_supplier
     and si.item_no = v.item_no;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function sett_nettoprisar(uuid, jsonb) from public, anon, authenticated;
