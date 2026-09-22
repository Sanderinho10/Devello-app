-- Vedlegg på leads: bildene og PDF-ene kunden sendte med henvendelsen.
--
-- Et bilde av sikringsskapet eller en plantegning sier ofte mer om jobben
-- enn teksten gjør. Filene hentes fra Outlook når leadet hentes, eller
-- følger med en e-post som er dratt inn i «Manuell henvendelse», og sendes
-- til agenten sammen med teksten.
--
-- Bare service role leser og skriver (ingen policy), som quote_references:
-- UI-et får filene gjennom en rute som sjekker selskapet fra sesjonen.

create table lead_attachments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  lead_id       uuid not null references leads(id) on delete cascade,
  file_name     text not null,
  -- Typen etter normalisering: bilder lagres som image/jpeg.
  mime_type     text not null,
  size_bytes    integer not null,
  -- Sider i en PDF. null for bilder.
  pages         integer,
  storage_path  text not null,
  kilde         text not null check (kilde in ('outlook', 'manuell')),
  created_at    timestamptz not null default now()
);

create index lead_attachments_lead_idx on lead_attachments (lead_id);

alter table lead_attachments enable row level security;

insert into storage.buckets (id, name, public)
  values ('lead-attachments', 'lead-attachments', false)
  on conflict (id) do nothing;
