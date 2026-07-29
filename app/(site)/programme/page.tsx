import type { Metadata } from "next";

import { ProgrammePage } from "@/components/programme/programme-page";

export const metadata: Metadata = {
  title: "Programmes & Pass d’entrée — Nathan & Innocente",
  description:
    "Programme des célébrations et pass d’entrée avec QR code personnel.",
};

export default function ProgrammeRoute() {
  return <ProgrammePage />;
}
