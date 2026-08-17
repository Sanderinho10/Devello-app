"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Logg ut.
 *
 * router.refresh() etter signOut er ikke pynt: sesjonen ligger i en cookie som
 * serveren leser, og uten en oppfriskning ville de server-rendrede sidene i
 * cachen fortsatt vist forrige brukers data til noe annet tvang en ny
 * henting. På en delt kontormaskin er det forskjellen på å ha logget ut og å
 * tro at man har det.
 */
export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function loggUt() {
    setBusy(true);
    try {
      await supabaseBrowser().auth.signOut();
    } catch {
      // Feiler kallet, er sesjonen uansett på vei ut lokalt.
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" className="sidebar-signout" onClick={loggUt} disabled={busy}>
      {busy ? "Logger ut…" : "Logg ut"}
    </button>
  );
}
