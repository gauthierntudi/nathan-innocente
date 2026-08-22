import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DispositionsPratiquesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
