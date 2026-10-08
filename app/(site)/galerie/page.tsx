import type { Metadata } from "next";

import { GaleriePage } from "@/components/galerie/galerie-page";

export const metadata: Metadata = {
  title: "Galerie — Nathan & Innocente",
  description: "Les photos des célébrations de Nathan & Innocente.",
};

export default function GalerieRoute() {
  return <GaleriePage />;
}
