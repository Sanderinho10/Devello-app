-- FTP-henting av prisfiler, opplasting i nettlesaren og importjobbar.
--
-- Grossistkatalogen blei importert med eit script Devello køyrde for hand.
-- Det held ikkje i drift: prisane hos Onninen/Ahlsell/Solar endrar seg, og
-- kunden skal aldri tenkje på det. Alle fagsystema gjer det likt —
-- grossisten legg prisfil (V4…) og rabattfil (R4…) på eit FTP-område per
-- kunde, og systemet hentar kvar natt med kundens innlogging.
--
-- Tre val som er gjort med vilje:
--
-- 1. Innloggingsdetaljane ligg i eiga tabell utan policy. Passordet skal
--    aldri vere lesbart for authenticated, same grep som tokenane i
--    mailbox_connections (0007). Status og filmønster går via API-et.
--
-- 2. Importen er ein jobb, ikkje eit request. Filene er 50 MB+, og
--    importen tek minutt. Éin tabell + éin arbeidar i prosessen, same
--    mønster som «generering i bakgrunnen» (0019). Ingen kø-infrastruktur.
--
-- 3. Same fil to gonger → hopp over. Namn + mtime på sist importerte fil
--    står på koplinga, så nattjobben ikkje skriv 58 000 rader for ingenting.

create type ftp_protocol as enum ('ftp', 'ftps', 'sftp');

-- Innloggingsdetaljar per grossist. Eiga tabell utan policy: passordet skal
-- aldri vere lesbart for authenticated, same grep som tokenane i
-- mailbox_connections. Status og filmønster kan lesast via API-et.
create table supplier_ftp (
  supplier_id       uuid primary key references suppliers(id) on delete cascade,
  company_id        uuid not null references companies(id) on delete cascade,
  protocol          ftp_protocol not null default 'ftps',
  host              text not null,
  port              integer,                    -- null = standard for protokollen
  username          text not null,
  password          text not null,
  remote_path       text not null default '/',
  -- Glob-mønster på filnamn. Nyaste fil (mtime) som matchar blir henta.
  varefil_pattern   text not null default 'V4*',
  rabattfil_pattern text default 'R4*',
  auto_import       boolean not null default true,
  last_listing      jsonb,                      -- siste fillista frå «Test tilkobling»/nattjobb, utan hemmelegheiter
  last_fetch_at     timestamptz,
  last_fetch_status text,                       -- 'ok' | 'feil' | 'ingen_ny_fil'
  last_fetch_note   text,
  -- Namn + mtime på fila vi sist importerte: same fil igjen → hopp over.
  last_varefil_name text,
  last_varefil_mtime timestamptz,
  last_rabattfil_name text,
  last_rabattfil_mtime timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table supplier_ftp enable row level security;   -- ingen policy

create type import_job_status as enum ('koe', 'hentar', 'importerer', 'ferdig', 'feil');
create type import_job_source as enum ('ftp', 'opplasting', 'script', 'nattjobb');

create table import_jobs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  supplier_id   uuid not null references suppliers(id) on delete cascade,
  source        import_job_source not null,
  status        import_job_status not null default 'koe',
  -- Opplasting: stiane i bucket 'supplier-files'. FTP: fylt inn etter henting.
  varefil_path  text,
  rabattfil_path text,
  varefil_name  text,
  rabattfil_name text,
  progress_done integer not null default 0,
  progress_total integer,
  result        jsonb,                          -- { linjer, nye, endra, utgaatte, medRabatt, aatvaringar[] }
  error         text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index import_jobs_supplier_idx on import_jobs (supplier_id, created_at desc);
alter table import_jobs enable row level security;
create policy import_jobs_select on import_jobs
  for select to authenticated using (company_id = auth_company_id());

insert into storage.buckets (id, name, public)
  values ('supplier-files', 'supplier-files', false)
  on conflict (id) do nothing;

create trigger supplier_ftp_updated_at before update on supplier_ftp
  for each row execute function set_updated_at();
create trigger import_jobs_updated_at before update on import_jobs
  for each row execute function set_updated_at();
