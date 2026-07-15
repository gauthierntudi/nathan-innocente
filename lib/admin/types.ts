import type { Guest } from "@prisma/client";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";

export type AdminGuestCeremonyStatus = {
  ceremonyId: CeremonyId;
  availability: boolean | null;
  confirmedGuests: number;
  dressCodeDownloadedAt: string | null;
};

export type AdminGuest = {
  id: string;
  phone: string;
  name: string;
  genre: string;
  token: string;
  deviceId: string | null;
  status: string;
  statusSend: boolean;
  statusReminderSent: boolean;
  availability: boolean | null;
  confirmedGuests: number;
  numGuests: number;
  dressCodeDownloadedAt: string | null;
  ceremonyIds: CeremonyId[];
  ceremonyStatuses: AdminGuestCeremonyStatus[];
};

export type AdminStats = {
  messagesSent: number;
  confirmationsTotal: number;
  availabilityYes: number;
  availabilityNo: number;
  confirmationsPending: number;
  convivesTotal: number;
  couplesTotal: number;
  singlesTotal: number;
  dressCodeDownloads: number;
};

export type VariablesMap = Record<string, string>;

export const DEFAULT_VARIABLES_MAP: VariablesMap = {
  "1": "genre",
  "2": "nom",
  "3": "convives",
};

/** Variables WhatsApp cérémonie : {{1}} genre, {{2}} nom (pas de convives). */
export const CEREMONY_VARIABLES_MAP: VariablesMap = {
  "1": "genre",
  "2": "nom",
};

export function serializeGuest(
  guest: Guest & {
    guestCeremonies?: Array<{
      ceremonyId: string;
      availability?: boolean | null;
      confirmedGuests?: number;
      dressCodeDownloadedAt?: Date | null;
    }>;
  },
): AdminGuest {
  const ceremonyStatuses = (guest.guestCeremonies ?? [])
    .map((assignment) => {
      if (!isCeremonyId(assignment.ceremonyId)) return null;
      return {
        ceremonyId: assignment.ceremonyId,
        availability: assignment.availability ?? null,
        confirmedGuests: assignment.confirmedGuests ?? 0,
        dressCodeDownloadedAt:
          assignment.dressCodeDownloadedAt?.toISOString() ?? null,
      };
    })
    .filter((item): item is AdminGuestCeremonyStatus => item !== null);

  return {
    id: guest.id,
    phone: guest.phone,
    name: guest.name,
    genre: guest.genre,
    token: guest.token,
    deviceId: guest.deviceId,
    status: guest.status,
    statusSend: guest.statusSend,
    statusReminderSent: guest.statusReminderSent,
    availability: guest.availability,
    confirmedGuests: guest.confirmedGuests,
    numGuests: guest.numGuests,
    dressCodeDownloadedAt: guest.dressCodeDownloadedAt?.toISOString() ?? null,
    ceremonyIds: ceremonyStatuses.map((item) => item.ceremonyId),
    ceremonyStatuses,
  };
}

export function computeStats(guests: AdminGuest[]): AdminStats {
  const stats: AdminStats = {
    messagesSent: 0,
    confirmationsTotal: 0,
    availabilityYes: 0,
    availabilityNo: 0,
    confirmationsPending: 0,
    convivesTotal: 0,
    couplesTotal: 0,
    singlesTotal: 0,
    dressCodeDownloads: 0,
  };

  for (const guest of guests) {
    if (guest.statusSend) stats.messagesSent += 1;
    if (guest.dressCodeDownloadedAt) stats.dressCodeDownloads += 1;

    const numGuests = Math.max(1, guest.numGuests);
    stats.convivesTotal += numGuests;
    if (numGuests > 1) stats.couplesTotal += 1;
    else stats.singlesTotal += 1;

    if (guest.availability === null) {
      stats.confirmationsPending += 1;
    } else {
      stats.confirmationsTotal += 1;
      if (guest.availability) stats.availabilityYes += 1;
      else stats.availabilityNo += 1;
    }
  }

  return stats;
}

export function getAvailabilityKey(guest: AdminGuest) {
  if (guest.availability === null) return "pending";
  return guest.availability ? "yes" : "no";
}

export function canSendReminder(guest: AdminGuest) {
  const hasResponded = guest.availability !== null;
  if (hasResponded) return false;
  if (guest.deviceId && guest.statusReminderSent) return false;
  return true;
}
