import type { Metadata } from "next";

import { WeddingApp } from "@/components/save-the-date/wedding-app";

export const metadata: Metadata = {
  title: "Invitation - Nathan & Innocente",
  description: "Votre invitation personnelle Nathan & Innocente.",
  openGraph: {
    title: "Invitation - Nathan & Innocente",
    description: "Votre invitation personnelle Nathan & Innocente.",
    type: "website",
  },
};

export default function WeddingPage() {
  return <WeddingApp />;
}
