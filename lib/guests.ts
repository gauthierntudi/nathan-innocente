import type { Guest } from "@prisma/client";

import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export function hasSubmitted(guest: Pick<Guest, "availability">) {
  return guest.availability !== null;
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
