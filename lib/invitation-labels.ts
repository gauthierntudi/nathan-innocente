import type { CeremonyId } from "@/lib/admin/ceremony-types";

export const INVITATION_LABELS: Record<CeremonyId, string> = {
  coutumier: "Mariage coutumier",
  civile: "Mariage civil",
  religieux: "Bénédiction nuptiale",
  reception: "Réception",
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

  if (labels.length <= 1) {
    const ceremony = labels[0] ?? "notre célébration";
    return {
      hello: `Bonjour ${civilite} ${displayName},`,
      body: `vous êtes convié(e) à la cérémonie ${ceremony}.`,
    };
  }

  const list =
    labels.length === 2
      ? `${labels[0]} et ${labels[1]}`
      : `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;

  return {
    hello: `Bonjour ${civilite} ${displayName},`,
    body: `vous êtes convié(e) aux cérémonies ${list}.`,
  };
}
