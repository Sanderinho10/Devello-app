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

  // playwright-core laster chromium fra filsystemet — den skal ikke bundles.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
