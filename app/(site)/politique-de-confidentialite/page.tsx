import type { Metadata } from "next";

import "@/components/legal/legal-pages.css";
import { PrivacyPolicyPage } from "@/components/legal/privacy-policy-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité — Nathan & Innocente",
  description:
    "Politique de confidentialité du site d’invitation Nathan & Innocente : données collectées, finalités et droits.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyRoute() {
  return <PrivacyPolicyPage />;
}
