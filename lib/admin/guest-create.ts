import { randomBytes } from "node:crypto";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { resolveNumGuestsForGuestName } from "@/lib/admin/guest-couple";
import { parseGuestType, type GuestType } from "@/lib/admin/guest-type";
import { normalizePhone } from "@/lib/phone";

export type GuestCreateInput = {
  name: string;
  phone: string;
  numGuests?: number;
  genre?: string;
  ceremonyIds?: string[];
  guestType?: string;
  groupName?: string;
};

export type GuestCreateValidated = {
  name: string;
  phone: string;
  numGuests: number;
  genre: string;
  token: string;
  ceremonyIds: CeremonyId[];
  guestType: GuestType;
  groupName: string | null;
  /** true si aucun numéro fourni → génération d’un numéro fictif à l’enregistrement */
  phoneFictitious: boolean;
};

export function createGuestToken() {
  return randomBytes(16).toString("hex");
}

/** Civilité déduite du nombre de convives (import CSV sans colonne genre). */
export function inferGenreFromNumGuests(numGuests: number): string {
  return numGuests > 1 ? "Cher(e)(s)" : "Cher(e)";
}

export function normalizeCeremonyIds(value: unknown): CeremonyId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is CeremonyId => typeof item === "string" && isCeremonyId(item)))];
}

export function parseCeremonyIdsFromCsvCell(value: string | undefined): CeremonyId[] {
  if (!value?.trim()) return [];
  return normalizeCeremonyIds(
    value
      .split(/[|,/]+/)
      .map((part) => part.trim().toLowerCase()),
  );
}

export function validateGuestCreateInput(
  input: GuestCreateInput,
): { ok: true; data: GuestCreateValidated } | { ok: false; message: string } {
  const name = input.name?.trim() ?? "";
  const phoneRaw = input.phone?.trim() ?? "";
  const numGuests = Number(input.numGuests ?? 1);
  const ceremonyIds = normalizeCeremonyIds(input.ceremonyIds ?? []);
  const groupName =
    typeof input.groupName === "string" && input.groupName.trim().length > 0
      ? input.groupName.trim()
      : null;

  if (!name) {
    return { ok: false, message: "Le nom est requis" };
  }

  if (!Number.isFinite(numGuests) || numGuests < 1 || numGuests > 50) {
    return { ok: false, message: "Le nombre de convives doit être entre 1 et 50" };
  }

  const flooredGuests = resolveNumGuestsForGuestName(name, Math.floor(numGuests));
  const genre = input.genre?.trim() || inferGenreFromNumGuests(flooredGuests);
  const guestType = parseGuestType(input.guestType);

  if (!phoneRaw) {
    return {
      ok: true,
      data: {
        name,
        phone: "",
        numGuests: flooredGuests,
        genre,
        token: createGuestToken(),
        ceremonyIds,
        guestType,
        groupName,
        phoneFictitious: true,
      },
    };
  }

  const phone = normalizePhone(phoneRaw);
  if (phone.length < 8) {
    return { ok: false, message: "Numéro de téléphone invalide" };
  }

  return {
    ok: true,
    data: {
      name,
      phone,
      numGuests: flooredGuests,
      genre,
      token: createGuestToken(),
      ceremonyIds,
      guestType,
      groupName,
      phoneFictitious: false,
    },
  };
}

