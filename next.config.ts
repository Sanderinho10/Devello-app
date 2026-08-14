import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core lastar chromium frå filsystemet — den skal ikkje bundlast.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
