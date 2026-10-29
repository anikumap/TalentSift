import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TalentSift", template: "%s · TalentSift" },
  description: "Hire for hourly roles on evidence, not guesswork.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render every page per request so it carries that request's CSP nonce (see middleware.ts).
  await connection();
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
