import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TS KPI",
  description: "Internes KPI-Cockpit fuer Telekom-Shops."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="bg-ink-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
