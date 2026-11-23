-- Materiellsøket treffer også på merke (fabrikat).
--
-- Hvorfor: Montøren skriver «schneider» eller «elko stikk» og venter treff.
-- Søket lette bare i varenavnet, og grossistene skriver sjelden merket
-- der — det står i sitt eget felt i varefila (supplier_items.brand).
--
-- Tekstsøket deles nå i ord, og hvert ord må finnes i navn eller merke.
-- Da virker «elko stikk» selv om «ELKO» bare står i merkefeltet, og
-- rekkefølgen på ordene spiller ingen rolle. Siffer er uendret: GTIN
-- først, så eksakt varenummer, så prefiks på varenummer.
--
-- Indeksen er på samme uttrykk som søket bruker (navn + merke), så
-- trigramoppslaget dekker begge feltene. Spørringen bygges med ordene som
-- konstanter — et ord som parameter i en løkke ville ikke brukt indeksen.

create index supplier_items_sok_trgm on supplier_items
  using gin ((name || ' ' || coalesce(brand, '')) gin_trgm_ops);

create or replace function sok_grossistvarer(p_company uuid, p_q text, p_limit int default 20)
returns setof supplier_items
language plpgsql stable
as $$
declare
  v_q     text := btrim(p_q);
  v_ord   text;
  v_vilkar text := '';
begin
  if v_q = '' then
    return;
  end if;

  if v_q ~ '^[0-9]+$' then
    return query
      select *
        from supplier_items
       where company_id = p_company
         and active
         and ((v_q ~ '^[0-9]{8,14}$' and gtin = v_q) or item_no like v_q || '%')
       order by
         case when gtin = v_q then 0 when item_no = v_q then 1 else 2 end,
         name
       limit p_limit;
    return;
  end if;

  -- Hvert ord blir ett vilkår. %, _ og \ i søket er vanlige tegn, ikke jokere.
  foreach v_ord in array regexp_split_to_array(v_q, '\s+') loop
    v_vilkar := v_vilkar || format(
      ' and (name || '' '' || coalesce(brand, '''')) ilike %L',
      '%' || replace(replace(replace(v_ord, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    );
  end loop;

  return query execute
    'select * from supplier_items
      where company_id = $1 and active' || v_vilkar || '
      order by similarity(name || '' '' || coalesce(brand, ''''), $2) desc, name
      limit $3'
    using p_company, v_q, p_limit;
end;
$$;
revoke execute on function sok_grossistvarer(uuid, text, int) from public, anon, authenticated;
