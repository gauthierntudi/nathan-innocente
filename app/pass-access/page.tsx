import type { Metadata } from "next";

import { PassAccessApp } from "@/components/save-the-date/pass-access-app";

export const metadata: Metadata = {
  title: "Pass d'entrée - Nathan & Innocente",
  description: "Votre pass d'entrée personnel avec QR code.",
  robots: { index: false, follow: false },
};

export default function PassAccessPage() {
  return <PassAccessApp loginPath="/login?passaccess=1" />;
}
