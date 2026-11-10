-- Fornavn og etternavn på invitasjonen.
--
-- Administratoren skriver navnet når kollegaen inviteres, så medlemslista
-- har navn fra første dag og ikke bare e-post. Navnet følger med inn på
-- users.full_name, uansett hvilken vei den inviterte kommer inn:
--   - vår egen lenke (/api/invitations/aktiver) leser det fra invitasjonen
--   - Supabase sin invitasjonsmail går via triggeren under

alter table invitations
  add column fornavn  text,
  add column etternavn text;

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

    update invitations set accepted_at = now() where id = invite.id;
  end if;

  return new;
end;
$$;

-- Trigger-funksjon, aldri RPC. Samme grep som 0004 og 0010.
revoke execute on function handle_new_user() from public, anon, authenticated;
