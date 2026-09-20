import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";
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
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GoodShare",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f5d50",
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
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
