-- Row Level Security. Alt er scoped til company_id.
-- Service role (API-rutene) omgår RLS og gjer sine eigne sjekkar.

-- Hjelpefunksjon: kva company høyrer den innlogga brukaren til?
-- security definer så den kan lese users utan å trigge RLS på seg sjølv.
create or replace function auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from users where id = auth.uid();
$$;

alter table companies          enable row level security;
alter table company_brand      enable row level security;
alter table users              enable row level security;
alter table mailbox_connections enable row level security;
alter table price_list_items   enable row level security;
alter table reference_quotes   enable row level security;
alter table leads              enable row level security;
alter table drafts             enable row level security;
alter table draft_versions     enable row level security;
alter table agent_runs         enable row level security;

-- companies: les eige selskap, oppdater tone-innstillingar.
create policy companies_select on companies
  for select using (id = auth_company_id());
create policy companies_update on companies
  for update using (id = auth_company_id());

-- Tabellar med company_id direkte: full tilgang innanfor eige selskap.
create policy company_brand_all on company_brand
  for all using (company_id = auth_company_id())
  with check (company_id = auth_company_id());

create policy users_select on users
  for select using (company_id = auth_company_id());

-- Tokens skal aldri lesast frå nettlesaren. Berre service role rører denne tabellen;
-- ingen policy => ingen tilgang for anon/authenticated.

create policy price_list_items_all on price_list_items
  for all using (company_id = auth_company_id())
  with check (company_id = auth_company_id());

create policy reference_quotes_all on reference_quotes
  for all using (company_id = auth_company_id())
  with check (company_id = auth_company_id());

create policy leads_all on leads
  for all using (company_id = auth_company_id())
  with check (company_id = auth_company_id());

create policy agent_runs_select on agent_runs
  for select using (company_id = auth_company_id());

-- drafts og draft_versions arvar company via lead.
create policy drafts_all on drafts
  for all using (
    exists (
      select 1 from leads
      where leads.id = drafts.lead_id
        and leads.company_id = auth_company_id()
    )
  )
  with check (
    exists (
      select 1 from leads
      where leads.id = drafts.lead_id
        and leads.company_id = auth_company_id()
    )
  );

create policy draft_versions_all on draft_versions
  for all using (
    exists (
      select 1 from drafts
      join leads on leads.id = drafts.lead_id
      where drafts.id = draft_versions.draft_id
        and leads.company_id = auth_company_id()
    )
  )
  with check (
    exists (
      select 1 from drafts
      join leads on leads.id = drafts.lead_id
      where drafts.id = draft_versions.draft_id
        and leads.company_id = auth_company_id()
    )
  );

-- Storage: referansefiler og genererte PDF-ar.
insert into storage.buckets (id, name, public)
  values ('reference-files', 'reference-files', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('quote-pdfs', 'quote-pdfs', false)
  on conflict (id) do nothing;
