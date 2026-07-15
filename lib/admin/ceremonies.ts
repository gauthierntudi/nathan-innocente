import { prisma } from "@/lib/prisma";

import {
  CEREMONY_DEFINITIONS,
  isCeremonyId,
  serializeCeremonyBoard,
  type CeremonyBoard,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";

export async function ensureCeremoniesSeeded() {
  await Promise.all(
    CEREMONY_DEFINITIONS.map((ceremony) =>
      prisma.ceremony.upsert({
        where: { id: ceremony.id },
        update: { name: ceremony.name, sortOrder: ceremony.sortOrder },
        create: {
          id: ceremony.id,
          name: ceremony.name,
          sortOrder: ceremony.sortOrder,
        },
      }),
    ),
  );
}

export async function getCeremonyBoard(): Promise<CeremonyBoard> {
  await ensureCeremoniesSeeded();

  const ceremonies = await prisma.ceremony.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      tables: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          assignments: {
            include: { guest: true },
            orderBy: { guest: { name: "asc" } },
          },
        },
      },
      assignments: {
        include: { guest: true },
        orderBy: { guest: { name: "asc" } },
      },
    },
  });

  return serializeCeremonyBoard(ceremonies);
}

export async function createCeremonyTable(input: {
  ceremonyId: CeremonyId;
  name: string;
  capacity?: number | null;
}) {
  await ensureCeremoniesSeeded();

  const count = await prisma.ceremonyTable.count({
    where: { ceremonyId: input.ceremonyId },
  });

  return prisma.ceremonyTable.create({
    data: {
      ceremonyId: input.ceremonyId,
      name: input.name.trim(),
      capacity: input.capacity ?? null,
      sortOrder: count + 1,
    },
  });
}

export async function updateCeremonyTable(
  tableId: string,
  input: { name?: string; capacity?: number | null },
) {
  return prisma.ceremonyTable.update({
    where: { id: tableId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    },
  });
}

export async function deleteCeremonyTable(tableId: string) {
  await prisma.guestCeremony.updateMany({
    where: { tableId },
    data: { tableId: null },
  });

  return prisma.ceremonyTable.delete({ where: { id: tableId } });
}

export async function assignGuestToCeremony(input: {
  guestId: string;
  ceremonyId: CeremonyId;
  tableId?: string | null;
}) {
  await ensureCeremoniesSeeded();

  if (input.tableId) {
    const table = await prisma.ceremonyTable.findUnique({
      where: { id: input.tableId },
      select: { ceremonyId: true },
    });

    if (!table || table.ceremonyId !== input.ceremonyId) {
      throw new Error("TABLE_CEREMONY_MISMATCH");
    }
  }

  return prisma.guestCeremony.upsert({
    where: {
      guestId_ceremonyId: {
        guestId: input.guestId,
        ceremonyId: input.ceremonyId,
      },
    },
    update: {
      tableId: input.tableId ?? null,
    },
    create: {
      guestId: input.guestId,
      ceremonyId: input.ceremonyId,
      tableId: input.tableId ?? null,
    },
  });
}

export async function removeGuestFromCeremony(input: {
  guestId: string;
  ceremonyId: CeremonyId;
}) {
  return prisma.guestCeremony.delete({
    where: {
      guestId_ceremonyId: {
        guestId: input.guestId,
        ceremonyId: input.ceremonyId,
      },
    },
  });
}

export async function syncGuestCeremonies(
  guestId: string,
  ceremonyIds: CeremonyId[],
) {
  await ensureCeremoniesSeeded();

  const desiredIds = [...new Set(ceremonyIds.filter(isCeremonyId))];
  const existing = await prisma.guestCeremony.findMany({
    where: { guestId },
    select: { ceremonyId: true },
  });
  const existingIds = new Set(existing.map((item) => item.ceremonyId));
  const desiredSet = new Set(desiredIds);

  for (const ceremonyId of desiredIds) {
    if (!existingIds.has(ceremonyId)) {
      await prisma.guestCeremony.create({
        data: { guestId, ceremonyId },
      });
    }
  }

  for (const ceremonyId of existingIds) {
    if (!desiredSet.has(ceremonyId as CeremonyId)) {
      await prisma.guestCeremony.delete({
        where: {
          guestId_ceremonyId: {
            guestId,
            ceremonyId,
          },
        },
      });
    }
  }
}

/** Ajoute des cérémonies sans retirer celles déjà affectées. */
export async function addGuestCeremonies(
  guestId: string,
  ceremonyIds: CeremonyId[],
) {
  await ensureCeremoniesSeeded();

  const ids = [...new Set(ceremonyIds.filter(isCeremonyId))];
  for (const ceremonyId of ids) {
    await prisma.guestCeremony.upsert({
      where: {
        guestId_ceremonyId: { guestId, ceremonyId },
      },
      create: { guestId, ceremonyId },
      update: {},
    });
  }
}

export async function resetGuestCeremonyResponses(
  guestId: string,
  ceremonyIds: CeremonyId[],
) {
  const ids = [...new Set(ceremonyIds.filter(isCeremonyId))];
  if (ids.length === 0) return 0;

  const result = await prisma.guestCeremony.updateMany({
    where: {
      guestId,
      ceremonyId: { in: ids },
    },
    data: {
      availability: null,
      confirmedGuests: 0,
      respondedAt: null,
      dressCodeDownloadedAt: null,
    },
  });

  return result.count;
}

export async function assignGuestsBulk(input: {
  guestIds: string[];
  ceremonyId: CeremonyId;
  tableId?: string | null;
}) {
  const results = [];
  for (const guestId of input.guestIds) {
    results.push(
      await assignGuestToCeremony({
        guestId,
        ceremonyId: input.ceremonyId,
        tableId: input.tableId,
      }),
    );
  }
  return results;
}