/** CSV : name, num_guests, phone optionnel (+ ceremonies, type, group). */
export function parseGuestsCsv(raw: string): {
  rows: GuestCreateInput[];
  errors: string[];
  hasHeader: boolean;
} {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { rows: [], errors: ["Fichier CSV vide"], hasHeader: false };
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { rows: [], errors: ["Fichier CSV vide"], hasHeader: false };
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headerCells = splitCsvLine(lines[0], delimiter).map((cell) =>
    normalizeCsvHeader(cell),
  );

  const nameIdx = findHeaderIndex(headerCells, ["name", "nom"]);
  const phoneIdx = findHeaderIndex(headerCells, [
    "phone",
    "telephone",
    "tel",
    "mobile",
    "numero",
    "numero de telephone",
  ]);
  const guestsIdx = findHeaderIndex(headerCells, [
    "num_guests",
    "numguests",
    "num guests",
    "convives",
    "guests",
    "nombre",
    "nbre",
    "nb",
    "pax",
    "nombre de convives",
  ]);
  const ceremoniesIdx = findHeaderIndex(headerCells, [
    "ceremonies",
    "ceremony",
    "ceremonie",
    "ceremonies",
  ]);
  const typeIdx = findHeaderIndex(headerCells, [
    "type",
    "guest_type",
    "guesttype",
    "guest type",
    "type_invite",
    "type invite",
    "type d invite",
    "type dinvites",
    "type d invite",
    "honneur",
    "guest type",
  ]);
  const groupIdx = findHeaderIndex(headerCells, [
    "group",
    "groupe",
    "group_name",
    "group name",
    "nom du groupe",
  ]);

  // Header si on reconnaît au moins le nom + une autre colonne connue
  const hasHeader =
    nameIdx >= 0 &&
    (guestsIdx >= 0 || phoneIdx >= 0 || typeIdx >= 0 || groupIdx >= 0);
  const startIndex = hasHeader ? 1 : 0;
  const resolvedNameIdx = hasHeader ? nameIdx : 0;
  const resolvedGuestsIdx = hasHeader ? guestsIdx : 1;
  const resolvedPhoneIdx = hasHeader
    ? phoneIdx
    : lines[0].split(delimiter).length >= 3
      ? 2
      : -1;
  const resolvedCeremoniesIdx = hasHeader ? ceremoniesIdx : -1;
  const resolvedTypeIdx = hasHeader ? typeIdx : -1;
  const resolvedGroupIdx = hasHeader ? groupIdx : -1;

  if (!hasHeader && lines[0].split(delimiter).length < 2) {
    return {
      rows: [],
      errors: ["En-têtes attendus : name, num_guests, phone (optionnel), type (optionnel)"],
      hasHeader: false,
    };
  }

  const rows: GuestCreateInput[] = [];
  const errors: string[] = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter);
    const name = cells[resolvedNameIdx]?.trim() ?? "";
    const phone =
      resolvedPhoneIdx >= 0 ? cells[resolvedPhoneIdx]?.trim() ?? "" : "";
    const numGuestsRaw =
      resolvedGuestsIdx >= 0 ? cells[resolvedGuestsIdx]?.trim() : "1";
    const ceremoniesRaw =
      resolvedCeremoniesIdx >= 0 ? cells[resolvedCeremoniesIdx]?.trim() : undefined;
    const typeRaw =
      resolvedTypeIdx >= 0 ? cells[resolvedTypeIdx]?.trim() : undefined;
    const groupRaw =
      resolvedGroupIdx >= 0 ? cells[resolvedGroupIdx]?.trim() : undefined;

    if (!name) continue;
    // Ignore accidental re-import of header-like rows
    if (normalizeCsvHeader(name) === "name" || normalizeCsvHeader(name) === "nom") {
      continue;
    }

    const numGuests = parseNumGuestsCell(numGuestsRaw);
    rows.push({
      name,
      phone: sanitizePhoneCell(phone),
      numGuests,
      ceremonyIds: parseCeremonyIdsFromCsvCell(ceremoniesRaw),
      guestType: typeRaw,
      groupName: groupRaw,
    });
  }

  if (rows.length === 0) {
    errors.push("Aucune ligne invité valide trouvée dans le CSV");
  }

  return { rows, errors, hasHeader };
}

function normalizeCsvHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseNumGuestsCell(raw: string | undefined) {
  if (!raw?.trim()) return 1;
  const normalized = raw.trim().replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Nettoie les artefacts Excel (espaces, notation scientifique). */
function sanitizePhoneCell(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // 2.4397E+11 → digits
  if (/e\+/i.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return String(Math.round(asNumber));
    }
  }
  return trimmed.replace(/\s+/g, "");
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeCsvHeader(alias));
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function splitCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}
