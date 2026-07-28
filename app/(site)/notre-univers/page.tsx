import type { Metadata } from "next";

import { NotreUniversPage } from "@/components/notre-univers/notre-univers-page";

export const metadata: Metadata = {
  title: "Notre univers — Nathan & Innocente",
  description:
    "Bienvenue dans l’univers de Nathan & Innocente — The Samunas To Eternity.",
};

export default function NotreUniversRoute() {
  return <NotreUniversPage />;
}
