import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devello",
  description: "Tilbudsagent for handverksbedrifter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nn">
      <body>{children}</body>
    </html>
  );
}
