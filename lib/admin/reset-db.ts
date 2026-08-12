import { prisma } from "@/lib/prisma";

export type ResetDatabaseResult = {
  before: {
    guests: number;
    duplicates: number;
    ceremonies: number;
    tables: number;
    groups: number;
    assignments: number;
  };
};

/** Vide toutes les tables métier (schéma conservé). */
export async function resetDatabase(): Promise<ResetDatabaseResult> {
  const before = {
    guests: await prisma.guest.count(),
    duplicates: await prisma.guestDuplicate.count(),
    ceremonies: await prisma.ceremony.count(),
    tables: await prisma.ceremonyTable.count(),
    groups: await prisma.ceremonyGroup.count(),
    assignments: await prisma.guestCeremony.count(),
  };

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      guest_ceremonies,
      guest_duplicates,
      guest_fictitious,
      ceremony_tables,
      ceremony_groups,
      guests,
      ceremonies
    RESTART IDENTITY CASCADE
  `);

  return { before };
}
