import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Lås rota til denne mappa.
   *
   * Turbopack gjetter seg fram til rota ved å lete oppover etter en lockfile.
   * Ligger det en package-lock.json i hjemmemappa — noe som lett skjer om man
   * har kjørt npm install ett hakk for høyt en gang — havner rota utenfor
   * prosjektet, og modulsøk og filovervåking blir uforutsigbare.
   */
  turbopack: { root: path.resolve(process.cwd()) },

  /*
   * Oppsettet flyttet inn under Selskap → Innstillinger. De gamle adressene
   * ligger i bokmerker og i e-poster som alt er sendt, så de sendes videre.
   * Ikke permanent: 308 blir sittende i nettleseren, og skulle en adresse
   * få ny mening senere er den vanskelig å få tilbake.
   */
  async redirects() {
    return [
      { source: "/selskap/detaljer", destination: "/selskap/innstillinger/generelt", permanent: false },
      { source: "/tilbud/innstillinger", destination: "/selskap/innstillinger/generelt", permanent: false },
      { source: "/ordre/innstillinger", destination: "/selskap/innstillinger/generelt", permanent: false },
      { source: "/tilbud/prisfil", destination: "/selskap/innstillinger/prisfil", permanent: false },
      { source: "/tilbud/prisfil/:id", destination: "/selskap/innstillinger/prisfil/:id", permanent: false },
      { source: "/tilbud/referansefiler", destination: "/selskap/innstillinger/referansefiler", permanent: false },
      // Registrene samlet under Register i menyen.
      { source: "/ordre/grossister", destination: "/register/grossister", permanent: false },
      { source: "/selskap/innstillinger/grossister", destination: "/register/grossister", permanent: false },
      { source: "/ordre/leverandorfakturaer", destination: "/register/leverandorfakturaer", permanent: false },
      { source: "/kontakter", destination: "/register/kontakter", permanent: false },
      { source: "/kontakter/:id", destination: "/register/kontakter/:id", permanent: false },
      // Kunderegisteret ble kontaktregisteret (kunder og leverandører).
      { source: "/kunder", destination: "/register/kontakter?type=kunder", permanent: false },
      { source: "/kunder/:id", destination: "/register/kontakter/:id", permanent: false },
    ];
  },

  // playwright-core laster chromium fra filsystemet, og libheif-js har en
  // WebAssembly-modul den finner selv — ingen av dem skal bundles.
  // ssh2 (bak ssh2-sftp-client) har en valgfri native modul og CommonJS-
  // kryptokode Turbopack ikke kan legge i ESM-chunks; basic-ftp bruker
  // net/tls direkte. Begge kjører bare på serveren og lastes derfra.
  serverExternalPackages: ["playwright-core", "heic-decode", "libheif-js", "ssh2-sftp-client", "ssh2", "basic-ftp"],

  experimental: {
    /*
     * Middleware-en (innloggingssjekken) gjør at Next bufrer hele
     * forespørselskroppen, og standardtaket er 10 MB — det som er over, blir
     * kuttet uten feilmelding. En manuell henvendelse med noen PDF-er som
     * vedlegg, eller en skannet referansefil, går over det. Taket her ligger
     * over det klienten selv tillater (se lib/leads/vedlegg-grenser).
     */
    proxyClientMaxBodySize: "40mb",
  },
};

export default nextConfig;
