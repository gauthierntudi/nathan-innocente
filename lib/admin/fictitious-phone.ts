import { randomInt } from "node:crypto";

import { phoneDigitsKey } from "@/lib/admin/guest-phone-lookup";
import { serializeGuest, type AdminGuest } from "@/lib/admin/types";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

/** Préfixe réservé aux numéros fictifs (+243000XXXXXX). */
export const FICTITIOUS_PHONE_PREFIX = "+243000";

export function isFictitiousPhone(phone: string): boolean {
  const digits = phoneDigitsKey(phone);
  return digits.startsWith("243000");
}

/** Génère un numéro unique du type +243000 + 6 chiffres. */
export async function allocateFictitiousPhone(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const suffix = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const phone = `${FICTITIOUS_PHONE_PREFIX}${suffix}`;

    const existing = await prisma.guest.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!existing) return phone;
  }

  // Fallback ultra-rare : suffixe plus long basé sur le temps
  const fallback = `${FICTITIOUS_PHONE_PREFIX}${Date.now().toString().slice(-6)}`;
  return fallback;
}

export async function registerGuestFictitious(input: {
  guestId: string;
  phone: string;
  name: string;
  genre: string;
  numGuests: number;
}) {
  await prisma.guestFictitious.upsert({
    where: { guestId: input.guestId },
    create: {
      guestId: input.guestId,
      phone: input.phone,
      name: input.name,
      genre: input.genre,
      numGuests: input.numGuests,
    },
    update: {
      phone: input.phone,
      name: input.name,
      genre: input.genre,
      numGuests: input.numGuests,
    },
  });
}

export type AdminFictitiousGuest = {
  id: string;
  guestId: string;
  phone: string;
  name: string;
  genre: string;
  numGuests: number;
  createdAt: string;
  updatedAt: string;
  ceremonyIds: string[];
  token: string;
};

export async function listFictitiousGuests(): Promise<AdminFictitiousGuest[]> {
  const rows = await prisma.guestFictitious.findMany({
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    include: {
      guest: {
        select: {
          token: true,
          guestCeremonies: { select: { ceremonyId: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    guestId: row.guestId,
    phone: row.phone,
    name: row.name,
    genre: row.genre,
    numGuests: row.numGuests,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ceremonyIds: row.guest.guestCeremonies.map((item) => item.ceremonyId),
    token: row.guest.token,
  }));
}

/** Remplace le numéro fictif par un vrai numéro WhatsApp. */
export async function assignRealPhoneToFictitiousGuest(input: {
  guestId: string;
  phone: string;
}): Promise<{ message: string; guest: AdminGuest }> {
  const phone = normalizePhone(input.phone);
  if (phone.length < 8) {
    throw new Error("Numéro de téléphone invalide");
  }
  if (isFictitiousPhone(phone)) {
    throw new Error("Choisissez un numéro réel (pas un numéro fictif)");
  }

  const guest = await prisma.guest.findUnique({
    where: { id: input.guestId },
    select: { id: true, name: true, phoneFictitious: true },
  });
  if (!guest) throw new Error("Invité introuvable");
  if (!guest.phoneFictitious) {
    throw new Error("Cet invité n'a pas de numéro fictif");
  }

  const conflict = await prisma.guest.findFirst({
    where: {
      phone: { in: [phone, phone.slice(1)] },
      NOT: { id: input.guestId },
    },
    select: { id: true, name: true },
  });
  if (conflict) {
    throw new Error(
      `Le numéro est déjà utilisé par « ${conflict.name} »`,
    );
  }

  await prisma.guest.update({
    where: { id: input.guestId },
    data: {
      phone,
      phoneFictitious: false,
    },
  });

  await prisma.guestFictitious.deleteMany({
    where: { guestId: input.guestId },
  });

  const updated = await prisma.guest.findUniqueOrThrow({
    where: { id: input.guestId },
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

  return {
    message: `Numéro réel assigné à « ${updated.name} »`,
    guest: serializeGuest(updated),
  };
}
