import type { Metadata } from "next";

import { InformationsPratiquesPage } from "@/components/informations-pratiques/informations-pratiques-page";

export const metadata: Metadata = {
  title: "Informations pratiques / Q&A — Nathan & Innocente",
  description:
    "Informations pratiques, dress code et questions fréquentes pour le mariage de Nathan & Innocente.",
};

export default function InformationsPratiquesRoute() {
  return <InformationsPratiquesPage />;
}
