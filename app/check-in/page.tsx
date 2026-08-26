import type { Metadata } from "next";

import { CheckInApp } from "@/components/save-the-date/check-in-app";

export const metadata: Metadata = {
  title: "Contrôle d'entrée - Nathan & Innocente",
  description: "Vérification du pass invité.",
  robots: { index: false, follow: false },
};

type CheckInPageProps = {
  searchParams: Promise<{ token?: string; exp?: string; sig?: string }>;
};

export default async function CheckInPage({ searchParams }: CheckInPageProps) {
  const { token = "", exp = "", sig = "" } = await searchParams;
  return <CheckInApp token={token} exp={exp} sig={sig} />;
}
