-- Fjernar triggeren som kobla nye auth-brukarar til selskapet via ein open
-- invitasjon.
--
-- Kvifor: Triggeren var laga for invitasjonsmailen frå Supabase
-- (inviteUserByEmail), som oppretta auth-brukaren med ein gong. Han kobla då
-- personen til selskapet og merkte invitasjonen som godteken før passordet
-- var valt — difor stod inviterte som «Aktiv». Invitasjonane går no via
-- Resend, og brukaren blir oppretta først i /api/invitations/aktiver, som
-- skriv users-rad og medlemskap sjølv. Registreringa gjer det same.
--
-- Triggeren kunne òg gjere skade: registrerte nokon med ein open invitasjon
-- sitt eige selskap, vart dei i tillegg kobla til selskapet som inviterte.
--
-- Kan køyrast fleire gonger.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();
