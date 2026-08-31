"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Merke } from "@/components/Merke";

/**
 * Landingssiden for alle lenker Supabase sender på e-post.
 *
 * Den finnes fordi lenkene kommer i to former, og ingen av dem kom fram før:
 *
 * 1. «#access_token=…» i adressen (implicit). Slik ser lenker ut som er laget
 *    server-side — invitasjoner og bekreftelsesmailer. Nettleserklienten vår
 *    er satt opp for PKCE, og auth-js avviser da et implicit-svar med «Not a
 *    valid PKCE flow url» og gjør ingenting. Her tar vi tokenene ut av
 *    adressen selv og setter sesjonen med dem.
 *
 * 2. «?code=…» (PKCE). Slik ser lenker ut som er bedt om fra nettleseren,
 *    som «send meg en lenke». Den ble borte på en annen måte: pekte lenken
 *    rett på en innlogget side, sendte serveren brukeren videre til /login —
 *    og en omdirigering tar ikke med seg spørringen. Koden var vekk før noen
 *    rakk å veksle den inn.
 *
 * Derfor peker alle e-postlenker hit i stedet, og denne siden er åpen: den
 * skal kunne nås uten sesjon, for det er nettopp sesjonen den lager.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Adressen leses FØR klienten opprettes. Klienten prøver selv å tolke
      // den ved oppstart, og rydder den i noen tilfeller — da ville tokenene
      // vært borte når vi kom hit.
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const supabase = supabaseBrowser();

      // Supabase legger feil i adressen på samme måte som tokens.
      const feil = url.searchParams.get("error_description") ?? hash.get("error_description");
      if (feil) {
        router.replace(`/login?feil=${encodeURIComponent(feil)}`);
        return;
      }

      const videre = url.searchParams.get("next") || "/tilbud/leads";

      try {
        const code = url.searchParams.get("code");
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");

        // En PKCE-lenke klarer klienten selv, og da har vi alt en sesjon her.
        // Å veksle inn koden en gang til ville feilet på at den er brukt.
        const { data: alt } = await supabase.auth.getSession();

        if (alt.session) {
          // Ingenting å gjøre — vi er inne.
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          // Ingen lenkeinnhold i det hele tatt — noen har åpnet adressen rått.
          router.replace("/login");
          return;
        }

        // Ut med tokenene av adresselinjen før vi går videre. De skal ikke bli
        // liggende i historikken.
        window.history.replaceState({}, "", "/auth/callback");
        router.replace(videre);
        router.refresh();
      } catch (err) {
        const melding = err instanceof Error ? err.message : String(err);
        setError(melding);
      }
    })();
  }, [router]);

  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card">
        <div className="brand" style={{ padding: "0 0 20px" }}>
          <Merke size={24} /> Devello
        </div>

        {error ? (
          <>
            <h2>Lenken virket ikke</h2>
            <p className="muted" style={{ margin: "8px 0 18px" }}>
              {error}
            </p>
            <p className="muted tiny">
              Lenker fra e-post kan bare brukes én gang, og varer en begrenset
              tid. Be om en ny, eller logg inn med passord.
            </p>
            <p className="muted tiny" style={{ marginTop: 14 }}>
              <a href="/login" style={{ textDecoration: "underline" }}>
                Til innlogging
              </a>
            </p>
          </>
        ) : (
          <>
            <h2>Logger deg inn…</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Et lite øyeblikk.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
