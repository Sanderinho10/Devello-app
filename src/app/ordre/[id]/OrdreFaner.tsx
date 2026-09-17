"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Fanene som ikke finnes ennå. Dokumentasjon kommer i steg 5. */
const SNART = ["Dokumentasjon"];

export function OrdreFaner({ orderId }: { orderId: string }) {
  const pathname = usePathname();
  const base = `/ordre/${orderId}`;
  const faner = [
    { label: "Oversikt", href: base },
    { label: "Timer", href: `${base}/timer` },
    { label: "Materiell", href: `${base}/materiell` },
    { label: "Faktura", href: `${base}/faktura` },
  ];
  const aktiv =
    faner
      .filter((f) => pathname === f.href || pathname.startsWith(f.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? faner[0];

  return (
    <div className="type-switch kompakt ordre-faner" style={{ marginBottom: 20 }}>
      {faner.map((f) => (
        <Link key={f.href} href={f.href} className={`type-option${f === aktiv ? " active" : ""}`}>
          {f.label}
        </Link>
      ))}
      {SNART.map((fane) => (
        <button key={fane} type="button" className="type-option" disabled>
          {fane}
          <span className="nav-badge">snart</span>
        </button>
      ))}
    </div>
  );
}
