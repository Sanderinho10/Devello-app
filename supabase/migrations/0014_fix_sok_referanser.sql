-- 0012 la til reference_quote_id på quote_references, men sok_referanser fra
-- 0011 hadde en eksplisitt kolonneliste i sluttselecten. Da stemte ikke
-- funksjonens radtype lenger med tabellens: «return type mismatch in function
-- declared to return quote_references» på hvert eneste kall.
--
-- Fiksen er å slutte å liste kolonner: scored-CTE-en bærer hele raden som én
-- kompositt («ref») pluss rangeringstallene, og sluttselecten pakker den ut
-- med (ref).*. Da følger funksjonen tabellen automatisk — neste kolonne som
-- legges til kan ikke brekke den.

create or replace function sok_referanser(
  p_company_id uuid,
  p_query      text,
  p_quote_type quote_type default null,
  p_limit      integer default 5
)
returns setof quote_references
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select case
      when coalesce(trim(p_query), '') = '' then null
      else websearch_to_tsquery('norwegian', p_query)
    end as tsq
  ),
  scored as (
    select r as ref,
           case when q.tsq is null then 0 else ts_rank(r.search, q.tsq) end as rank,
           -- Egen bonus for tag-treff: ett ord i spørringen som er en hel tag.
           (select count(*) from unnest(r.tags) t
             where position(lower(t) in lower(coalesce(p_query, ''))) > 0) as tag_hits
    from quote_references r, q
    where r.company_id = p_company_id
      and (q.tsq is null or r.search @@ q.tsq
           or exists (select 1 from unnest(r.tags) t
                       where position(lower(t) in lower(coalesce(p_query, ''))) > 0))
  )
  select (ref).*
  from scored
  order by
    (rank + tag_hits * 0.5) desc,
    (p_quote_type is not null and (ref).quote_type = p_quote_type) desc,
    ((ref).outcome = 'vunnet') desc,
    (ref).confirmed_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 8));
$$;

revoke all on function sok_referanser(uuid, text, quote_type, integer) from public;
