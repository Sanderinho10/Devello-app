-- Montørappen: idempotente føringar, notat på ordren, strekkodesøk.
--
-- Kvifor: Appen skal verke utan dekning og sende føringane når nettet er
-- tilbake. Ei føring sendt to gonger skal aldri bli to rader, så kvar
-- føring får ein client_id laga i appen. Notat på ordren finst ikkje i
-- dag (order_events er hendingsloggen). EAN frå kameraet skal treffe
-- supplier_items.gtin.

alter table time_entries     add column client_id uuid;
alter table material_entries add column client_id uuid;
alter table order_documents  add column client_id uuid;
create unique index time_entries_client_id_unik
  on time_entries (company_id, client_id) where client_id is not null;
create unique index material_entries_client_id_unik
  on material_entries (company_id, client_id) where client_id is not null;
create unique index order_documents_client_id_unik
  on order_documents (company_id, client_id) where client_id is not null;

create table order_notes (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id   uuid not null references orders(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  text       text not null,
  client_id  uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_notes_order_idx on order_notes (order_id, created_at desc);
create unique index order_notes_client_id_unik
  on order_notes (company_id, client_id) where client_id is not null;
alter table order_notes enable row level security;
create policy order_notes_select on order_notes
  for select to authenticated using (company_id = auth_company_id());
create trigger order_notes_updated_at before update on order_notes
  for each row execute function set_updated_at();

-- Bilete høyrer til eit notat når dei er tekne frå appen. Sjølve fila er
-- eit order_document (kind 'fil') som før — ingen ny lagring.
alter table order_documents
  add column note_id uuid references order_notes(id) on delete set null;
create index order_documents_note_idx on order_documents (note_id) where note_id is not null;

-- Strekkode: EAN frå kameraet er 8–14 siffer og skal treffe gtin direkte.
create index supplier_items_gtin_idx on supplier_items (company_id, gtin) where gtin is not null;

-- Same funksjon som i 0033, pluss GTIN-treff fyrst: 8–14 siffer som er
-- ein GTIN treff fyrst, så eksakt varenummer, elles som før (prefiks på
-- varenummer for siffer, trigram på namn for tekst).
create or replace function sok_grossistvarer(p_company uuid, p_q text, p_limit int default 20)
returns setof supplier_items
language sql stable
as $$
  select *
    from supplier_items
   where company_id = p_company
     and active
     and (
       (p_q ~ '^[0-9]{8,14}$' and gtin = p_q)
       or (p_q ~ '^[0-9]+$' and item_no like p_q || '%')
       or (p_q !~ '^[0-9]+$' and name ilike '%' || p_q || '%')
     )
   order by
     case when gtin = p_q then 0 when item_no = p_q then 1 else 2 end,
     similarity(name, p_q) desc,
     name
   limit p_limit;
$$;
revoke execute on function sok_grossistvarer(uuid, text, int) from public, anon, authenticated;
