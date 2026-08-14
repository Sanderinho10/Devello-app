-- Oppfølging av Supabase sin security advisor.

-- 1. Lås search_path på trigger-funksjonen. Utan dette kan ei rolle med eigen
--    search_path få funksjonen til å treffe feil objekt.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. handle_new_user() er ein trigger-funksjon og skal aldri kallast som RPC.
--    Supabase eksponerer alt i public via /rest/v1/rpc, så vi tek vekk tilgangen.
revoke execute on function handle_new_user() from anon, authenticated, public;

-- auth_company_id() blir med vilje verande kallbar for authenticated: RLS-policyane
-- kallar den som den innlogga rolla, så EXECUTE må vere der. Den returnerer berre
-- kallaren sin eigen company_id — noko kallaren alt veit.
revoke execute on function auth_company_id() from anon;

-- Advisor-varsel vi med vilje ikkje gjer noko med:
--
-- «mailbox_connections har RLS men ingen policy» — det er poenget. Ingen policy
-- betyr ingen tilgang for anon/authenticated, og OAuth-tokens skal berre vere
-- lesbare for service role.
--
-- «tabell synleg i GraphQL-skjemaet» — skjemaet listar tabellnamn, men RLS
-- avgjer framleis kva rader som kjem ut. Ei tom liste er ikkje ein lekkasje.
