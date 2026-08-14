import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core laster chromium fra filsystemet — den skal ikke bundles.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
