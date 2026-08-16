-- Referanselisten — agentens hukommelse.
--
-- Hver gang et tilbud bekreftes med «Bekreft og lag kladd», lagres brukerens
-- ENDELIGE versjon her (ikke agentens første utkast — det er fasiten), tagget
-- med nøkkelord slik at neste generering kan slå opp de 3–5 mest relevante
-- tidligere tilbudene («elbillader», «sikringsskap», «bad») uten å dra hele
-- historikken inn i konteksten.
--
-- Speiler devello-agent/referanseliste/LES_MEG.md. Brukeren ser aldri listen;
-- den redigeres aldri for hånd. Alt lagres, ingenting slettes.

create table quote_references (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  draft_id        uuid references drafts(id) on delete set null,
  lead_id         uuid references leads(id) on delete set null,

  quote_type      quote_type not null,
  title           text not null,
  -- 'forbruker' | 'bedrift' | null når det ikke lot seg avgjøre.
  customer_type   text,
  -- Nøkkelord for gjenfinning: jobbtype, komponenter, romtype, bygningstype.
  -- Små bokstaver, ubestemt entall, 3–8 stk. F.eks.
  -- {elbillader, garasje, ny kurs, enebolig}
  tags            text[] not null default '{}',
  -- 1–2 setninger om hva jobben var. Det er dette (+ tags) søket treffer på.
  summary         text,
  -- Kompakte poster: [{beskrivelse, antall, enhet, enhetspris_eks_mva}]
  lines           jsonb not null default '[]'::jsonb,
  assumptions     jsonb not null default '[]'::jsonb,
  email_subject   text,
  email_body      text,
  subtotal_ex_vat numeric(12, 2),

  -- Ble utkastet endret av brukeren før bekreftelse? De redigerte er ekstra
  -- verdifulle: de viser hva agenten bommet på.
  edited_by_user  boolean not null default false,
  -- null | 'vunnet' | 'tapt' — settes senere når vi vet det.
  outcome         text,

  -- Alt søkbart samlet i én tekst, så tsvector-en kan genereres av databasen.
  search_text     text not null default '',
  search          tsvector generated always as
                    (to_tsvector('norwegian', search_text)) stored,

  confirmed_at    timestamptz not null default now()
);

create index quote_references_company_idx
  on quote_references (company_id, quote_type, confirmed_at desc);
create index quote_references_search_idx on quote_references using gin (search);
create index quote_references_tags_idx   on quote_references using gin (tags);

alter table quote_references enable row level security;
-- Brukeren skal aldri se listen fra nettleseren; bare service role (API-rutene)
-- leser og skriver. Ingen policy => ingen tilgang for authenticated.

-- ---------------------------------------------------------------------------
-- sok_referanser — det agenten kaller (via backend) for å finne lignende tilbud.
--
-- Tenant-ID settes ALLTID av backend fra sesjonen, aldri av noe agenten sender.
-- Sortering: tekst-treff → samme tilbudstype → vunnet → nyest.
-- Faller tilbake til de nyeste av samme type når søket ikke treffer noe.
-- ---------------------------------------------------------------------------
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
    select r.*,
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
  select id, company_id, draft_id, lead_id, quote_type, title, customer_type,
         tags, summary, lines, assumptions, email_subject, email_body,
         subtotal_ex_vat, edited_by_user, outcome, search_text, search,
         confirmed_at
  from scored
  order by
    (rank + tag_hits * 0.5) desc,
    (p_quote_type is not null and quote_type = p_quote_type) desc,
    (outcome = 'vunnet') desc,
    confirmed_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 8));
$$;

revoke all on function sok_referanser(uuid, text, quote_type, integer) from public;
