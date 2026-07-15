import type { Guest, GuestCeremony } from "@prisma/client";

import { normalizePhone, phoneLookupVariants } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export type GuestWithCeremonies = Guest & {
  guestCeremonies: Pick<GuestCeremony, "ceremonyId">[];
};

/** Clé de comparaison : chiffres uniquement (243824269291). */
export function phoneDigitsKey(phone: string): string {
  return normalizePhone(phone).replace(/\D/g, "");
}

export function buildGuestPhoneIndex<T extends { id: string; phone: string }>(
  guests: T[],
): Map<string, T> {
  const index = new Map<string, T>();

  for (const guest of guests) {
    for (const variant of phoneLookupVariants(guest.phone)) {
      index.set(variant, guest);
    }
    const digits = phoneDigitsKey(guest.phone);
    if (digits) index.set(digits, guest);
  }

  return index;
}

export function findGuestInPhoneIndex<T extends { phone: string }>(
  index: Map<string, T>,
  phone: string,
): T | undefined {
  const normalized = normalizePhone(phone);
  if (!normalized) return undefined;

  return (
    index.get(normalized) ??
    index.get(normalized.slice(1)) ??
    index.get(phoneDigitsKey(normalized))
  );
}

export function registerGuestInPhoneIndex<T extends { id: string; phone: string }>(
  index: Map<string, T>,
  guest: T,
) {
  for (const variant of phoneLookupVariants(guest.phone)) {
    index.set(variant, guest);
  }
  const digits = phoneDigitsKey(guest.phone);
  if (digits) index.set(digits, guest);
}

const guestCeremonySelect = {
  guestCeremonies: {
    select: { ceremonyId: true },
  },
} as const;

export async function findGuestByPhoneForAdmin(
  phone: string,
): Promise<GuestWithCeremonies | null> {
  const variants = phoneLookupVariants(phone);
  if (variants.length === 0) return null;

  const direct = await prisma.guest.findFirst({
    where: { phone: { in: variants } },
    include: guestCeremonySelect,
    orderBy: { createdAt: "asc" },
  });
  if (direct) return direct;

  const digits = phoneDigitsKey(phone);
  if (!digits) return null;

  const candidates = await prisma.guest.findMany({
    include: guestCeremonySelect,
    orderBy: { createdAt: "asc" },
  });

  return (
    candidates.find((guest) => phoneDigitsKey(guest.phone) === digits) ?? null
  );
}
