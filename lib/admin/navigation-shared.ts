import {
  isCeremonyId,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";

export const ADMIN_SECTIONS = [
  "overview",
  "guests",
  "convives",
  "compare",
  "fictitious",
  "duplicates",
  "messages",
  "pass",
  "invitations",
  "ceremonies",
  "tables",
  "groups",
  "settings",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export function isAdminSection(value: string | null): value is AdminSection {
  return ADMIN_SECTIONS.includes(value as AdminSection);
}

export function parseAdminSection(value: string | null): AdminSection {
  return isAdminSection(value) ? value : "overview";
}

export function parseCeremonyId(value: string | null): CeremonyId {
  return value && isCeremonyId(value) ? value : "coutumier";
}
