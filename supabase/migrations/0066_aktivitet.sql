-- Aktivitetslogg: hvem gjorde hva med et tilbud eller en faktura.
--
-- Hvorfor: Når to-tre stykker deler på tilbud og fakturaer, er det første
-- spørsmålet «hvem sendte dette?» eller «hvem godkjente fakturaen?». Ordren
-- har hatt sin egen logg (order_events) fra starten. Tilbud og faktura har
-- bare hatt tidspunkt, og stort sett ikke hvem.
--
-- Hvordan:
--   - Én rad per handling: opprettet, bekreftet, sendt, godkjent, overført …
--   - objekt + objekt_id peker på det handlingen gjelder. For tilbud er det
--     leadet, siden det finnes før utkastet og står i adressen.
--   - user_id er null når ingen person sto bak, for eksempel når agenten
--     lagde utkastet av seg selv.
--   - Bare serveren skriver. Brukerne leser sitt eget selskap.
--   - Historikk som finnes fra før (bekreftede tilbud, fakturaer som er
--     opprettet, godkjent og overført) fylles inn første gang.
--   - Kan kjøres flere ganger. Ingen semikolon i tekstene.

create table if not exists aktivitet (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  objekt     text not null check (objekt in ('tilbud', 'faktura')),
  objekt_id  uuid not null,
  handling   text not null,
  detalj     text,
  user_id    uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists aktivitet_objekt_idx on aktivitet (objekt, objekt_id, created_at desc);

comment on table aktivitet is
  'Hvem gjorde hva med et tilbud eller en faktura. Ordren har sin egen logg i order_events.';
comment on column aktivitet.objekt_id is
  'tilbud: leads.id. faktura: invoice_drafts.id.';
comment on column aktivitet.user_id is
  'Hvem som gjorde det. Null når ingen person sto bak, som når agenten lagde utkastet selv.';

alter table aktivitet enable row level security;

drop policy if exists aktivitet_select on aktivitet;
create policy aktivitet_select on aktivitet
  for select using (company_id = auth_company_id());

-- Historikken fra før. Bare når tabellen er tom, så en ny kjøring ikke
-- legger alt inn to ganger.
do $$
begin
  if exists (select 1 from aktivitet) then
    return;
  end if;

  -- Tilbud: hver gang et utkast ble bekreftet, og av hvem.
  insert into aktivitet (company_id, objekt, objekt_id, handling, detalj, user_id, created_at)
  select l.company_id, 'tilbud', l.id, 'bekreftet',
         case when v.revisjon > 1 then 'Versjon ' || v.revisjon end,
         v.created_by, v.created_at
  from draft_versions v
  join drafts d on d.id = v.draft_id
  join leads l on l.id = d.lead_id
  where v.source = 'endelig'

  union all
  -- Tilbud: når det ble sendt. Hvem vet vi ikke for det som er sendt før nå.
  select l.company_id, 'tilbud', l.id, 'sendt',
         case when v.revisjon > 1 then 'Versjon ' || v.revisjon end,
         null, v.sendt_at
  from draft_versions v
  join drafts d on d.id = v.draft_id
  join leads l on l.id = d.lead_id
  where v.source = 'endelig' and v.sendt_at is not null

  union all
  -- Faktura: opprettet, av hvem.
  select f.company_id, 'faktura', f.id,
         case when f.order_id is null then 'opprettet' else 'forslag' end,
         null, f.created_by, f.created_at
  from invoice_drafts f

  union all
  -- Faktura: godkjent.
  select f.company_id, 'faktura', f.id, 'godkjent', null, f.approved_by, f.approved_at
  from invoice_drafts f
  where f.approved_at is not null

  union all
  -- Faktura: overført til regnskapet. Hvem står på versjonen som ble overført.
  select f.company_id, 'faktura', f.id, 'overfort',
         case when f.transfer_order_no is not null then 'Ordre ' || f.transfer_order_no || ' i regnskapssystemet' end,
         (select v.created_by from invoice_draft_versions v
           where v.draft_id = f.id and v.source = 'overfort'
           order by v.version desc limit 1),
         f.transferred_at
  from invoice_drafts f
  where f.transferred_at is not null
    and f.status = 'overfort';
end $$;
