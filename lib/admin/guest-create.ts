import { randomBytes } from "node:crypto";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { normalizePhone } from "@/lib/phone";

export type GuestCreateInput = {
  name: string;
  phone: string;
  numGuests?: number;
  genre?: string;
  ceremonyIds?: string[];
};

export type GuestCreateValidated = {
  name: string;
  phone: string;
  numGuests: number;
  genre: string;
  token: string;
  ceremonyIds: CeremonyId[];
};

export function createGuestToken() {
  return randomBytes(16).toString("hex");
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
  const genre = input.genre?.trim() || "Cher(e)";
  const numGuests = Number(input.numGuests ?? 1);
  const ceremonyIds = normalizeCeremonyIds(input.ceremonyIds ?? []);

  if (!name) {
    return { ok: false, message: "Le nom est requis" };
  }

  if (!phoneRaw) {
    return { ok: false, message: "Le numéro est requis" };
  }

  if (!Number.isFinite(numGuests) || numGuests < 1 || numGuests > 50) {
    return { ok: false, message: "Le nombre de convives doit être entre 1 et 50" };
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
      numGuests: Math.floor(numGuests),
      genre,
      token: createGuestToken(),
      ceremonyIds,
    },
  };
}

/** Minimal CSV parser for name,phone,num_guests,genre */
export function parseGuestsCsv(raw: string): {
  rows: GuestCreateInput[];
  errors: string[];
} {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { rows: [], errors: ["Fichier CSV vide"] };
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { rows: [], errors: ["Fichier CSV vide"] };
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headerCells = splitCsvLine(lines[0], delimiter).map((cell) =>
    cell.trim().toLowerCase(),
  );

  const nameIdx = findHeaderIndex(headerCells, ["name", "nom"]);
  const phoneIdx = findHeaderIndex(headerCells, ["phone", "telephone", "téléphone", "tel", "mobile"]);
  const guestsIdx = findHeaderIndex(headerCells, [
    "num_guests",
    "numguests",
    "convives",
    "guests",
  ]);
  const genreIdx = findHeaderIndex(headerCells, ["genre", "civilite", "civilité"]);
  const ceremoniesIdx = findHeaderIndex(headerCells, [
    "ceremonies",
    "ceremony",
    "ceremonie",
    "cérémonies",
  ]);

  const hasHeader = nameIdx >= 0 && phoneIdx >= 0;
  const startIndex = hasHeader ? 1 : 0;
  const resolvedNameIdx = hasHeader ? nameIdx : 0;
  const resolvedPhoneIdx = hasHeader ? phoneIdx : 1;
  const resolvedGuestsIdx = hasHeader ? guestsIdx : 2;
  const resolvedGenreIdx = hasHeader ? genreIdx : 3;
  const resolvedCeremoniesIdx = hasHeader ? ceremoniesIdx : 4;

  if (!hasHeader && lines[0].split(delimiter).length < 2) {
    return {
      rows: [],
      errors: [
        "En-têtes attendus : name,phone,num_guests,genre,ceremonies",
      ],
    };
  }

  const rows: GuestCreateInput[] = [];
  const errors: string[] = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter);
    const name = cells[resolvedNameIdx]?.trim() ?? "";
    const phone = cells[resolvedPhoneIdx]?.trim() ?? "";
    const numGuestsRaw = resolvedGuestsIdx >= 0 ? cells[resolvedGuestsIdx]?.trim() : "1";
    const genre = resolvedGenreIdx >= 0 ? cells[resolvedGenreIdx]?.trim() : undefined;
    const ceremoniesRaw =
      resolvedCeremoniesIdx >= 0 ? cells[resolvedCeremoniesIdx]?.trim() : undefined;

    if (!name && !phone) continue;

    const numGuests = numGuestsRaw ? Number(numGuestsRaw) : 1;
    rows.push({
      name,
      phone,
      numGuests,
      genre,
      ceremonyIds: parseCeremonyIdsFromCsvCell(ceremoniesRaw),
    });
  }

  if (rows.length === 0) {
    errors.push("Aucune ligne invité valide trouvée dans le CSV");
  }

  return { rows, errors };
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
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
