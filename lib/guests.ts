import type { Guest } from "@prisma/client";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { hasRespondedToAllCeremonies } from "@/lib/guest-ceremonies";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

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
      dressCodeDownloadedAt: true,
      guestCeremonies: {
        select: { availability: true },
      },
    },
  });

  if (!guest) return false;

  if (guest.guestCeremonies.length === 0) {
    return guest.availability !== null;
  }

  const allResponded = hasRespondedToAllCeremonies(guest.guestCeremonies);
  if (!allResponded) return false;

  const anyDeclined = guest.guestCeremonies.some(
    (assignment) => assignment.availability === false,
  );
  if (anyDeclined) return true;

  return guest.dressCodeDownloadedAt !== null;
}

export async function getGuestEndReason(
  guestId: string,
): Promise<"confirmed" | "declined" | null> {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      availability: true,
      dressCodeDownloadedAt: true,
      guestCeremonies: {
        select: { availability: true },
      },
    },
  });

  if (!guest) return null;

  if (guest.guestCeremonies.length === 0) {
    if (guest.availability === null) return null;
    return guest.availability ? "confirmed" : "declined";
  }

  if (!hasRespondedToAllCeremonies(guest.guestCeremonies)) {
    const anyResponded = guest.guestCeremonies.some(
      (assignment) => assignment.availability !== null,
    );
    if (!anyResponded) return null;

    const anyYes = guest.guestCeremonies.some(
      (assignment) => assignment.availability === true,
    );
    if (guest.dressCodeDownloadedAt) {
      return anyYes ? "confirmed" : "declined";
    }

    const allDeclinedSoFar = guest.guestCeremonies
      .filter((assignment) => assignment.availability !== null)
      .every((assignment) => assignment.availability === false);

    return allDeclinedSoFar ? "declined" : null;
  }

  const anyYes = guest.guestCeremonies.some(
    (assignment) => assignment.availability === true,
  );
  return anyYes ? "confirmed" : "declined";
}

export async function syncGuestAvailabilityAggregate(guestId: string) {
  const assignments = await prisma.guestCeremony.findMany({
    where: { guestId },
    select: { availability: true, confirmedGuests: true },
  });

  if (assignments.length === 0) {
    return;
  }

  const allResponded = assignments.every((assignment) => assignment.availability !== null);
  const anyYes = assignments.some((assignment) => assignment.availability === true);
  const confirmedGuests = assignments
    .filter((assignment) => assignment.availability === true)
    .reduce((max, assignment) => Math.max(max, assignment.confirmedGuests), 0);

  await prisma.guest.update({
    where: { id: guestId },
    data: {
      availability: allResponded ? anyYes : null,
      confirmedGuests: allResponded && anyYes ? confirmedGuests : 0,
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
    where: { phone: normalized },
    orderBy: { createdAt: "asc" },
  });
}

export async function findGuestBySession(phone: string, deviceId: string) {
  const normalized = normalizePhone(phone);

  if (normalized) {
    const byPhone = await prisma.guest.findFirst({
      where: { phone: normalized },
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

export async function markDressCodeDownloaded(guestId: string) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { dressCodeDownloadedAt: true },
  });

  if (!guest || guest.dressCodeDownloadedAt) {
    return { recorded: false };
  }

  await prisma.guest.update({
    where: { id: guestId },
    data: { dressCodeDownloadedAt: new Date() },
  });

  return { recorded: true };
}
