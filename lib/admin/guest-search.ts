import { CEREMONY_DEFINITIONS, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  getGuestCeremonyGuestsTotal,
  getGuestRsvpSummary,
  guestMatchesAvailabilityFilter,
  type AdminGuest,
} from "@/lib/admin/types";

/**
 * Préfixes / titres souvent présents dans la recherche ou le libellé,
 * mais absents de l'autre côté (ex. « Couple Kaja… » ↔ « Kaja… »).
 */
const SEARCH_NOISE_TOKENS = new Set([
  "couple",
  "famille",
  "family",
  "me",
  "mr",
  "mme",
  "mlles",
  "mlle",
  "mademoiselle",
  "monsieur",
  "madame",
  "mesdames",
  "messieurs",
  "et",
  "and",
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
]);

/** Tolérance accents / orthographe : « Trésor » ↔ « Tresor », « œ » → « oe », etc. */
export function normalizeSearchText(value: string) {
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

/** Tokens significatifs pour la recherche de noms (sans titres / couple / etc.). */
export function significantSearchTokens(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];

  return normalized
    .split(" ")
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) => !SEARCH_NOISE_TOKENS.has(token));
}

function tokenOverlaps(queryToken: string, haystackToken: string) {
  if (haystackToken === queryToken) return true;
  // Saisie progressive : « Ilun » ↔ « ilunga »
  if (queryToken.length >= 2 && haystackToken.startsWith(queryToken)) {
    return true;
  }
  if (haystackToken.length >= 2 && queryToken.startsWith(haystackToken)) {
    return true;
  }
  // Contenu : « kalonji » dans un token composé rare
  if (queryToken.length >= 3 && haystackToken.includes(queryToken)) {
    return true;
  }
  return false;
}

function everyTokenMatchesSome(
  needles: string[],
  haystackTokens: string[],
) {
  if (needles.length === 0) return false;
  return needles.every((needle) =>
    haystackTokens.some((hay) => tokenOverlaps(needle, hay)),
  );
}

/**
 * Correspondance souple nom ↔ requête :
 * - ignore accents, tirets, ponctuation
 * - ignore « Couple », « Me », « Mme », etc.
 * - ordre des mots libre
 *
 * Ex. « Couple Kaja Ilunga Kevin » ↔ « Kaja Ilunga - Kevin »
 */
export function textMatchesQuery(haystackRaw: string, queryRaw: string) {
  const queryNormalized = normalizeSearchText(queryRaw);
  if (!queryNormalized) return true;

  const haystackNormalized = normalizeSearchText(haystackRaw);
  if (!haystackNormalized) return false;

  if (haystackNormalized.includes(queryNormalized)) return true;
  if (queryNormalized.includes(haystackNormalized) && haystackNormalized.length >= 3) {
    return true;
  }

  const queryTokens = significantSearchTokens(queryRaw);
  const haystackTokens = significantSearchTokens(haystackRaw);

  // Requête trop générique (uniquement « Couple ») → match sur le texte normalisé brut
  if (queryTokens.length === 0) {
    const rawQueryTokens = queryNormalized.split(" ").filter(Boolean);
    return rawQueryTokens.every((token) => haystackNormalized.includes(token));
  }

  if (haystackTokens.length === 0) {
    return queryTokens.every((token) => haystackNormalized.includes(token));
  }

  // Tous les mots utiles de la recherche sont dans le nom
  if (everyTokenMatchesSome(queryTokens, haystackTokens)) return true;

  // La recherche est plus riche que le nom en base : tous les mots du nom
  // apparaissent dans la requête (ex. DB « Kaja Ilunga » + query « Couple Kaja Ilunga Kevin »)
  if (
    queryTokens.length >= haystackTokens.length &&
    everyTokenMatchesSome(haystackTokens, queryTokens)
  ) {
    return true;
  }

  // Chevauchement fort : au moins 2 tokens en commun et ≥ 60 % du plus court
  const matched = haystackTokens.filter((hay) =>
    queryTokens.some((q) => tokenOverlaps(q, hay)),
  ).length;
  const shorter = Math.min(queryTokens.length, haystackTokens.length);
  if (matched >= 2 && matched / shorter >= 0.6) return true;

  return false;
}

/**
 * Recherche nom + téléphone (utilisable hors AdminGuest — ex. candidats table).
 */
export function personMatchesSearch(
  name: string,
  phone: string | null | undefined,
  rawQuery: string,
) {
  const query = rawQuery.trim();
  if (!query) return true;

  const queryDigits = phoneDigits(query);
  if (queryDigits.length >= 3 && phoneDigits(phone ?? "").includes(queryDigits)) {
    return true;
  }

  if (textMatchesQuery(name, query)) return true;
  if (phone && textMatchesQuery(phone, query)) return true;
  return false;
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
  const query = rawQuery.trim();
  if (!query) return true;

  if (personMatchesSearch(guest.name, guest.phone, query)) return true;
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

export function filterAdminGuests(guests: AdminGuest[], filters: GuestListFilters) {
  const ceremonyScope =
    filters.ceremonyId === "all" ? null : filters.ceremonyId;

  return guests.filter((guest) => {
    if (
      filters.availability !== "all" &&
      !guestMatchesAvailabilityFilter(
        guest,
        filters.availability,
        ceremonyScope,
      )
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
