import type { Metadata } from "next";

import "bootstrap-icons/font/bootstrap-icons.css";
import "./home.css";

export const metadata: Metadata = {
  title: "Nathan & Innocente - Wedding",
  description: "Save the Date - Nathan & Innocente 2026",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/assets/css/bootstrap.css" precedence="default" />
      <link rel="stylesheet" href="/assets/css/spacing.css" precedence="default" />
      <link rel="stylesheet" href="/assets/css/slick.css" precedence="default" />
      <link rel="stylesheet" href="/assets/css/main.css" precedence="default" />
      {children}
    </>
  );
}
