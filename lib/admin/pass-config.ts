import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";

/** Cérémonies pour lesquelles l'envoi de pass WhatsApp est désactivé. */
export const PASS_DISABLED_CEREMONY_IDS = new Set<CeremonyId>(["coutumier"]);

export function isPassSendEnabledForCeremony(ceremonyId: CeremonyId) {
  return !PASS_DISABLED_CEREMONY_IDS.has(ceremonyId);
}

export const PASS_ENABLED_CEREMONY_DEFINITIONS = CEREMONY_DEFINITIONS.filter(
  (ceremony) => isPassSendEnabledForCeremony(ceremony.id),
);

export function getDefaultPassCeremonyId(): CeremonyId {
  return PASS_ENABLED_CEREMONY_DEFINITIONS[0]?.id ?? "civile";
}
