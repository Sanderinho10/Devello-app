/**
 * Devello-merket: vinkelen og punktumet.
 *
 * Tegnet i SVG og ikke lagt inn som bildefil, av to grunner. Det arver
 * tekstfargen gjennom currentColor, så det samme merket står riktig på lys
 * bakgrunn i innloggingskortet og på mørk i sidemenyen — uten to filer som
 * kan komme i utakt. Og det er skarpt i alle størrelser.
 *
 * Ordmerket «Devello» settes i tekst ved siden av, ikke her. Det følger
 * appens egen skrift, og en overskrift som er tekst kan leses av
 * skjermlesere og søk.
 */
export function Merke({ size = 26 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 24"
      width={size}
      height={(size * 24) / 32}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", overflow: "visible" }}
    >
      <path
        d="M4 4.5 L14 12 L4 19.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={5.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={24.5} cy={18.5} r={3.6} fill="currentColor" />
    </svg>
  );
}
