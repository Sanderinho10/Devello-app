"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { InnstillingsFane } from "../faner";

/** Fanestripa over sidene under Selskap → Innstillinger. Same mønster som fanene på ordren. */
export function InnstillingerFaner({ faner }: { faner: InnstillingsFane[] }) {
  const pathname = usePathname();
  const aktiv = faner
    .filter((f) => pathname === f.href || pathname.startsWith(f.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="type-switch kompakt innstillinger-faner" style={{ marginBottom: 20 }}>
      {faner.map((f) => (
        <Link key={f.href} href={f.href} className={`type-option${f === aktiv ? " active" : ""}`}>
          {f.label}
        </Link>
      ))}
    </div>
  );
}
