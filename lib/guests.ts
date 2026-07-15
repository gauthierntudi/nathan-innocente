import type { Guest } from "@prisma/client";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { hasRespondedToAllCeremonies } from "@/lib/guest-ceremonies";
import { hasCompletedAllCeremonySteps } from "@/lib/guest-rsvp-flow";
import { normalizePhone, phoneLookupVariants } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

async function getCeremonyRsvpRows(guestId: string) {
  return prisma.$queryRaw<
    Array<{
      availability: boolean | null;
      dress_code_downloaded_at: Date | null;
    }>
  >`
    SELECT availability, dress_code_downloaded_at
    FROM guest_ceremonies
    WHERE guest_id = ${guestId}
  `;
}

export function hasSubmitted(guest: Pick<Guest, "availability">) {
  return guest.availability !== null;
}

export async function hasGuestCompletedRsvp(guestId: string) {
  return shouldShowGuestEndScreen(guestId);
}

export async function shouldShowGuestEndScreen(guestId: string) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      availability: true,
      guestCeremonies: {
        select: { id: true },
      },
    },
  });

  if (!guest) return false;

  if (guest.guestCeremonies.length === 0) {
    return guest.availability !== null;
  }

  const rows = await getCeremonyRsvpRows(guestId);
  return hasCompletedAllCeremonySteps(
    rows.map((row) => ({
      availability: row.availability,
      dressCodeDownloadedAt: row.dress_code_downloaded_at?.toISOString() ?? null,
    })),
  );
}

export async function getGuestEndReason(
  guestId: string,
): Promise<"confirmed" | "declined" | null> {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      availability: true,
      guestCeremonies: {
        select: { id: true },
      },
    },
  });

  if (!guest) return null;

  if (guest.guestCeremonies.length === 0) {
    if (guest.availability === null) return null;
    return guest.availability ? "confirmed" : "declined";
  }

  const rows = await getCeremonyRsvpRows(guestId);
  const states = rows.map((row) => ({
    availability: row.availability,
    dressCodeDownloadedAt: row.dress_code_downloaded_at?.toISOString() ?? null,
  }));

  if (!hasCompletedAllCeremonySteps(states)) {
    return null;
  }

  return states.some((assignment) => assignment.availability === true)
    ? "confirmed"
    : "declined";
}

export async function syncGuestAvailabilityAggregate(guestId: string) {
  const rows = await prisma.$queryRaw<
    Array<{
      availability: boolean | null;
      confirmed_guests: number;
      dress_code_downloaded_at: Date | null;
    }>
  >`
    SELECT availability, confirmed_guests, dress_code_downloaded_at
    FROM guest_ceremonies
    WHERE guest_id = ${guestId}
  `;

  if (rows.length === 0) {
    return;
  }

  const assignments = rows.map((row) => ({
    availability: row.availability,
    confirmedGuests: row.confirmed_guests,
    dressCodeDownloadedAt: row.dress_code_downloaded_at,
  }));

  const allResponded = hasRespondedToAllCeremonies(assignments);
  const anyYes = assignments.some((assignment) => assignment.availability === true);
  const confirmedGuests = assignments
    .filter((assignment) => assignment.availability === true)
    .reduce((max, assignment) => Math.max(max, assignment.confirmedGuests), 0);
  const downloadedDates = assignments
    .map((assignment) => assignment.dressCodeDownloadedAt)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  await prisma.guest.update({
    where: { id: guestId },
    data: {
      availability: allResponded ? anyYes : null,
      confirmedGuests: allResponded && anyYes ? confirmedGuests : 0,
      dressCodeDownloadedAt: downloadedDates[0] ?? null,
    },
  });
}

