-- Ny prisrad rett inn i kategorien sin.
--
-- Kodene i prisfila er kategorier: B er bad, EL er elbillader, og postene
-- ligger samlet under overskriftsraden sin. En post som legges til fra et
-- tilbudsutkast — «B023, punkt for håndklevarmer» — skal havne sammen med de
-- andre B-postene, ikke nederst i fila der ingen leter.
--
-- Det betyr å skyve alt under ett hakk ned. Det gjøres her, i én setning, og
-- ikke som hundre oppdateringer fra API-et.

create or replace function gjer_plass_i_prisliste(p_liste uuid, p_posisjon integer)
returns void
language sql
as $$
  update price_list_items
     set position = position + 1
   where price_list_id = p_liste
     and position >= p_posisjon;
$$;

-- Bare service role: API-et har allerede sjekket at lista hører til selskapet.
revoke execute on function gjer_plass_i_prisliste(uuid, integer) from public, anon, authenticated;
