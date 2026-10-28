-- Kundenummer: eige løpenummer per selskap på kvar kontakt.
--
-- Kvifor: Som i POGO skal ein kunne seie «kunde 10042» og finne kunden att
-- på nummeret, på tilbodet, på ordren og i søket. Nummeret i PowerOffice Go
-- (accounting_customer_no, 0052) er noko anna: det kjem fyrst etter fyrste
-- overføring og høyrer til éi kopling.
--
-- Korleis:
--   - companies.next_customer_no er teljaren, frå 10000. Han blir delt ut
--     atomisk, aldri «les og auk» i to steg — same mønster som tilbods- og
--     ordrenummeret.
--   - Ein trigger set nummeret på alle nye kontaktar som kjem utan, så alle
--     stader som opprettar kundar (API, finn_eller_opprett_kunde, import)
--     får nummer utan å vite om det.
--   - Nummeret kan rettast for hand, t.d. så det stemmer med Go. Då blir
--     teljaren skuva forbi, så neste nye kontakt ikkje kolliderer.
--   - Eksisterande kontaktar får nummer i den rekkjefølgja dei vart laga.

alter table companies add column next_customer_no integer not null default 10000;
comment on column companies.next_customer_no is
  'Neste ledige kundenummer. Delt ut av triggeren på customers; aldri les og auk i to steg.';

alter table customers add column customer_no integer;
comment on column customers.customer_no is
  'Kundenummeret, løpenummer per selskap frå 10000. Set av seg sjølv; kan rettast for hand.';

with nummerert as (
  select id, 9999 + row_number() over (partition by company_id order by created_at, id) as nr
    from customers
)
update customers c set customer_no = n.nr from nummerert n where n.id = c.id;

update companies c
   set next_customer_no = greatest(
     c.next_customer_no,
     coalesce((select max(customer_no) + 1 from customers k where k.company_id = c.id), 10000)
   );

alter table customers alter column customer_no set not null;
alter table customers add constraint customers_kundenummer_positivt check (customer_no > 0);
create unique index customers_kundenummer_unik on customers (company_id, customer_no);

create or replace function sett_kundenummer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_no is null then
    update companies
       set next_customer_no = next_customer_no + 1
     where id = new.company_id
     returning next_customer_no - 1 into new.customer_no;
    -- Eit nummer som alt er teke for hand: hopp vidare til eit ledig.
    while exists (
      select 1 from customers where company_id = new.company_id and customer_no = new.customer_no and id <> new.id
    ) loop
      update companies
         set next_customer_no = next_customer_no + 1
       where id = new.company_id
       returning next_customer_no - 1 into new.customer_no;
    end loop;
  else
    -- Sett for hand: teljaren skal alltid liggje over høgaste nummer.
    update companies
       set next_customer_no = new.customer_no + 1
     where id = new.company_id
       and next_customer_no <= new.customer_no;
  end if;
  return new;
end;
$$;
revoke execute on function sett_kundenummer() from public, anon, authenticated;

create trigger customers_kundenummer
  before insert or update of customer_no on customers
  for each row execute function sett_kundenummer();
