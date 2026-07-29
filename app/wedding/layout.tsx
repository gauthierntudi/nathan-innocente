import type { Viewport } from "next";

import "bootstrap-icons/font/bootstrap-icons.css";

export const viewport: Viewport = {
  themeColor: "#212121",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function WeddingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Styles du sidebar principal (OffcanvasMenu) */}
      <link rel="stylesheet" href="/assets/css/bootstrap.css" precedence="default" />
      <link rel="stylesheet" href="/assets/css/main.css" precedence="default" />
      {children}
    </>
  );
}
