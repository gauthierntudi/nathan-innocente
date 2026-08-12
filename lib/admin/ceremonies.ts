import { prisma } from "@/lib/prisma";

import {
  CEREMONY_DEFINITIONS,
  isCeremonyId,
  serializeCeremonyBoard,
  type CeremonyBoard,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import { resolveNumGuestsForGuestName } from "@/lib/admin/guest-couple";

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
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { numGuests: true, name: true },
  });

  const fallback = Math.max(1, guest?.numGuests ?? 1);
  const raw =
    typeof explicit === "number" &&
    Number.isFinite(explicit) &&
    explicit >= 1 &&
    explicit <= 50
      ? Math.floor(explicit)
      : fallback;

  return resolveNumGuestsForGuestName(guest?.name ?? "", raw);
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
  const assignedCount = await prisma.guestCeremony.count({
    where: { groupId },
  });

  if (assignedCount > 0) {
    throw new Error("GROUP_HAS_GUESTS");
  }

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

  const guestExists = await prisma.guest.findUnique({
    where: { id: input.guestId },
    select: { id: true, name: true, numGuests: true },
  });
  if (!guestExists) {
    throw new Error("GUEST_NOT_FOUND");
  }

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
    select: { id: true, numGuests: true, confirmedGuests: true, tableId: true },
  });

  const hadAnyTable =
    Boolean(existing?.tableId) ||
    Boolean(
      await prisma.guestCeremony.findFirst({
        where: {
          guestId: input.guestId,
          tableId: { not: null },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { id: true },
      }),
    );

  const numGuests = await resolveCeremonyNumGuests(
    input.guestId,
    input.numGuests ?? (existing ? existing.numGuests : null),
  );

  // Nouvellement affecté à la cérémonie : garantir 2 places si nom couple.
  const creating = !existing;
  const seatsForCreateOrUpdate =
    creating || input.numGuests != null
      ? resolveNumGuestsForGuestName(guestExists.name, numGuests)
      : resolveNumGuestsForGuestName(guestExists.name, existing.numGuests);

  const updateData: {
    tableId?: string | null;
    groupId?: string | null;
    numGuests?: number;
    confirmedGuests?: number;
  } = {};

  if (input.tableId !== undefined) updateData.tableId = input.tableId;
  if (input.groupId !== undefined) updateData.groupId = input.groupId;
  if (creating || input.numGuests != null || seatsForCreateOrUpdate !== existing?.numGuests) {
    updateData.numGuests = seatsForCreateOrUpdate;
    if (existing) {
      updateData.confirmedGuests = Math.min(
        existing.confirmedGuests,
        seatsForCreateOrUpdate,
      );
    }
  }

  // Prisma refuse un `update` totalement vide sur upsert.
  if (Object.keys(updateData).length === 0) {
    updateData.numGuests = seatsForCreateOrUpdate;
  }

  const assignment = await prisma.guestCeremony.upsert({
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
      numGuests: seatsForCreateOrUpdate,
    },
  });

  // Première table = nouveau parcours invitation Messages (pas l'ancien status_send).
  const gainingFirstTable = Boolean(input.tableId) && !hadAnyTable;
  if (gainingFirstTable) {
    await prisma.guest.update({
      where: { id: input.guestId },
      data: {
        statusSend: false,
        statusReminderSent: false,
      },
    });
  }

  return assignment;
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

function clampNumGuests(value: number) {
  return Math.max(1, Math.min(50, Math.floor(value)));
}

export async function syncGuestCeremonies(
  guestId: string,
  ceremonyIds: CeremonyId[],
  numGuests?: number,
  ceremonyNumGuests?: Partial<Record<CeremonyId, number>>,
) {
  await ensureCeremoniesSeeded();

  const desiredIds = [...new Set(ceremonyIds.filter(isCeremonyId))];
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { numGuests: true },
  });
  const resolvedNumGuests = clampNumGuests(
    typeof numGuests === "number" && Number.isFinite(numGuests)
      ? Math.floor(numGuests)
      : Math.max(1, guest?.numGuests ?? 1),
  );
  const existing = await prisma.guestCeremony.findMany({
    where: { guestId },
    select: { ceremonyId: true, confirmedGuests: true, numGuests: true },
  });
  const existingById = new Map(
    existing.map((item) => [item.ceremonyId, item] as const),
  );
  const desiredSet = new Set(desiredIds);

  for (const ceremonyId of desiredIds) {
    const seats = clampNumGuests(
      ceremonyNumGuests?.[ceremonyId] ?? resolvedNumGuests,
    );
    const current = existingById.get(ceremonyId);

    if (!current) {
      await prisma.guestCeremony.create({
        data: { guestId, ceremonyId, numGuests: seats },
      });
      continue;
    }

    if (ceremonyNumGuests?.[ceremonyId] != null || current.numGuests !== seats) {
      await prisma.guestCeremony.update({
        where: {
          guestId_ceremonyId: { guestId, ceremonyId },
        },
        data: {
          numGuests: seats,
          confirmedGuests: Math.min(current.confirmedGuests, seats),
        },
      });
    }
  }

  for (const ceremonyId of existingById.keys()) {
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
  options?: { syncNumGuests?: boolean },
) {
  await ensureCeremoniesSeeded();

  const ids = [...new Set(ceremonyIds.filter(isCeremonyId))];
  const resolvedNumGuests = await resolveCeremonyNumGuests(guestId, numGuests);
  const syncNumGuests = options?.syncNumGuests === true;

  for (const ceremonyId of ids) {
    const existing = await prisma.guestCeremony.findUnique({
      where: { guestId_ceremonyId: { guestId, ceremonyId } },
      select: { confirmedGuests: true, availability: true },
    });

    if (!existing) {
      await prisma.guestCeremony.create({
        data: { guestId, ceremonyId, numGuests: resolvedNumGuests },
      });
      continue;
    }

    // Affectation déjà là : complète seulement si on synchronise les convives
    if (!syncNumGuests) continue;

    await prisma.guestCeremony.update({
      where: { guestId_ceremonyId: { guestId, ceremonyId } },
      data: {
        numGuests: resolvedNumGuests,
        confirmedGuests: Math.min(existing.confirmedGuests, resolvedNumGuests),
      },
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
