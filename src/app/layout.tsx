import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Mac og iPhone får San Francisco direkte fra systemet. Inter er nærmeste
 * slektning for Windows og Android, så appen ser lik ut der også. Fonten
 * lastes ned ved bygging og serveres herfra — ingen kall til Google.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Devello",
  description: "Tilbudsagent for håndverksbedrifter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
