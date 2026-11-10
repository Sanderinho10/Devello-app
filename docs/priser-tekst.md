# Priser — tekst til devello.no/priser

Nettsida ligg i eit anna repo. Dette er teksten ho skal ha, og han skal
seie det same som `src/lib/billing/katalog.ts` — nettsida er løftet,
katalogen er rekninga. Endrar du ein pris, endra begge.

Alle prisar er eks. mva. Bokmål som elles på nettsida.

---

## Enkel pris. Betal for det dere bruker.

Lav grunnpris, og en liten pris per tilbud, faktura og montør. Kontorbrukere
i nettappen er gratis og ubegrenset. 30 dager gratis prøvetid med alle
moduler — ingen kort, ingen binding.

### Tilbud — 390 kr/mnd

Tilbudsagenten: fra innboks til ferdig tilbud.

- Per tilbud generert — 29 kr
- Kontorbrukere — gratis

### Ordre — 490 kr/mnd

Ordre, timer, materiell og faktura.

- Per faktura overført til regnskapssystemet — 9 kr
- Per aktiv montør i appen — 59 kr/mnd
- Kontorbrukere — gratis

### Tilbud + Ordre — 690 kr/mnd

Hele plattformen, fra henvendelse til faktura.

- Per tilbud generert — 29 kr
- Per faktura overført — 9 kr
- Per aktiv montør i appen — 59 kr/mnd
- Kontorbrukere — gratis

### Mikro — 2 490 kr/år

Enkeltpersonforetak og små firma. Betales årlig.

- Tilbud + Ordre, alt inkludert
- 100 enheter i året (tilbud og fakturaer samlet)
- 1 montør i appen inkludert
- Over 100 enheter — 29 kr per enhet
- Flere montører — 59 kr/mnd per montør

---

## Slik teller vi

- **Et tilbud** telles én gang per henvendelse, første gang agenten lager
  et utkast. Å regenerere, bytte tilbudstype eller rette er gratis.
- **En faktura** telles én gang per ordre, når fakturaforslaget overføres
  til regnskapssystemet. Å lage, godkjenne og rette forslaget er gratis.
- **En aktiv montør** er en bruker som har ført timer, materiell, notat
  eller bilder fra montørappen i løpet av en måned. Brukere som bare
  jobber i nettappen teller aldri.

Alle priser eks. mva. Trenger dere mer? post@devello.no
