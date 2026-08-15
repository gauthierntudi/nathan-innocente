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
  invitationEnabled: boolean;
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
    invitationEnabled: Boolean(guest.invitationEnabled),
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

    const hasDressCode =
      Boolean(guest.dressCodeDownloadedAt) ||
      (guest.ceremonyStatuses ?? []).some((status) =>
        Boolean(status.dressCodeDownloadedAt),
      );
    if (hasDressCode) stats.dressCodeDownloads += 1;

    const numGuests = Math.max(1, getGuestCeremonyGuestsTotal(guest) || guest.numGuests);
    stats.convivesTotal += numGuests;
    if (numGuests > 1) stats.couplesTotal += 1;
    else stats.singlesTotal += 1;

    const key = getAvailabilityKey(guest);
    if (key === "pending") {
      stats.confirmationsPending += 1;
    } else {
      stats.confirmationsTotal += 1;
      if (key === "yes") stats.availabilityYes += 1;
      else stats.availabilityNo += 1;
    }
  }

  return stats;
}

/**
 * RSVP affiché côté admin Invités : dérivé des cérémonies (comme Invitations),
 * pas uniquement du champ agrégé guest.availability.
 * - oui si au moins une cérémonie est acceptée
 * - non si toutes les cérémonies sont déclinées
 * - en attente sinon
 */
export function getGuestRsvpSummary(guest: AdminGuest) {
  const statuses = guest.ceremonyStatuses ?? [];

  if (statuses.length === 0) {
    if (guest.availability === null) {
      return {
        key: "pending" as const,
        yes: 0,
        no: 0,
        pending: 1,
        confirmedGuests: 0,
      };
    }
    if (guest.availability) {
      return {
        key: "yes" as const,
        yes: 1,
        no: 0,
        pending: 0,
        confirmedGuests: guest.confirmedGuests,
      };
    }
    return {
      key: "no" as const,
      yes: 0,
      no: 1,
      pending: 0,
      confirmedGuests: 0,
    };
  }

  const yesStatuses = statuses.filter((status) => status.availability === true);
  const noStatuses = statuses.filter((status) => status.availability === false);
  const pendingStatuses = statuses.filter(
    (status) => status.availability === null,
  );
  const confirmedGuests = yesStatuses.reduce(
    (sum, status) => sum + Math.max(0, status.confirmedGuests ?? 0),
    0,
  );

  if (yesStatuses.length > 0) {
    return {
      key: "yes" as const,
      yes: yesStatuses.length,
      no: noStatuses.length,
      pending: pendingStatuses.length,
      confirmedGuests,
    };
  }

  if (pendingStatuses.length > 0) {
    return {
      key: "pending" as const,
      yes: 0,
      no: noStatuses.length,
      pending: pendingStatuses.length,
      confirmedGuests: 0,
    };
  }

  return {
    key: "no" as const,
    yes: 0,
    no: noStatuses.length,
    pending: 0,
    confirmedGuests: 0,
  };
}

export function getAvailabilityKey(guest: AdminGuest) {
  return getGuestRsvpSummary(guest).key;
}

/** Somme des convives sur toutes les cérémonies de l'invité. */
export function getGuestCeremonyGuestsTotal(guest: AdminGuest) {
  const statuses = guest.ceremonyStatuses ?? [];
  if (statuses.length === 0) return Math.max(0, guest.numGuests ?? 0);
  return statuses.reduce(
    (total, status) => total + Math.max(0, status.numGuests ?? 0),
    0,
  );
}

export function guestHasTableAssignment(guest: AdminGuest) {
  return (guest.ceremonyStatuses ?? []).some((status) => Boolean(status.tableId));
}

/** Statuts RSVP des cérémonies où l'invité a une table. */
export function getTableCeremonyStatuses(guest: AdminGuest) {
  return (guest.ceremonyStatuses ?? []).filter((status) => Boolean(status.tableId));
}

/**
 * Cérémonies du parcours invitation (aligné invité) :
 * tables si présentes, sinon toutes les cérémonies assignées.
 */
export function getInvitationCeremonyStatuses(guest: AdminGuest) {
  if (!guest.invitationEnabled) return [];
  const statuses = guest.ceremonyStatuses ?? [];
  const withTable = statuses.filter((status) => Boolean(status.tableId));
  return withTable.length > 0 ? withTable : statuses;
}

export function hasPendingTableResponse(guest: AdminGuest) {
  const statuses = getTableCeremonyStatuses(guest);
  return statuses.length > 0 && statuses.some((status) => status.availability === null);
}

export function hasPendingInvitationResponse(guest: AdminGuest) {
  const statuses = getInvitationCeremonyStatuses(guest);
  return statuses.length > 0 && statuses.some((status) => status.availability === null);
}

export function hasConfirmedTableResponse(guest: AdminGuest) {
  return getTableCeremonyStatuses(guest).some((status) => status.availability === true);
}

export function hasDeclinedTableResponse(guest: AdminGuest) {
  return getTableCeremonyStatuses(guest).some((status) => status.availability === false);
}

/** Invitation WhatsApp : invitation activée et pas encore envoyée. */
export function canSendInvitation(guest: AdminGuest) {
  return (
    Boolean(guest.invitationEnabled) &&
    !guest.statusSend &&
    !guest.phoneFictitious
  );
}

/** Rappel : invitation activée + envoyée + au moins une cérémonie sans réponse. */
export function canSendReminder(guest: AdminGuest) {
  if (guest.phoneFictitious) return false;
  if (!guest.invitationEnabled) return false;
  if (!guest.statusSend) return false;
  if (!hasPendingInvitationResponse(guest)) return false;
  if (guest.deviceId && guest.statusReminderSent) return false;
  return true;
}
