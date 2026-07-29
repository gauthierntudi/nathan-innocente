import type { CeremonyId } from "@/lib/admin/ceremony-types";

export const INVITATION_LABELS: Record<CeremonyId, string> = {
  coutumier: "Mariage coutumier",
  civile: "Mariage civil",
  religieux: "Mariage religieux",
  reception: "Réception",
};

/** Enveloppes image — boutons d’invitation (hors réception). */
export const INVITATION_ENVELOPE_SRC: Partial<Record<CeremonyId, string>> = {
  coutumier: "/enveloppes/coutumier.png",
  civile: "/enveloppes/civil.png",
  religieux: "/enveloppes/religieux.png",
};

export function getInvitationLabel(ceremonyId: CeremonyId, fallbackName: string) {
  return INVITATION_LABELS[ceremonyId] ?? fallbackName;
}

export function buildInvitationGreeting(input: {
  genre: string;
  name: string;
  labels: string[];
}) {
  const civilite = input.genre.trim() || "Cher(e)";
  const displayName = input.name.trim() || "invité(e)";
  const labels = input.labels.filter(Boolean);

  const hello = `Bonjour ${civilite} ${displayName},`;

  if (labels.length <= 1) {
    return {
      hello,
      intro: "vous êtes convié(e) à la cérémonie de",
      labels: [labels[0] ?? "notre célébration"],
    };
  }

  return {
    hello,
    intro: "vous êtes convié(e) aux cérémonies de",
    labels,
  };
}
