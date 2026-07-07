import type { Metadata } from "next";

import { WeddingApp } from "@/components/save-the-date/wedding-app";

export const metadata: Metadata = {
  title: "Invitation - Nathan & Innocente",
  description:
    "Votre invitation personnelle et le dress code de la cérémonie.",
  openGraph: {
    title: "Invitation - Nathan & Innocente",
    description:
      "Votre invitation personnelle et le dress code de la cérémonie.",
    type: "website",
  },
};

export default function WeddingPage() {
  return <WeddingApp />;
}
