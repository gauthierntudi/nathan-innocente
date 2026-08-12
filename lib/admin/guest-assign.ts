import type { GuestDuplicate } from "@prisma/client";

import {
  isCeremonyId,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import {
  addGuestCeremonies,
  createCeremonyGroup,
  resetGuestCeremonyResponses,
  syncGuestCeremonies,
} from "@/lib/admin/ceremonies";
import {
  allocateFictitiousPhone,
  registerGuestFictitious,
} from "@/lib/admin/fictitious-phone";
import { upsertGuestDuplicate } from "@/lib/admin/guest-duplicates";
import {
  guestNamesAreRelated,
  preferRicherGuestName,
} from "@/lib/admin/guest-name-match";
import { findGuestByPhoneForAdmin } from "@/lib/admin/guest-phone-lookup";
import { serializeGuest, type AdminGuest } from "@/lib/admin/types";
import type { GuestType } from "@/lib/admin/guest-type";
import { syncGuestAvailabilityAggregate } from "@/lib/guests";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const guestCeremonyInclude = {
  guestCeremonies: {
    select: {
      ceremonyId: true,
      tableId: true,
      groupId: true,
      group: {
        select: { name: true },
      },
      availability: true,
      confirmedGuests: true,
      dressCodeDownloadedAt: true,
      numGuests: true,
    },
  },
} as const;

export async function assignGuestToGroupByName(
  guestId: string,
  ceremonyIds: CeremonyId[],
  groupName: string | null | undefined,
) {
  const cleaned = groupName?.trim();
  if (!cleaned) return 0;
  const ids = [...new Set(ceremonyIds)];
  let affected = 0;

  for (const ceremonyId of ids) {
    const existingGroup = await prisma.ceremonyGroup.findFirst({
      where: {
        ceremonyId,
        name: { equals: cleaned, mode: "insensitive" },
      },
      select: { id: true },
    });

    const groupId =
      existingGroup?.id ??
      (
        await createCeremonyGroup({
          ceremonyId,
          name: cleaned,
        })
      ).id;

    const updated = await prisma.guestCeremony.updateMany({
      where: { guestId, ceremonyId },
      data: { groupId },
    });
    affected += updated.count;
  }

  return affected;
}

export async function loadSerializedAdminGuest(guestId: string) {
  const guest = await prisma.guest.findUniqueOrThrow({
    where: { id: guestId },
    include: guestCeremonyInclude,
  });
  return serializeGuest(guest);
}

/**
 * Même téléphone + nom lié : complète cérémonies / convives,
 * et enrichit le nom si la nouvelle version est plus complète.
 */
export async function assignCeremoniesToExistingGuest(input: {
  guestId: string;
  phone: string;
  ceremonyIds: CeremonyId[];
  guestName: string;
  incomingName?: string;
  numGuests?: number;
  guestType?: GuestType;
  groupName?: string | null;
}) {
  const phone = normalizePhone(input.phone);
  const before = await prisma.guestCeremony.findMany({
    where: { guestId: input.guestId },
    select: { ceremonyId: true },
  });
  const beforeIds = new Set(before.map((row) => row.ceremonyId));

  const richerName = input.incomingName
    ? preferRicherGuestName(input.guestName, input.incomingName)
    : input.guestName;

  await prisma.guest.update({
    where: { id: input.guestId },
    data: {
      phone,
      name: richerName,
      ...(input.numGuests != null ? { numGuests: input.numGuests } : {}),
      ...(input.guestType ? { guestType: input.guestType } : {}),
    },
  });

  if (input.ceremonyIds.length > 0) {
    await addGuestCeremonies(input.guestId, input.ceremonyIds, input.numGuests, {
      syncNumGuests: true,
    });
    await assignGuestToGroupByName(
      input.guestId,
      input.ceremonyIds,
      input.groupName,
    );
    await syncGuestAvailabilityAggregate(input.guestId);
  }

  const addedCeremonies = input.ceremonyIds.filter((id) => !beforeIds.has(id));
  const message =
    input.ceremonyIds.length === 0
      ? `Invité « ${richerName} » déjà en base (aucun doublon créé)`
      : addedCeremonies.length > 0
        ? `Invité « ${richerName} » déjà en base — ${addedCeremonies.length} cérémonie(s) ajoutée(s)`
        : `Invité « ${richerName} » déjà en base — infos complétées (convives / cérémonies)`;

  return {
    message,
    guest: await loadSerializedAdminGuest(input.guestId),
    addedCeremonyCount: addedCeremonies.length,
  };
}

export type ResolveGuestEditPhoneConflictResult =
  | {
      kind: "merged";
      message: string;
      guest: AdminGuest;
      removedGuestId: string;
    }
  | {
      kind: "duplicate";
      message: string;
      guest: AdminGuest;
      duplicate: GuestDuplicate;
    };

/**
 * Même logique qu’à l’ajout quand le téléphone édité appartient déjà à un autre invité :
 * - noms liés → fusion vers le détenteur du numéro, puis suppression de l’invité édité
 * - noms différents → enregistrement en table doublons (l’invité édité n’est pas modifié)
 */
export async function resolveGuestEditPhoneConflict(input: {
  editedGuestId: string;
  conflictGuest: { id: string; name: string };
  name: string;
  phone: string;
  numGuests: number;
  guestType: GuestType;
  ceremonyIds: CeremonyId[];
  ceremonyNumGuests?: Partial<Record<CeremonyId, number>>;
  groupName?: string | null;
  resetCeremonyIds?: CeremonyId[];
  genre?: string;
}): Promise<ResolveGuestEditPhoneConflictResult> {
  const phone = normalizePhone(input.phone);
  const targetId = input.conflictGuest.id;

  if (guestNamesAreRelated(input.conflictGuest.name, input.name)) {
    const sourceAssignments = await prisma.guestCeremony.findMany({
      where: { guestId: input.editedGuestId },
    });
    const targetAssignments = await prisma.guestCeremony.findMany({
      where: { guestId: targetId },
      select: { ceremonyId: true },
    });
    const targetCeremonyIds = new Set(
      targetAssignments.map((row) => row.ceremonyId),
    );

    for (const assignment of sourceAssignments) {
      if (!isCeremonyId(assignment.ceremonyId)) continue;
      if (targetCeremonyIds.has(assignment.ceremonyId)) continue;

      await prisma.guestCeremony.create({
        data: {
          guestId: targetId,
          ceremonyId: assignment.ceremonyId,
          tableId: assignment.tableId,
          groupId: assignment.groupId,
          numGuests: assignment.numGuests,
          availability: assignment.availability,
          confirmedGuests: assignment.confirmedGuests,
          dressCodeDownloadedAt: assignment.dressCodeDownloadedAt,
        },
      });
      targetCeremonyIds.add(assignment.ceremonyId);
    }

    const richerName = preferRicherGuestName(
      input.conflictGuest.name,
      input.name,
    );
    const confirmedGuestsCap = Math.min(
      (
        await prisma.guest.findUniqueOrThrow({
          where: { id: targetId },
          select: { confirmedGuests: true },
        })
      ).confirmedGuests,
      Math.floor(input.numGuests),
    );

    await prisma.guest.update({
      where: { id: targetId },
      data: {
        name: richerName,
        numGuests: Math.floor(input.numGuests),
        confirmedGuests: confirmedGuestsCap,
        guestType: input.guestType,
      },
    });

    const mergedCeremonyIds = [
      ...new Set([
        ...[...targetCeremonyIds].filter(isCeremonyId),
        ...input.ceremonyIds,
      ]),
    ];

    await syncGuestCeremonies(
      targetId,
      mergedCeremonyIds,
      Math.floor(input.numGuests),
      input.ceremonyNumGuests,
    );

    await assignGuestToGroupByName(
      targetId,
      input.ceremonyIds,
      input.groupName,
    );

    if ((input.resetCeremonyIds ?? []).length > 0) {
      await resetGuestCeremonyResponses(targetId, input.resetCeremonyIds ?? []);
    }

    await syncGuestAvailabilityAggregate(targetId);
    await prisma.guest.delete({ where: { id: input.editedGuestId } });

    return {
      kind: "merged",
      message: `Invité fusionné avec « ${richerName} » (même téléphone, nom lié)`,
      guest: await loadSerializedAdminGuest(targetId),
      removedGuestId: input.editedGuestId,
    };
  }

  const dup = await upsertGuestDuplicate({
    guestId: targetId,
    name: input.name,
    phone,
    numGuests: input.numGuests,
    genre: input.genre ?? "Cher(e)",
    ceremonyIds: input.ceremonyIds,
  });

  return {
    kind: "duplicate",
    message: dup.message,
    guest: await loadSerializedAdminGuest(input.editedGuestId),
    duplicate: dup.duplicate,
  };
}

export async function createGuestWithCeremonies(input: {
  name: string;
  phone: string;
  numGuests: number;
  genre: string;
  token: string;
  ceremonyIds: CeremonyId[];
  guestType?: GuestType;
  groupName?: string | null;
  phoneFictitious?: boolean;
}) {
  const wantsFictitious =
    Boolean(input.phoneFictitious) || !input.phone.trim();
  const phone = wantsFictitious
    ? await allocateFictitiousPhone()
    : normalizePhone(input.phone);
  const guestType = input.guestType ?? "standard";

  try {
    const guest = await prisma.guest.create({
      data: {
        name: input.name,
        phone,
        numGuests: input.numGuests,
        genre: input.genre,
        token: input.token,
        phoneFictitious: wantsFictitious,
        guestType,
      },
    });

    if (wantsFictitious) {
      await registerGuestFictitious({
        guestId: guest.id,
        phone,
        name: guest.name,
        genre: guest.genre,
        numGuests: guest.numGuests,
      });
    }

    if (input.ceremonyIds.length > 0) {
      await syncGuestCeremonies(guest.id, input.ceremonyIds, input.numGuests);
      await assignGuestToGroupByName(guest.id, input.ceremonyIds, input.groupName);
      await syncGuestAvailabilityAggregate(guest.id);
    }

    return {
      message: wantsFictitious
        ? `Invité « ${guest.name} » ajouté avec numéro fictif ${phone}`
        : `Invité « ${guest.name} » ajouté`,
      guest: await loadSerializedAdminGuest(guest.id),
    };
  } catch (error) {
    // Course / index téléphone manqué → fusionne vers l'existant
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      !wantsFictitious
    ) {
      const existing = await findGuestByPhoneForAdmin(phone);
      if (existing) {
        if (guestNamesAreRelated(existing.name, input.name)) {
          return assignCeremoniesToExistingGuest({
            guestId: existing.id,
            phone,
            ceremonyIds: input.ceremonyIds,
            guestName: existing.name,
            incomingName: input.name,
            numGuests: input.numGuests,
            guestType,
            groupName: input.groupName,
          });
        }

        const dup = await upsertGuestDuplicate({
          guestId: existing.id,
          name: input.name,
          phone,
          numGuests: input.numGuests,
          genre: input.genre,
          ceremonyIds: input.ceremonyIds,
        });

        return {
          message: dup.message,
          guest: await loadSerializedAdminGuest(existing.id),
        };
      }
    }
    throw error;
  }
}

