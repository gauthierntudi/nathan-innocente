import type { GuestDuplicate } from "@prisma/client";

import { addGuestCeremonies } from "@/lib/admin/ceremonies";
import {
  isCeremonyId,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import {
  guestNamesAreRelated,
  preferRicherGuestName,
} from "@/lib/admin/guest-name-match";
import { phoneDigitsKey } from "@/lib/admin/guest-phone-lookup";
import { serializeGuest, type AdminGuest } from "@/lib/admin/types";
import { syncGuestAvailabilityAggregate } from "@/lib/guests";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

async function loadGuestAfterResolve(guestId: string): Promise<AdminGuest> {
  const guest = await prisma.guest.findUniqueOrThrow({
    where: { id: guestId },
    include: {
      guestCeremonies: {
        select: {
          ceremonyId: true,
          tableId: true,
          availability: true,
          confirmedGuests: true,
          dressCodeDownloadedAt: true,
          numGuests: true,
        },
      },
    },
  });
  return serializeGuest(guest);
}

export type AdminGuestDuplicate = {
  id: string;
  phone: string;
  name: string;
  genre: string;
  numGuests: number;
  ceremonyIds: CeremonyId[];
  guestId: string;
  createdAt: string;
  updatedAt: string;
  guest: {
    id: string;
    name: string;
    phone: string;
    genre: string;
    numGuests: number;
    ceremonyIds: CeremonyId[];
  };
};

export function serializeGuestDuplicate(
  row: GuestDuplicate & {
    guest: {
      id: string;
      name: string;
      phone: string;
      genre: string;
      numGuests: number;
      guestCeremonies?: Array<{ ceremonyId: string }>;
    };
  },
): AdminGuestDuplicate {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    genre: row.genre,
    numGuests: row.numGuests,
    ceremonyIds: row.ceremonyIds.filter(isCeremonyId),
    guestId: row.guestId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    guest: {
      id: row.guest.id,
      name: row.guest.name,
      phone: row.guest.phone,
      genre: row.guest.genre,
      numGuests: row.guest.numGuests,
      ceremonyIds: (row.guest.guestCeremonies ?? [])
        .map((item) => item.ceremonyId)
        .filter(isCeremonyId),
    },
  };
}

export async function listGuestDuplicates(): Promise<AdminGuestDuplicate[]> {
  const rows = await prisma.guestDuplicate.findMany({
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    include: {
      guest: {
        select: {
          id: true,
          name: true,
          phone: true,
          genre: true,
          numGuests: true,
          guestCeremonies: { select: { ceremonyId: true } },
        },
      },
    },
  });

  return rows.map(serializeGuestDuplicate);
}

export type ResolveDuplicateAction = "merge" | "replace_name" | "dismiss";

export async function resolveGuestDuplicate(
  duplicateId: string,
  action: ResolveDuplicateAction,
): Promise<{
  message: string;
  guest: AdminGuest | null;
  deletedId: string;
}> {
  const row = await prisma.guestDuplicate.findUnique({
    where: { id: duplicateId },
  });

  if (!row) {
    throw new Error("Doublon introuvable");
  }

  if (action === "dismiss") {
    await prisma.guestDuplicate.delete({ where: { id: duplicateId } });
    return {
      message: `Doublon « ${row.name} » supprimé`,
      guest: null,
      deletedId: duplicateId,
    };
  }

  const ceremonyIds = row.ceremonyIds.filter(isCeremonyId);

  if (ceremonyIds.length > 0) {
    await addGuestCeremonies(row.guestId, ceremonyIds, row.numGuests, {
      syncNumGuests: true,
    });
  }

  const guestUpdate: {
    numGuests: number;
    name?: string;
    genre?: string;
  } = {
    numGuests: row.numGuests,
  };

  if (action === "replace_name") {
    guestUpdate.name = row.name.trim();
    guestUpdate.genre = row.genre;
  }

  await prisma.guest.update({
    where: { id: row.guestId },
    data: guestUpdate,
  });

  await syncGuestAvailabilityAggregate(row.guestId);
  await prisma.guestDuplicate.delete({ where: { id: duplicateId } });

  const guest = await loadGuestAfterResolve(row.guestId);
  const message =
    action === "replace_name"
      ? `Invité renommé « ${guest.name} » — cérémonies du doublon fusionnées`
      : `Cérémonies de « ${row.name} » fusionnées vers « ${guest.name} »`;

  return {
    message,
    guest,
    deletedId: duplicateId,
  };
}

function mergeCeremonyIds(
  existing: string[],
  incoming: CeremonyId[],
): string[] {
  return [...new Set([...existing, ...incoming])];
}

export type UpsertGuestDuplicateInput = {
  guestId: string;
  name: string;
  phone: string;
  numGuests: number;
  genre: string;
  ceremonyIds: CeremonyId[];
};

export type UpsertGuestDuplicateResult = {
  duplicate: GuestDuplicate;
  created: boolean;
  message: string;
};

/**
 * Même logique que les invités : téléphone + similarité de nom.
 * - nom lié à une ligne doublon existante → mise à jour (cérémonies / convives)
 * - sinon → nouvelle ligne doublon
 */
export async function upsertGuestDuplicate(
  input: UpsertGuestDuplicateInput,
): Promise<UpsertGuestDuplicateResult> {
  const phone = normalizePhone(input.phone);
  const digits = phoneDigitsKey(phone);

  const candidates = await prisma.guestDuplicate.findMany({
    where: { guestId: input.guestId },
    orderBy: { createdAt: "asc" },
  });

  const related = candidates.find(
    (row) =>
      phoneDigitsKey(row.phone) === digits &&
      guestNamesAreRelated(row.name, input.name),
  );

  if (related) {
    const ceremonyIds = mergeCeremonyIds(related.ceremonyIds, input.ceremonyIds);
    const name = preferRicherGuestName(related.name, input.name);

    const duplicate = await prisma.guestDuplicate.update({
      where: { id: related.id },
      data: {
        phone,
        name,
        genre: input.genre || related.genre,
        numGuests: input.numGuests,
        ceremonyIds,
      },
    });

    const added = input.ceremonyIds.filter((id) => !related.ceremonyIds.includes(id));

    return {
      duplicate,
      created: false,
      message:
        added.length > 0
          ? `Doublon « ${name} » mis à jour — ${added.length} cérémonie(s) ajoutée(s)`
          : `Doublon « ${name} » mis à jour (infos complétées)`,
    };
  }

  const duplicate = await prisma.guestDuplicate.create({
    data: {
      guestId: input.guestId,
      phone,
      name: input.name.trim(),
      genre: input.genre,
      numGuests: input.numGuests,
      ceremonyIds: [...new Set(input.ceremonyIds)],
    },
  });

  return {
    duplicate,
    created: true,
    message: `Doublon enregistré : « ${duplicate.name} » (tél. déjà utilisé par un autre nom)`,
  };
}
