import type { CeremonyId } from "@/lib/admin/ceremony-types";

export type GuestCeremonyDetails = {
  id: CeremonyId;
  name: string;
  date: string;
  time: string;
  location: string;
  address: string;
  dressCode: string;
  description: string;
};

const CEREMONY_GUEST_DETAILS: Record<
  CeremonyId,
  Omit<GuestCeremonyDetails, "id" | "name">
> = {
  coutumier: {
    date: "29 août 2026",
    time: "14h00",
    location: "Athénée de la Gombe",
    address: "Kinshasa-RD Congo",
    dressCode: "Tenue traditionnelle ou tenue de cérémonie",
    description:
      "Célébration coutumière réunissant les familles dans la tradition et la joie.",
  },
  civile: {
    date: "04 septembre 2026",
    time: "10h00",
    location: "Kinshasa",
    address: "Mairie — Kinshasa Gombe",
    dressCode: "Tenue chic ou cocktail",
    description: "Union civile officielle devant l'état civil.",
  },
  religieux: {
    date: "06 septembre 2026",
    time: "15h00",
    location: "Kinshasa",
    address: "Église — Kinshasa Gombe",
    dressCode: "Tenue élégante de cérémonie",
    description: "Bénédiction nuptiale et messe de mariage.",
  },
};

export function getCeremonyGuestContent(
  ceremonyId: CeremonyId,
  ceremonyName: string,
): GuestCeremonyDetails {
  return {
    id: ceremonyId,
    name: ceremonyName,
    ...CEREMONY_GUEST_DETAILS[ceremonyId],
  };
}