export type ResolveGuestWriteInput = {
  name: string;
  phone: string;
  numGuests: number;
  genre: string;
  token: string;
  ceremonyIds: CeremonyId[];
  guestType?: GuestType;
  groupName?: string | null;
  phoneFictitious?: boolean;
};

export type ResolveGuestWriteResult =
  | {
      kind: "created";
      message: string;
      guest: AdminGuest;
      addedCeremonyCount: number;
    }
  | {
      kind: "updated";
      message: string;
      guest: AdminGuest;
      addedCeremonyCount: number;
    }
  | {
      kind: "duplicate";
      message: string;
      guest: AdminGuest;
      duplicate: GuestDuplicate;
      duplicateCreated: boolean;
      addedCeremonyCount: number;
    };

/**
 * Téléphone unique :
 * 1. Pas de numéro → création avec numéro fictif
 * 2. Pas d’invité → création
 * 3. Même tél. + nom lié → mise à jour
 * 4. Même tél. + nom totalement différent → table doublon
 */
export async function resolveGuestWrite(
  input: ResolveGuestWriteInput,
  existingGuest: { id: string; name: string; phone: string } | null,
): Promise<ResolveGuestWriteResult> {
  // Sans numéro réel : toujours un nouvel invité + numéro fictif.
  if (input.phoneFictitious || !input.phone.trim()) {
    const result = await createGuestWithCeremonies({
      ...input,
      phoneFictitious: true,
    });
    return {
      kind: "created",
      message: result.message,
      guest: result.guest,
      addedCeremonyCount: input.ceremonyIds.length,
    };
  }

  if (!existingGuest) {
    const result = await createGuestWithCeremonies(input);
    return {
      kind: "created",
      message: result.message,
      guest: result.guest,
      addedCeremonyCount: input.ceremonyIds.length,
    };
  }

  if (guestNamesAreRelated(existingGuest.name, input.name)) {
    const result = await assignCeremoniesToExistingGuest({
      guestId: existingGuest.id,
      phone: input.phone,
      ceremonyIds: input.ceremonyIds,
      guestName: existingGuest.name,
      incomingName: input.name,
      numGuests: input.numGuests,
      guestType: input.guestType,
      groupName: input.groupName,
    });

    return {
      kind: "updated",
      message: result.message,
      guest: result.guest,
      addedCeremonyCount: result.addedCeremonyCount,
    };
  }

  const dup = await upsertGuestDuplicate({
    guestId: existingGuest.id,
    name: input.name,
    phone: input.phone,
    numGuests: input.numGuests,
    genre: input.genre,
    ceremonyIds: input.ceremonyIds,
  });

  return {
    kind: "duplicate",
    message: dup.message,
    guest: await loadSerializedAdminGuest(existingGuest.id),
    duplicate: dup.duplicate,
    duplicateCreated: dup.created,
    addedCeremonyCount: 0,
  };
}
