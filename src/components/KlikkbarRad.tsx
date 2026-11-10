"use client";

import { useRouter } from "next/navigation";

/**
 * Tabellrad som åpner `href` når man klikker hvor som helst på den.
 *
 * Lenken i navnecellen er den som bærer fokus og tastaturet; raden er bare et
 * større treffområde for musa, som i Go. Klikk på en lenke eller knapp inni
 * raden får gjøre sitt eget.
 */
export function KlikkbarRad({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
        if (event.metaKey || event.ctrlKey) {
          window.open(href, "_blank");
          return;
        }
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
