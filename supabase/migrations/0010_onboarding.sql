-- Selvbetjent onboarding: organisasjon, roller, invitasjoner og partnere.
--
-- Dette er migrasjonen som gjør plattformen flerkunde på ordentlig. Fram til nå
-- har 0003 knyttet hver ny innlogget bruker til Star Elektro automatisk — et
-- stillas for pilotens skyld, og den kan ikke stå når hvem som helst kan
-- registrere seg. Den rives her.

-- ---------------------------------------------------------------------------
-- 1. Riv dev-stillaset
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Roller
-- ---------------------------------------------------------------------------
-- Vi starter med to: admin styrer selskapet og inviterer, standard bruker
-- agentene. Flere roller er en senere avgjørelse, ikke en vi trenger nå.
create type user_role as enum ('admin', 'standard');

alter table users alter column role drop default;
alter table users
  alter column role type user_role
  using case when role = 'admin' then 'admin'::user_role else 'standard'::user_role end;
alter table users alter column role set default 'standard';

-- ---------------------------------------------------------------------------
-- 3. Organisasjonen
-- ---------------------------------------------------------------------------
alter table companies
  -- Fakturaadresse. Skilt fra company_brand med vilje: den adressen står på
  -- kundens tilbud, denne er vår faktura til dem.
  add column billing_address_line text,
  add column billing_postal_code  text,
  add column billing_city         text,
  -- Én måned gratis fra registrering. Pakkevalg kommer senere.
  add column trial_ends_at        timestamptz,
  add column plan                 text,
  -- Partnerkoden som vervet kunden, om noen gjorde det.
  add column partner_code         text;

-- Ett organisasjonsnummer, én konto. Sammenligningen skjer på sifrene alene,
-- så «912 345 678» og «912345678» regnes som samme selskap.
create unique index companies_org_nr_key
  on companies (regexp_replace(org_nr, '\D', '', 'g'))
  where org_nr is not null and org_nr <> '';

-- ---------------------------------------------------------------------------
-- 4. Partnere — regnskapsførere som verver kunder
-- ---------------------------------------------------------------------------
create table partners (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  org_nr           text not null,
  -- Kontonummer for utbetaling av andelen.
  payout_account   text not null,
  address_line     text,
  postal_code      text,
  city             text,
  contact_email    text,
  -- Andel av omsetningen fra kundene partneren har vervet. Satsen står i
  -- databasen og ikke i koden, så den kan avtales per partner.
  kickback_percent numeric(5, 2) not null default 20.00,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create unique index partners_org_nr_key
  on partners (regexp_replace(org_nr, '\D', '', 'g'));

-- ---------------------------------------------------------------------------
-- 5. Invitasjoner
-- ---------------------------------------------------------------------------
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  email       text not null,
  role        user_role not null default 'standard',
  invited_by  uuid references users(id) on delete set null,
  accepted_at timestamptz,
  expires_at  timestamptz not null default now() + interval '14 days',
  created_at  timestamptz not null default now()
);

create index invitations_company_id_idx on invitations (company_id);

-- Én åpen invitasjon per e-post per selskap. Inviterer man samme person to
-- ganger, skal den andre erstatte den første og ikke legge seg ved siden av.
create unique index invitations_open_email_key
  on invitations (company_id, lower(email))
  where accepted_at is null;

-- ---------------------------------------------------------------------------
-- 6. Ny handle_new_user: selskapstilhørighet kommer fra en invitasjon
-- ---------------------------------------------------------------------------
-- Den som registrerer et nytt selskap får users-raden sin fra registrerings-
-- API-et, som vet hvilket selskap det nettopp opprettet. Denne triggeren
-- håndterer den andre veien inn: en invitert kollega som logger inn første
-- gang. Finnes det ingen åpen invitasjon, skjer ingenting — en ukjent bruker
-- skal ikke havne i et tilfeldig selskap.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite invitations%rowtype;
begin
  select * into invite
  from invitations
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invite.id is not null then
    insert into users (id, company_id, email, role)
    values (new.id, invite.company_id, new.email, invite.role)
    on conflict (id) do update
      set company_id = excluded.company_id,
          role       = excluded.role;

    update invitations set accepted_at = now() where id = invite.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Trigger-funksjon, aldri RPC. Samme grep som 0004.
revoke execute on function handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
alter table partners    enable row level security;
alter table invitations enable row level security;

-- partners får ingen policy: utbetalingskontoer skal ikke kunne leses fra
-- nettleseren i det hele tatt. Bare service role rører tabellen.

-- Invitasjoner er synlige for kolleger i samme selskap. Skriving går gjennom
-- API-et, som sjekker at den som inviterer faktisk er admin.
create policy invitations_select on invitations
  for select
  to authenticated
  using (company_id = auth_company_id());

-- ---------------------------------------------------------------------------
-- 8. Star Elektro: pilotkunden som ble til før onboardingen fantes
-- ---------------------------------------------------------------------------
update users set role = 'admin'
where company_id = '00000000-0000-0000-0000-000000000001';

update companies
set trial_ends_at = coalesce(trial_ends_at, now() + interval '1 month')
where id = '00000000-0000-0000-0000-000000000001';
