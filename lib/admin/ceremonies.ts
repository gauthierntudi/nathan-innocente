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

  await backfillCeremonyNumGuestsOnce();
}

/** Une fois après migration : copie guest.num_guests si toutes les lignes sont encore à 1. */
async function backfillCeremonyNumGuestsOnce() {
  try {
    const total = await prisma.guestCeremony.count();
    if (total === 0) return;

    const stillDefault = await prisma.guestCeremony.count({
      where: { numGuests: 1 },
    });
    if (stillDefault !== total) return;

    await prisma.$executeRaw`
      UPDATE guest_ceremonies gc
      SET num_guests = g.num_guests
      FROM guests g
      WHERE gc.guest_id = g.id
        AND g.num_guests > 1
    `;
  } catch (error) {
    console.error("backfillCeremonyNumGuestsOnce", error);
  }
}

async function resolveCeremonyNumGuests(
  guestId: string,
  explicit?: number | null,
) {
  if (
    typeof explicit === "number" &&
    Number.isFinite(explicit) &&
    explicit >= 1 &&
    explicit <= 50
  ) {
    return Math.floor(explicit);
  }

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { numGuests: true },
  });
  return Math.max(1, guest?.numGuests ?? 1);
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
      groups: {
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

export async function createCeremonyGroup(input: {
  ceremonyId: CeremonyId;
  name: string;
}) {
  await ensureCeremoniesSeeded();

  const count = await prisma.ceremonyGroup.count({
    where: { ceremonyId: input.ceremonyId },
  });

  return prisma.ceremonyGroup.create({
    data: {
      ceremonyId: input.ceremonyId,
      name: input.name.trim(),
      sortOrder: count + 1,
    },
  });
}

export async function updateCeremonyGroup(
  groupId: string,
  input: { name?: string },
) {
  return prisma.ceremonyGroup.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    },
  });
}

export async function deleteCeremonyGroup(groupId: string) {
  await prisma.guestCeremony.updateMany({
    where: { groupId },
    data: { groupId: null },
  });

  return prisma.ceremonyGroup.delete({ where: { id: groupId } });
}

export async function assignGuestToCeremony(input: {
  guestId: string;
  ceremonyId: CeremonyId;
  tableId?: string | null;
  groupId?: string | null;
  numGuests?: number | null;
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

  if (input.groupId) {
    const group = await prisma.ceremonyGroup.findUnique({
      where: { id: input.groupId },
      select: { ceremonyId: true },
    });

    if (!group || group.ceremonyId !== input.ceremonyId) {
      throw new Error("GROUP_CEREMONY_MISMATCH");
    }
  }

  const existing = await prisma.guestCeremony.findUnique({
    where: {
      guestId_ceremonyId: {
        guestId: input.guestId,
        ceremonyId: input.ceremonyId,
      },
    },
    select: { id: true, numGuests: true },
  });

  const numGuests = await resolveCeremonyNumGuests(
    input.guestId,
    input.numGuests ?? (existing ? existing.numGuests : null),
  );

  const updateData: {
    tableId?: string | null;
    groupId?: string | null;
    numGuests?: number;
  } = {};

  if (input.tableId !== undefined) updateData.tableId = input.tableId;
  if (input.groupId !== undefined) updateData.groupId = input.groupId;
  if (input.numGuests != null) updateData.numGuests = numGuests;

  return prisma.guestCeremony.upsert({
    where: {
      guestId_ceremonyId: {
        guestId: input.guestId,
        ceremonyId: input.ceremonyId,
      },
    },
    update: updateData,
    create: {
      guestId: input.guestId,
      ceremonyId: input.ceremonyId,
      tableId: input.tableId ?? null,
      groupId: input.groupId ?? null,
      numGuests,
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
  numGuests?: number,
) {
  await ensureCeremoniesSeeded();

  const desiredIds = [...new Set(ceremonyIds.filter(isCeremonyId))];
  const resolvedNumGuests = await resolveCeremonyNumGuests(guestId, numGuests);
  const existing = await prisma.guestCeremony.findMany({
    where: { guestId },
    select: { ceremonyId: true },
  });
  const existingIds = new Set(existing.map((item) => item.ceremonyId));
  const desiredSet = new Set(desiredIds);

  for (const ceremonyId of desiredIds) {
    if (!existingIds.has(ceremonyId)) {
      await prisma.guestCeremony.create({
        data: { guestId, ceremonyId, numGuests: resolvedNumGuests },
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
  numGuests?: number,
) {
  await ensureCeremoniesSeeded();

  const ids = [...new Set(ceremonyIds.filter(isCeremonyId))];
  const resolvedNumGuests = await resolveCeremonyNumGuests(guestId, numGuests);

  for (const ceremonyId of ids) {
    await prisma.guestCeremony.upsert({
      where: {
        guestId_ceremonyId: { guestId, ceremonyId },
      },
      create: { guestId, ceremonyId, numGuests: resolvedNumGuests },
      // Conserve le numGuests déjà défini pour les affectations existantes
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
  groupId?: string | null;
  numGuests?: number | null;
}) {
  const results = [];
  for (const guestId of input.guestIds) {
    results.push(
      await assignGuestToCeremony({
        guestId,
        ceremonyId: input.ceremonyId,
        tableId: input.tableId,
        groupId: input.groupId,
        numGuests: input.numGuests,
      }),
    );
  }
  return results;
}
