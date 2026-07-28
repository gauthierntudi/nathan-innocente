import type { Metadata } from "next";

import { NotreHistoirePage } from "@/components/notre-histoire/notre-histoire-page";

export const metadata: Metadata = {
  title: "Notre histoire — Nathan & Innocente",
  description:
    "The Samunas To Eternity — le parcours de Nathan & Innocente, de la rencontre au mariage.",
};

export default function NotreHistoireRoute() {
  return <NotreHistoirePage />;
}
