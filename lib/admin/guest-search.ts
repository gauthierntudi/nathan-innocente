import { CEREMONY_DEFINITIONS, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  getGuestCeremonyGuestsTotal,
  type AdminGuest,
} from "@/lib/admin/types";

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function getGuestConvivesCount(
  guest: AdminGuest,
  ceremonyId?: CeremonyId | null,
) {
  if (ceremonyId) {
    const status = (guest.ceremonyStatuses ?? []).find(
      (item) => item.ceremonyId === ceremonyId,
    );
    return status ? Math.max(0, status.numGuests ?? 0) : 0;
  }
  return getGuestCeremonyGuestsTotal(guest);
}

export function guestMatchesSearch(guest: AdminGuest, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return true;

  const queryDigits = phoneDigits(rawQuery);

  if (normalizeSearchText(guest.name).includes(query)) return true;

  const phone = guest.phone ?? "";
  if (normalizeSearchText(phone).includes(query)) return true;
  if (queryDigits && phoneDigits(phone).includes(queryDigits)) return true;

  if (guest.token && normalizeSearchText(guest.token).includes(query)) {
    return true;
  }

  for (const status of guest.ceremonyStatuses ?? []) {
    if (
      status.groupName &&
      normalizeSearchText(status.groupName).includes(query)
    ) {
      return true;
    }
  }

  for (const ceremonyId of guest.ceremonyIds) {
    const label = CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyId)?.name;
    if (label && normalizeSearchText(label).includes(query)) return true;
  }

  return false;
}

export type GuestListFilters = {
  search: string;
  availability: "all" | "yes" | "no" | "pending";
  guestType: "all" | "honor" | "standard";
  ceremonyId: "all" | CeremonyId;
  message:
    | "all"
    | "invite_sent"
    | "invite_pending"
    | "reminder_sent"
    | "dress_code";
  device: "all" | "linked" | "none";
  phone: "all" | "real" | "fictitious";
  convives: "all" | number;
};

export function filterAdminGuests(guests: AdminGuest[], filters: GuestListFilters) {
  const ceremonyScope =
    filters.ceremonyId === "all" ? null : filters.ceremonyId;

  return guests.filter((guest) => {
    if (
      filters.availability !== "all" &&
      getAvailabilityKey(guest) !== filters.availability
    ) {
      return false;
    }

    if (filters.guestType !== "all" && guest.guestType !== filters.guestType) {
      return false;
    }

    if (
      ceremonyScope &&
      !guest.ceremonyIds.includes(ceremonyScope)
    ) {
      return false;
    }

    if (filters.message === "invite_sent" && !guest.statusSend) return false;
    if (filters.message === "invite_pending" && guest.statusSend) return false;
    if (filters.message === "reminder_sent" && !guest.statusReminderSent) {
      return false;
    }
    if (filters.message === "dress_code" && !guest.dressCodeDownloadedAt) {
      return false;
    }

    if (filters.device === "linked" && !guest.deviceId) return false;
    if (filters.device === "none" && guest.deviceId) return false;

    if (filters.phone === "fictitious" && !guest.phoneFictitious) return false;
    if (filters.phone === "real" && guest.phoneFictitious) return false;

    if (
      filters.convives !== "all" &&
      getGuestConvivesCount(guest, ceremonyScope) !== filters.convives
    ) {
      return false;
    }

    if (!guestMatchesSearch(guest, filters.search)) return false;

    return true;
  });
}

function getAvailabilityKey(guest: AdminGuest) {
  if (guest.availability === null) return "pending";
  return guest.availability ? "yes" : "no";
}
