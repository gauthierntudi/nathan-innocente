import type { Metadata } from "next";

import { DispositionsPratiquesApp } from "@/components/save-the-date/dispositions-pratiques-app";

export const metadata: Metadata = {
  title: "Dispositions pratiques - Nathan & Innocente",
  description: "Informations pratiques pour les célébrations de Nathan & Innocente.",
  robots: { index: false, follow: false },
};

export default function DispositionsPratiquesPage() {
  return <DispositionsPratiquesApp loginPath="/login?cocktail=1" />;
}
