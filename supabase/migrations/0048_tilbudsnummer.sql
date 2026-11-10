-- Løpenummer på tilbud.
--
-- Kvifor: Kunden, montøren og rekneskapen treng å kunne seie «tilbud 1042»
-- utan å sitere emnet på ein e-post. Same mønster som ordrenummeret i
-- 0032: ein teljar per selskap, delt ut atomisk i databasen, aldri «les og
-- auk» i to steg. Nummeret blir sett fyrste gong agenten lagar eit utkast
-- og står fast gjennom regenerering og nye versjonar — versjonsnummeret
-- (0040) tel inni tilbodet, løpenummeret identifiserer det.

alter table companies add column next_quote_no integer not null default 1000;
comment on column companies.next_quote_no is
  'Neste ledige løpenummer for tilbud. Deles ut av neste_tilbudsnummer(); aldri les og øk i to steg.';

-- drafts har ikkje hatt company_id — leadet har det. Nummeret er unikt per
-- selskap, så kolonnen må finnast her for at indeksen skal kunne seie det.
alter table drafts
  add column company_id uuid references companies(id) on delete cascade,
  add column quote_no   integer;
update drafts d set company_id = l.company_id from leads l where l.id = d.lead_id;

-- Eksisterande tilbod får nummer i den rekkjefølgja dei vart laga.
with nummerert as (
  select d.id, d.company_id,
         999 + row_number() over (partition by d.company_id order by d.created_at, d.id) as nr
    from drafts d
   where d.company_id is not null
)
update drafts d set quote_no = n.nr from nummerert n where n.id = d.id;
update companies c
   set next_quote_no = greatest(c.next_quote_no, coalesce((select max(quote_no) + 1 from drafts d where d.company_id = c.id), 1000));

create unique index drafts_tilbudsnummer_unik on drafts (company_id, quote_no) where quote_no is not null;

-- Atomisk løpenummer. Kallast frå API-et med service role.
create or replace function neste_tilbudsnummer(p_company uuid)
returns integer
language sql
as $$
  update companies
     set next_quote_no = next_quote_no + 1
   where id = p_company
   returning next_quote_no - 1;
$$;
revoke execute on function neste_tilbudsnummer(uuid) from public, anon, authenticated;

-- Set nummer på eit utkast som ikkje har det. Idempotent: har utkastet
-- nummer frå før, kjem det same tilbake, og teljaren står.
create or replace function tildel_tilbudsnummer(p_draft uuid)
returns integer
language plpgsql
as $$
declare
  nr integer;
begin
  select quote_no into nr from drafts where id = p_draft;
  if nr is not null then
    return nr;
  end if;
  update drafts d
     set quote_no = neste_tilbudsnummer(coalesce(d.company_id, (select company_id from leads where id = d.lead_id))),
         company_id = coalesce(d.company_id, (select company_id from leads where id = d.lead_id))
   where d.id = p_draft
     and d.quote_no is null
   returning d.quote_no into nr;
  if nr is null then
    select quote_no into nr from drafts where id = p_draft;
  end if;
  return nr;
end;
$$;
revoke execute on function tildel_tilbudsnummer(uuid) from public, anon, authenticated;
