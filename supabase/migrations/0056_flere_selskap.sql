-- Brukere i flere selskap.
--
-- Før: en bruker hørte til ett selskap (users.company_id). Nå kan samme
-- person være med i flere — f.eks. Star Elektro AS og Star Elektro AS DEMO —
-- og bytte mellom dem i sidemenyen uten å logge ut.
--
-- Hvordan:
--   - company_memberships: én rad per bruker og selskap, med rollen i
--     akkurat det selskapet.
--   - users.company_id er fortsatt «selskapet brukeren står i nå», og role
--     er rollen der. auth_company_id() og alle RLS-reglene leser
--     users.company_id som før, så ingen policy trenger å skrives om.
--     Å bytte selskap er å flytte pekeren, etter at API-et har sjekket at
--     medlemskapet finnes (lib/selskap/medlemskap.ts).
--   - users_select utvides: kolleger er alle med medlemskap i selskapet
--     brukeren står i, ikke bare de som tilfeldigvis står i det samme nå.
--     Ellers ville en montør som har byttet til DEMO forsvunnet fra
--     timelistene i hovedselskapet.

create table company_memberships (
  user_id    uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role       user_role not null default 'standard',
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

create index company_memberships_company on company_memberships (company_id);

-- Alle som finnes i dag, er medlem der de står.
insert into company_memberships (user_id, company_id, role)
select id, company_id, role from users where company_id is not null
on conflict do nothing;

alter table company_memberships enable row level security;

-- Egne medlemskap (til menyen) og kollegenes i selskapet man står i.
create policy company_memberships_select on company_memberships
  for select using (user_id = auth.uid() or company_id = auth_company_id());

drop policy if exists users_select on users;
create policy users_select on users
  for select using (
    id = auth.uid()
    or exists (
      select 1 from company_memberships m
      where m.user_id = users.id and m.company_id = auth_company_id()
    )
  );

-- Den inviterte som kommer inn via Supabase sin invitasjonsmail: også
-- medlemskapet, ikke bare users-raden. Ellers som i 0055.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite invitations%rowtype;
  navn   text;
begin
  select * into invite
  from invitations
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invite.id is not null then
    navn := nullif(trim(coalesce(invite.fornavn, '') || ' ' || coalesce(invite.etternavn, '')), '');

    insert into users (id, company_id, email, role, full_name)
    values (new.id, invite.company_id, new.email, invite.role, navn)
    on conflict (id) do update
      set company_id = excluded.company_id,
          role       = excluded.role,
          full_name  = coalesce(users.full_name, excluded.full_name);

    insert into company_memberships (user_id, company_id, role)
    values (new.id, invite.company_id, invite.role)
    on conflict (user_id, company_id) do update set role = excluded.role;

    update invitations set accepted_at = now() where id = invite.id;
  end if;

  return new;
end;
$$;

revoke execute on function handle_new_user() from public, anon, authenticated;
