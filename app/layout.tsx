import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Invitation - Nathan & Innocente",
  description:
    "Nous sommes heureux de partager ce moment avec vous. Entrez pour découvrir notre vidéo.",
  openGraph: {
    title: "Invitation - Nathan & Innocente",
    description:
      "Nous sommes heureux de partager ce moment avec vous. Entrez pour découvrir notre vidéo.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#212121",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
