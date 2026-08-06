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
  title: "Nathan & Innocente",
  description: "Nathan & Innocente — Save the Date 2026",
  icons: {
    icon: "/img/profil01.png",
    shortcut: "/img/profil01.png",
    apple: "/img/profil01.png",
  },
  openGraph: {
    title: "Nathan & Innocente",
    description: "Nathan & Innocente — Save the Date 2026",
    type: "website",
    images: [
      {
        url: "/img/profil01.png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nathan & Innocente",
    description: "Nathan & Innocente — Save the Date 2026",
    images: ["/img/profil01.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1e1e1e",
  width: "device-width",
  initialScale: 1,
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
