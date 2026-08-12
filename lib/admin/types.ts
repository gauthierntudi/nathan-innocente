import type { Guest } from "@prisma/client";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  isGuestType,
  type GuestType,
} from "@/lib/admin/guest-type";

export type AdminGuestCeremonyStatus = {
  ceremonyId: CeremonyId;
  tableId: string | null;
  groupId: string | null;
  groupName: string | null;
  availability: boolean | null;
  confirmedGuests: number;
  numGuests: number;
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
  phoneFictitious: boolean;
  guestType: GuestType;
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

/** Invitation WhatsApp : {{1}} genre, {{2}} nom */
export const INVITE_VARIABLES_MAP: VariablesMap = {
  "1": "genre",
  "2": "nom",
};

/** @deprecated alias — préférer INVITE_VARIABLES_MAP */
export const DEFAULT_VARIABLES_MAP: VariablesMap = INVITE_VARIABLES_MAP;

/** Variables WhatsApp cérémonie : {{1}} genre, {{2}} nom (pas de convives). */
export const CEREMONY_VARIABLES_MAP: VariablesMap = {
  "1": "genre",
  "2": "nom",
};

export function serializeGuest(
  guest: Guest & {
    guestCeremonies?: Array<{
      ceremonyId: string;
      tableId?: string | null;
      groupId?: string | null;
      group?: { name?: string | null } | null;
      availability?: boolean | null;
      confirmedGuests?: number;
      numGuests?: number;
      dressCodeDownloadedAt?: Date | null;
    }>;
  },
): AdminGuest {
  const ceremonyStatuses = (guest.guestCeremonies ?? [])
    .map((assignment) => {
      if (!isCeremonyId(assignment.ceremonyId)) return null;
      return {
        ceremonyId: assignment.ceremonyId,
        tableId: assignment.tableId ?? null,
        groupId: assignment.groupId ?? null,
        groupName: assignment.group?.name?.trim() || null,
        availability: assignment.availability ?? null,
        confirmedGuests: assignment.confirmedGuests ?? 0,
        numGuests: Math.max(
          1,
          assignment.numGuests && assignment.numGuests > 0
            ? assignment.numGuests
            : guest.numGuests,
        ),
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
    phoneFictitious: Boolean(guest.phoneFictitious),
    guestType: isGuestType(guest.guestType) ? guest.guestType : "standard",
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

export function guestHasTableAssignment(guest: AdminGuest) {
  return (guest.ceremonyStatuses ?? []).some((status) => Boolean(status.tableId));
}

/** Statuts RSVP des cérémonies où l'invité a une table. */
export function getTableCeremonyStatuses(guest: AdminGuest) {
  return (guest.ceremonyStatuses ?? []).filter((status) => Boolean(status.tableId));
}

export function hasPendingTableResponse(guest: AdminGuest) {
  const statuses = getTableCeremonyStatuses(guest);
  return statuses.length > 0 && statuses.some((status) => status.availability === null);
}

export function hasConfirmedTableResponse(guest: AdminGuest) {
  return getTableCeremonyStatuses(guest).some((status) => status.availability === true);
}

export function hasDeclinedTableResponse(guest: AdminGuest) {
  return getTableCeremonyStatuses(guest).some((status) => status.availability === false);
}

/** Invitation WhatsApp : table assignée et pas encore envoyée. */
export function canSendInvitation(guest: AdminGuest) {
  return (
    guestHasTableAssignment(guest) &&
    !guest.statusSend &&
    !guest.phoneFictitious
  );
}

/** Rappel : table + invitation envoyée + au moins une cérémonie (table) sans réponse. */
export function canSendReminder(guest: AdminGuest) {
  if (guest.phoneFictitious) return false;
  if (!guestHasTableAssignment(guest)) return false;
  if (!guest.statusSend) return false;
  if (!hasPendingTableResponse(guest)) return false;
  if (guest.deviceId && guest.statusReminderSent) return false;
  return true;
}
