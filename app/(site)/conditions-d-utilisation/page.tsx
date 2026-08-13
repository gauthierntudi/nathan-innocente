import type { Metadata } from "next";

import "@/components/legal/legal-pages.css";
import { TermsOfServicePage } from "@/components/legal/terms-of-service-page";

export const metadata: Metadata = {
  title: "Conditions d’utilisation — Nathan & Innocente",
  description:
    "Conditions d’utilisation du site d’invitation Nathan & Innocente.",
  robots: { index: true, follow: true },
};

export default function TermsOfServiceRoute() {
  return <TermsOfServicePage />;
}
