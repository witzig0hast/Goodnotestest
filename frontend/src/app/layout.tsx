import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const headingFont = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GoodShare – deine GoodNotes, überall griffbereit",
  description:
    "GoodShare nimmt automatische GoodNotes-Backups entgegen und macht sie über eine einfache, passwortgeschützte Seite zugänglich.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`${bodyFont.variable} ${monoFont.variable} ${headingFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
