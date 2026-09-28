import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";

/**
 * Supabase-sesjonen som React-kontekst. Root-layouten bruker den til å
 * velge mellom innlogging og appen; api.ts leser tokenet direkte fra
 * supabase.auth, ikke herfra.
 */
interface Sesjonsstatus {
  /** Null når ingen er innlogget. */
  sesjon: Session | null;
  /** Usant til lagret sesjon er lest fra SecureStore — vis ingenting før da. */
  klar: boolean;
}

const Ctx = createContext<Sesjonsstatus>({ sesjon: null, klar: false });

export function SesjonProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Sesjonsstatus>({ sesjon: null, klar: false });

  useEffect(() => {
    let aktiv = true;
    supabase.auth.getSession().then(({ data }) => {
      if (aktiv) setStatus({ sesjon: data.session, klar: true });
    });
    const { data: lytter } = supabase.auth.onAuthStateChange((_hending, sesjon) => {
      if (aktiv) setStatus({ sesjon, klar: true });
    });

    // Supabase-guiden: forny tokenet bare mens appen er i forgrunnen.
    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    const appLytter = AppState.addEventListener("change", (tilstand) => {
      if (tilstand === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      aktiv = false;
      lytter.subscription.unsubscribe();
      appLytter.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}

export function useSesjon(): Sesjonsstatus {
  return useContext(Ctx);
}