export async function updateCeremonyAvailability(
  guestId: string,
  ceremonyId: CeremonyId,
  availability: boolean,
  confirmedGuests: number,
) {
  const assignment = await prisma.guestCeremony.findUnique({
    where: {
      guestId_ceremonyId: { guestId, ceremonyId },
    },
  });

  if (!assignment) {
    throw new Error("Cérémonie non assignée à cet invité.");
  }

  await prisma.guestCeremony.update({
    where: { id: assignment.id },
    data: {
      availability,
      confirmedGuests: availability ? confirmedGuests : 0,
      respondedAt: new Date(),
    },
  });

  await syncGuestAvailabilityAggregate(guestId);

  return prisma.guest.findUniqueOrThrow({ where: { id: guestId } });
}

export async function findGuestByPhone(phone: string, urlToken?: string) {
  const normalized = normalizePhone(phone);

  if (urlToken) {
    const byToken = await prisma.guest.findUnique({ where: { token: urlToken } });
    if (!byToken || normalizePhone(byToken.phone) !== normalized) {
      return null;
    }
    return byToken;
  }

  return prisma.guest.findFirst({
    where: { phone: { in: phoneLookupVariants(normalized) } },
    orderBy: { createdAt: "asc" },
  });
}

export async function findGuestBySession(phone: string, deviceId: string) {
  const normalized = normalizePhone(phone);

  if (normalized) {
    const byPhone = await prisma.guest.findFirst({
      where: { phone: { in: phoneLookupVariants(normalized) } },
      orderBy: { createdAt: "asc" },
    });
    if (byPhone) return byPhone;
  }

  if (deviceId) {
    return prisma.guest.findFirst({ where: { deviceId } });
  }

  return null;
}

export async function bindDeviceIfEmpty(guest: Guest, deviceId: string) {
  if (guest.deviceId) return guest;

  return prisma.guest.update({
    where: { id: guest.id },
    data: { deviceId, status: "active" },
  });
}

export async function updateGuestAvailability(
  guestId: string,
  availability: boolean,
  confirmedGuests: number,
) {
  return prisma.guest.update({
    where: { id: guestId },
    data: {
      availability,
      confirmedGuests: availability ? confirmedGuests : 0,
    },
  });
}

/** Migrate legacy guest-level download to a single ceremony assignment. */
export async function backfillSingleCeremonyDressCode(guestId: string) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      dressCodeDownloadedAt: true,
      guestCeremonies: {
        select: { id: true },
      },
    },
  });

  if (!guest?.dressCodeDownloadedAt || guest.guestCeremonies.length !== 1) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE guest_ceremonies
    SET dress_code_downloaded_at = ${guest.dressCodeDownloadedAt}
    WHERE id = ${guest.guestCeremonies[0].id}
      AND dress_code_downloaded_at IS NULL
  `;
}

export async function markDressCodeDownloaded(
  guestId: string,
  ceremonyId?: CeremonyId | null,
) {
  const now = new Date();

  if (ceremonyId && isCeremonyId(ceremonyId)) {
    const assignment = await prisma.guestCeremony.findUnique({
      where: {
        guestId_ceremonyId: { guestId, ceremonyId },
      },
      select: { id: true },
    });

    if (!assignment) {
      return { recorded: false };
    }

    const updated = await prisma.$executeRaw`
      UPDATE guest_ceremonies
      SET dress_code_downloaded_at = ${now}
      WHERE id = ${assignment.id}
        AND dress_code_downloaded_at IS NULL
    `;

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      select: { dressCodeDownloadedAt: true },
    });

    if (guest && !guest.dressCodeDownloadedAt) {
      await prisma.guest.update({
        where: { id: guestId },
        data: { dressCodeDownloadedAt: now },
      });
    }

    return { recorded: Number(updated) > 0 };
  }

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { dressCodeDownloadedAt: true },
  });

  if (!guest || guest.dressCodeDownloadedAt) {
    return { recorded: false };
  }

  await prisma.guest.update({
    where: { id: guestId },
    data: { dressCodeDownloadedAt: now },
  });

  return { recorded: true };
}

