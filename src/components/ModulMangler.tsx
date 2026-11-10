/**
 * Sida bak eit modulflagg selskapet ikkje har. Menyen skjuler lenka, men
 * ei direkte adresse veit ikkje det — så sida seier kva som manglar i
 * staden for å vise noko tomt.
 */
export function ModulMangler({ modul }: { modul: string }) {
  return (
    <div className="card empty">
      <div className="empty-title">{modul}-modulen er ikke aktivert for dette selskapet.</div>
      <div>Ta kontakt med Devello for å skru den på.</div>
    </div>
  );
}
