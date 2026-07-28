import { prisma } from "@/lib/prisma";

/** Noms de groupe reconnus comme « invités d'honneur » (insensible à la casse / accents). */
const HONOR_GROUP_NAMES = new Set([
  "honor",
  "honneur",
  "honneurs",
  "invite dhonneur",
  "invites dhonneur",
  "invite d honneur",
  "invites d honneur",
]);

export function normalizeGroupName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isHonorGroupName(name: string | null | undefined) {
  if (!name?.trim()) return false;
  const normalized = normalizeGroupName(name);
  if (HONOR_GROUP_NAMES.has(normalized)) return true;
  return (
    normalized.includes("invite dhonneur") ||
    normalized.includes("invites dhonneur") ||
    normalized.includes("invite d honneur") ||
    normalized.includes("invites d honneur") ||
    /(^| )honor( |$)/.test(normalized) ||
    /(^| )honneur( |$)/.test(normalized)
  );
}

/** Un invité d'honneur est dans un groupe nommé honor / invités d'honneur (sur au moins une cérémonie). */
export async function guestIsHonorGuest(guestId: string) {
  const rows = await prisma.guestCeremony.findMany({
    where: {
      guestId,
      groupId: { not: null },
    },
    select: {
      group: { select: { name: true } },
    },
  });

  return rows.some((row) => isHonorGroupName(row.group?.name));
}
