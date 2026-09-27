-- Rabatt per gruppe i ett kall, ikke ett per gruppe.
--
-- Onninens rabattfil har rundt 3 000 rabattgrupper. Med sett_rabatt() per
-- gruppe ble det 3 000 oppdateringer som hver skannet alle varene til
-- grossisten (120 000 rader) — 10–20 minutter etter at framdriften sto på
-- 100 %. Nå: én indeks på (supplier_id, discount_group) og én funksjon som
-- tar hele rabattlista som jsonb og oppdaterer i ett UPDATE.

create index if not exists supplier_items_rabattgruppe_idx
  on supplier_items (supplier_id, discount_group);

create or replace function sett_rabattar(p_supplier uuid, p_rabattar jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update supplier_items si
     set discount_pct = r.pct,
         net_price_per_unit = round(si.list_price_per_unit * (1 - r.pct / 100), 4)
    from (
      select key as gruppe, value::numeric as pct
        from jsonb_each_text(p_rabattar)
    ) r
   where si.supplier_id = p_supplier
     and si.discount_group = r.gruppe;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function sett_rabattar(uuid, jsonb) from public, anon, authenticated;
