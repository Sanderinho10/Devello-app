-- BARE FOR UTVIKLING OG PILOT.
--
-- Knytter hver ny innlogget bruker til Star Elektro automatisk, slik at man slipper
-- å kjøre et manuelt insert etter første innlogging.
--
-- Denne MÅ fjernes før plattformen tar imot flere kunder (fase 3). Da skal
-- selskapstilhørigheten komme fra en invitasjon, ikke fra en hardkodet default —
-- ellers havner hver ny registrering hos Star Elektro.
--
--   drop trigger on_auth_user_created on auth.users;
--   drop function handle_new_user();

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_company uuid := '00000000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from companies where id = default_company) then
    insert into users (id, company_id, email)
    values (new.id, default_company, new.email)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Ta med brukere som allerede har logget inn før triggeren fantes.
insert into users (id, company_id, email)
select id, '00000000-0000-0000-0000-000000000001', email
from auth.users
on conflict (id) do nothing;
