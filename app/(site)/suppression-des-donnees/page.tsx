import type { Metadata } from "next";

import "@/components/legal/legal-pages.css";
import { DataDeletionPage } from "@/components/legal/data-deletion-page";

export const metadata: Metadata = {
  title: "Suppression des données — Nathan & Innocente",
  description:
    "Instructions pour demander la suppression de vos données personnelles liées à l’invitation Nathan & Innocente.",
  robots: { index: true, follow: true },
};

export default function DataDeletionRoute() {
  return <DataDeletionPage />;
}
