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

  // playwright-core laster chromium fra filsystemet, og libheif-js har en
  // WebAssembly-modul den finner selv — ingen av dem skal bundles.
  serverExternalPackages: ["playwright-core", "heic-decode", "libheif-js"],

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
