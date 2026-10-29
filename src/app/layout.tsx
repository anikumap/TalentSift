import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentSift",
  description: "Evidence-based hiring for hourly roles",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
