-- Fakturafiler frå grossisten via FTP («autofakt»).
--
-- Kvifor: Steg 3 hentar leverandørfakturaer frå rekneskapssystemet. Det
-- føreset at kunden bokfører der. Star Elektro er på Cordel til plattforma
-- er ferdig, men grossistvarene må inn på ordrane no. Grossistane legg
-- fakturafiler (EFO/NELFO 4.0, evt. EHF) på same FTP-område som prisfilene,
-- og det er slik Cordel/Tripletex/Elinn får varene inn. Same røyrleidning
-- som steg 3 frå og med supplier_invoices — berre ei ny kjelde inn.

create type invoice_source as enum ('regnskap', 'ftp');

-- Ei rad per fil vi har sett på FTP-området. Idempotens: same grossist +
-- filnamn + mtime → hoppa over. Fila ligg i Storage slik ho kom.
create table supplier_invoice_files (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  supplier_id   uuid not null references suppliers(id) on delete cascade,
  file_name     text not null,
  file_mtime    timestamptz,
  file_size     integer,
  storage_path  text not null,               -- bucket 'supplier-invoices': {company}/ftp/{supplier}/{filnamn}
  format        text,                        -- 'ehf' | 'nelfo4' | null (ukjend)
  status        text not null default 'henta', -- 'henta' | 'lest' | 'duplikat' | 'feil'
  error         text,
  invoice_count integer not null default 0,
  fetched_at    timestamptz not null default now(),
  parsed_at     timestamptz,
  updated_at    timestamptz not null default now(),
  unique (supplier_id, file_name, file_mtime)
);
create index supplier_invoice_files_supplier_idx on supplier_invoice_files (supplier_id, fetched_at desc);
alter table supplier_invoice_files enable row level security;
create policy supplier_invoice_files_select on supplier_invoice_files
  for select to authenticated using (company_id = auth_company_id());

-- Fakturaen kan no kome utan rekneskapskopling.
alter table supplier_invoices
  alter column connection_id drop not null,
  alter column provider drop not null,
  add column source       invoice_source not null default 'regnskap',
  add column supplier_id  uuid references suppliers(id) on delete set null,
  add column file_id      uuid references supplier_invoice_files(id) on delete set null,
  -- Same faktura sett frå to kjelder (FTP fyrst, POGO seinare). Den siste
  -- peikar på den fyrste og blir aldri matcha — elles dobbelt materiell.
  add column duplicate_of uuid references supplier_invoices(id) on delete set null;

alter table supplier_invoices
  add constraint supplier_invoices_kjelde_chk check (
    (source = 'regnskap' and connection_id is not null and provider is not null)
    or (source = 'ftp' and supplier_id is not null and file_id is not null)
  );

-- FTP-fakturaer er unike på grossist + fakturanummer. POGO-fakturaer er
-- framleis unike på (company, provider, external_id) frå 0035.
create unique index supplier_invoices_ftp_unik
  on supplier_invoices (company_id, supplier_id, invoice_no)
  where source = 'ftp';
-- For duplikat-sjekken på tvers av kjelder.
create index supplier_invoices_orgnr_fakturanr_idx
  on supplier_invoices (company_id, supplier_org_nr, invoice_no);

-- FTP-oppsettet får fakturafiler i tillegg til prisfiler. Tomt mønster = av.
alter table supplier_ftp
  add column fakturafil_pattern text,
  add column fakturafil_path    text,          -- null = remote_path
  add column last_invoice_fetch_at     timestamptz,
  add column last_invoice_fetch_status text,   -- 'ok' | 'feil' | 'ingen_ny_fil'
  add column last_invoice_fetch_note   text;   -- «3 nye filer, 3 fakturaer, 2 kopla, 1 ukopla»

create trigger supplier_invoice_files_updated_at before update on supplier_invoice_files
  for each row execute function set_updated_at();
