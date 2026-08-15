import { CEREMONY_DEFINITIONS, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  getAvailabilityKey,
  getGuestCeremonyGuestsTotal,
  getGuestRsvpSummary,
  type AdminGuest,
} from "@/lib/admin/types";

/** Tolérance accents / orthographe : « Trésor » ↔ « Tresor », « œ » → « oe », etc. */
function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .replace(/ø/gi, "o")
    .replace(/ð/gi, "d")
    .replace(/þ/gi, "th")
    .replace(/ł/gi, "l")
    .replace(/ß/gi, "ss")
    .toLowerCase()
    .replace(/[''`´’ʼ]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function textMatchesQuery(haystackRaw: string, queryNormalized: string) {
  if (!queryNormalized) return true;
  const haystack = normalizeSearchText(haystackRaw);
  if (!haystack) return false;
  if (haystack.includes(queryNormalized)) return true;

  // Tous les mots de la requête doivent apparaître (ordre libre)
  const tokens = queryNormalized.split(" ").filter(Boolean);
  if (tokens.length <= 1) return false;
  return tokens.every((token) => haystack.includes(token));
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
  if (queryDigits && phoneDigits(guest.phone ?? "").includes(queryDigits)) {
    return true;
  }

  if (textMatchesQuery(guest.name, query)) return true;
  if (textMatchesQuery(guest.phone ?? "", query)) return true;
  if (guest.token && textMatchesQuery(guest.token, query)) return true;

  for (const status of guest.ceremonyStatuses ?? []) {
    if (status.groupName && textMatchesQuery(status.groupName, query)) {
      return true;
    }
  }

  for (const ceremonyId of guest.ceremonyIds) {
    const label = CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyId)?.name;
    if (label && textMatchesQuery(label, query)) return true;
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

function ceremonyAvailabilityKey(
  guest: AdminGuest,
  ceremonyId: CeremonyId,
): "yes" | "no" | "pending" {
  const status = (guest.ceremonyStatuses ?? []).find(
    (item) => item.ceremonyId === ceremonyId,
  );
  if (!status || status.availability === null) return "pending";
  return status.availability ? "yes" : "no";
}

export function filterAdminGuests(guests: AdminGuest[], filters: GuestListFilters) {
  const ceremonyScope =
    filters.ceremonyId === "all" ? null : filters.ceremonyId;

  return guests.filter((guest) => {
    if (filters.availability !== "all") {
      const key = ceremonyScope
        ? ceremonyAvailabilityKey(guest, ceremonyScope)
        : getAvailabilityKey(guest);
      if (key !== filters.availability) return false;
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
    if (
      filters.message === "dress_code" &&
      !guest.dressCodeDownloadedAt &&
      !(guest.ceremonyStatuses ?? []).some((status) =>
        Boolean(status.dressCodeDownloadedAt),
      )
    ) {
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

export { getGuestRsvpSummary };
