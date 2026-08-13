import ExcelJS from "exceljs";

import { CEREMONY_DEFINITIONS, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  normalizeCeremonyIds,
  parseGuestsCsv,
} from "@/lib/admin/guest-create";
import {
  buildGuestPhoneIndex,
  findGuestInPhoneIndex,
} from "@/lib/admin/guest-phone-lookup";
import { GUEST_TYPE_LABELS, parseGuestType } from "@/lib/admin/guest-type";
import { detectAndParseGuestsWorkbook } from "@/lib/admin/invitation-list-xlsx";
import {
  getGuestCeremonyGuestsTotal,
  type AdminGuest,
} from "@/lib/admin/types";
import { normalizePhone } from "@/lib/phone";

export type FileGuestsMode = "sum" | "max" | "ceremony";
export type DbGuestsMode = "sum" | "global" | "ceremony";

export const FILE_GUESTS_MODE_LABELS: Record<FileGuestsMode, string> = {
  sum: "Somme (fichier)",
  max: "Maximum (fichier)",
  ceremony: "Cérémonie sélectionnée",
};

export const DB_GUESTS_MODE_LABELS: Record<DbGuestsMode, string> = {
  sum: "Somme cérémonies",
  global: "Champ global",
  ceremony: "Cérémonie sélectionnée",
};

export function isFileGuestsMode(value: unknown): value is FileGuestsMode {
  return value === "sum" || value === "max" || value === "ceremony";
}

export function isDbGuestsMode(value: unknown): value is DbGuestsMode {
  return value === "sum" || value === "global" || value === "ceremony";
}

function dbConvivesTotal(
  guest: AdminGuest,
  mode: DbGuestsMode,
  ceremonyId?: CeremonyId | null,
) {
  if (mode === "global") {
    return Math.max(1, guest.numGuests);
  }
  if (mode === "ceremony") {
    if (!ceremonyId) {
      // Sans filtre cérémonie → retomber sur la somme
      const ceremonyTotal = getGuestCeremonyGuestsTotal(guest);
      return ceremonyTotal > 0 ? ceremonyTotal : Math.max(1, guest.numGuests);
    }
    const status = (guest.ceremonyStatuses ?? []).find(
      (item) => item.ceremonyId === ceremonyId,
    );
    if (!status) return 0;
    return Math.max(0, status.numGuests ?? 0);
  }
  // sum
  const ceremonyTotal = getGuestCeremonyGuestsTotal(guest);
  if (ceremonyTotal > 0) return ceremonyTotal;
  return Math.max(1, guest.numGuests);
}

function fileConvivesTotal(
  row: CompareFileRow,
  mode: FileGuestsMode,
  ceremonyId?: CeremonyId | null,
) {
  const seats = row.ceremonySeats ?? {};
  const entries = Object.entries(seats) as Array<[CeremonyId, number]>;

  if (mode === "ceremony" && ceremonyId) {
    if (ceremonyId in seats) return Math.max(0, seats[ceremonyId] ?? 0);
    // Ligne sans détail par cérémonie → valeur de ligne
    return row.numGuests;
  }

  if (entries.length === 0) return row.numGuests;

  const values = entries.map(([, value]) => Math.max(0, value));
  if (mode === "max") return Math.max(1, ...values);
  // sum
  return values.reduce((total, value) => total + value, 0);
}

export type CompareFileColumns = {
  phone: boolean;
  numGuests: boolean;
  guestType: boolean;
  group: boolean;
  ceremonies: boolean;
};

export type CompareFileRow = {
  lineNumber: number;
  name: string;
  phone: string;
  numGuests: number;
  /** Places par cérémonie (listes invitations multi-feuilles) */
  ceremonySeats?: Partial<Record<CeremonyId, number>>;
  guestType: string | undefined;
  groupName: string | undefined;
  ceremonyIds: CeremonyId[];
};

export type CompareFieldDiff = {
  field: string;
  file: string;
  db: string;
};

export type CompareMatchedDiff = {
  lineNumber: number;
  matchBy: "phone+name" | "phone" | "name";
  name: string;
  phone: string;
  numGuests: number;
  dbName: string;
  dbPhone: string;
  dbNumGuests: number;
  diffs: CompareFieldDiff[];
};

export type CompareGuestRef = {
  lineNumber?: number;
  id?: string;
  name: string;
  phone: string;
  numGuests?: number;
  detail?: string;
  dbName?: string;
  dbPhone?: string;
  dbNumGuests?: number;
};

export type GuestCompareReport = {
  summary: {
    fileRows: number;
    dbGuests: number;
    matched: number;
    identical: number;
    differing: number;
    onlyInFile: number;
    onlyInDb: number;
    ambiguous: number;
    phoneNameConflicts: number;
  };
  ceremonyId: CeremonyId | null;
  fileGuestsMode: FileGuestsMode;
  dbGuestsMode: DbGuestsMode;
  columns: CompareFileColumns;
  parseErrors: string[];
  onlyInFile: CompareGuestRef[];
  onlyInDb: CompareGuestRef[];
  differing: CompareMatchedDiff[];
  ambiguous: CompareGuestRef[];
  /** Même téléphone, noms incompatibles */
  phoneNameConflicts: CompareGuestRef[];
};

const CEREMONY_LABEL = Object.fromEntries(
  CEREMONY_DEFINITIONS.map((item) => [item.id, item.name]),
) as Record<CeremonyId, string>;

export function normalizeGuestName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Retire civilités / préfixes fréquents pour comparer l’identité. */
export function coreGuestName(name: string) {
  let value = normalizeGuestName(name);
  const prefixes = [
    "couple",
    "mr et mme",
    "m et mme",
    "me et mme",
    "mr & mme",
    "m & mme",
    "me & mme",
    "mr and mrs",
    "mlle",
    "mme",
    "mrs",
    "miss",
    "mr",
    "me",
    "pr",
    "dr",
    "abbe",
    "honorable",
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of prefixes) {
      if (value === prefix) {
        value = "";
        changed = true;
        break;
      }
      if (value.startsWith(`${prefix} `)) {
        value = value.slice(prefix.length + 1).trim();
        changed = true;
        break;
      }
    }
  }
  return value.replace(/\s+/g, " ").trim();
}

function nameTokens(name: string) {
  return coreGuestName(name)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

/** Vrai si les noms désignent probablement la même personne. */
export function namesAreCompatible(a: string, b: string) {
  const left = coreGuestName(a);
  const right = coreGuestName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const tokensA = new Set(nameTokens(a));
  const tokensB = new Set(nameTokens(b));
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let shared = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) shared += 1;
  }

  const minSize = Math.min(tokensA.size, tokensB.size);
  if (minSize === 1) return shared === 1;
  return shared >= Math.min(2, minSize);
}

function detectCompareColumns(raw: string): CompareFileColumns {
  const firstLine = raw.replace(/^\uFEFF/, "").trim().split(/\r?\n/)[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const headers = firstLine
    .split(delimiter)
    .map((cell) =>
      cell
        .trim()
        .replace(/^"|"$/g, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
    );

  const has = (...aliases: string[]) =>
    aliases.some((alias) => headers.includes(alias));

  return {
    phone: has(
      "phone",
      "telephone",
      "tel",
      "mobile",
      "numero",
      "numero de telephone",
    ),
    numGuests: has(
      "num guests",
      "numguests",
      "num_guests",
      "convives",
      "guests",
      "nombre",
      "nbre",
      "nb",
      "pax",
      "nombre de convives",
      "convives invites",
    ),
    guestType: has(
      "type",
      "guest type",
      "guesttype",
      "guest_type",
      "type invite",
      "type d invite",
      "type dinvites",
      "type d invite",
      "honneur",
    ),
    group: has("group", "groupe", "group name", "group_name", "nom du groupe"),
    ceremonies: has("ceremonies", "ceremony", "ceremonie"),
  };
}

function cellsToCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? "";
          if (/[",\n\r;]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(","),
    )
    .join("\n");
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result != null) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }
  return String(value);
}

export async function parseGuestsCompareFile(input: {
  filename?: string;
  buffer?: Buffer;
  csvText?: string;
  ceremonyId?: CeremonyId | null;
}): Promise<{
  rows: CompareFileRow[];
  columns: CompareFileColumns;
  errors: string[];
}> {
  let csvText = input.csvText?.trim() ?? "";
  const ceremonyId = input.ceremonyId ?? null;

  if (input.buffer && input.buffer.length > 0) {
    const name = (input.filename ?? "").toLowerCase();
    const isExcel =
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      (!name.endsWith(".csv") && input.buffer[0] === 0x50 && input.buffer[1] === 0x4b);

    if (isExcel) {
      const invitationList = await detectAndParseGuestsWorkbook(input.buffer, {
        ceremonyId: ceremonyId ?? undefined,
      });
      if (invitationList && invitationList.rows.length > 0) {
        return {
          rows: invitationList.rows,
          columns: invitationList.columns,
          errors: invitationList.errors,
        };
      }

      const workbook = new ExcelJS.Workbook();
      // exceljs typings expect Node Buffer; runtime accepts Uint8Array
      await workbook.xlsx.load(input.buffer as unknown as ExcelJS.Buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        return {
          rows: [],
          columns: {
            phone: false,
            numGuests: false,
            guestType: false,
            group: false,
            ceremonies: false,
          },
          errors: ["Fichier Excel sans feuille"],
        };
      }

      const matrix: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        matrix.push(values.map((cell) => cellToString(cell as ExcelJS.CellValue)));
      });
      csvText = cellsToCsv(matrix);
    } else {
      csvText = input.buffer.toString("utf8");
    }
  }

  const columns = detectCompareColumns(csvText);
  const parsed = parseGuestsCsv(csvText);
  const lineOffset = parsed.hasHeader ? 2 : 1;

  let rows: CompareFileRow[] = parsed.rows.map((row, index) => ({
    lineNumber: index + lineOffset,
    name: row.name.trim(),
    phone: row.phone?.trim() ?? "",
    numGuests: Number.isFinite(row.numGuests)
      ? Math.max(1, Math.floor(row.numGuests!))
      : 1,
    guestType: row.guestType,
    groupName: row.groupName,
    ceremonyIds: normalizeCeremonyIds(row.ceremonyIds ?? []),
  }));

  if (ceremonyId) {
    rows = rows.filter(
      (row) =>
        row.ceremonyIds.length === 0 || row.ceremonyIds.includes(ceremonyId),
    );
  }

  return {
    rows,
    columns: {
      ...columns,
      ceremonies: ceremonyId ? false : columns.ceremonies,
    },
    errors: parsed.errors,
  };
}

function dbGroupLabel(guest: AdminGuest) {
  const names = [
    ...new Set(
      (guest.ceremonyStatuses ?? [])
        .map((status) => status.groupName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"));
  return names.join(", ");
}

function ceremoniesLabel(ids: CeremonyId[]) {
  return [...ids]
    .sort()
    .map((id) => CEREMONY_LABEL[id] ?? id)
    .join(", ");
}

function sameCeremonySet(a: CeremonyId[], b: CeremonyId[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort().join("|");
  const right = [...b].sort().join("|");
  return left === right;
}

function buildDiffs(
  fileRow: CompareFileRow,
  guest: AdminGuest,
  columns: CompareFileColumns,
  ceremonyId: CeremonyId | null,
  fileGuestsMode: FileGuestsMode,
  dbGuestsMode: DbGuestsMode,
): CompareFieldDiff[] {
  const diffs: CompareFieldDiff[] = [];

  // Toujours comparer le nom (pas seulement le téléphone)
  if (normalizeGuestName(fileRow.name) !== normalizeGuestName(guest.name)) {
    diffs.push({ field: "Nom", file: fileRow.name, db: guest.name });
  }

  {
    const fileGuests = fileConvivesTotal(fileRow, fileGuestsMode, ceremonyId);
    const dbGuests = dbConvivesTotal(guest, dbGuestsMode, ceremonyId);
    if (fileGuests !== dbGuests) {
      diffs.push({
        field: "Convives",
        file: String(fileGuests),
        db: String(dbGuests),
      });
    }
  }

  if (columns.phone) {
    const filePhone = fileRow.phone ? normalizePhone(fileRow.phone) : "";
    const dbPhone = guest.phoneFictitious ? "" : normalizePhone(guest.phone);
    if (filePhone && dbPhone && filePhone !== dbPhone) {
      diffs.push({
        field: "Téléphone",
        file: fileRow.phone || "—",
        db: guest.phoneFictitious ? "(fictif)" : guest.phone || "—",
      });
    } else if (filePhone && guest.phoneFictitious) {
      diffs.push({
        field: "Téléphone",
        file: fileRow.phone,
        db: "(fictif)",
      });
    } else if (!filePhone && dbPhone) {
      diffs.push({
        field: "Téléphone",
        file: "—",
        db: guest.phone,
      });
    }
  }

  if (columns.guestType && fileRow.guestType?.trim()) {
    const fileType = parseGuestType(fileRow.guestType);
    if (fileType !== guest.guestType) {
      diffs.push({
        field: "Type",
        file: GUEST_TYPE_LABELS[fileType],
        db: GUEST_TYPE_LABELS[guest.guestType],
      });
    }
  }

  if (columns.group && fileRow.groupName?.trim()) {
    const fileGroup = fileRow.groupName.trim();
    const dbGroup = dbGroupLabel(guest);
    if (normalizeGuestName(fileGroup) !== normalizeGuestName(dbGroup || "")) {
      diffs.push({
        field: "Groupe",
        file: fileGroup,
        db: dbGroup || "—",
      });
    }
  }

  if (columns.ceremonies && fileRow.ceremonyIds.length > 0) {
    if (!sameCeremonySet(fileRow.ceremonyIds, guest.ceremonyIds)) {
      diffs.push({
        field: "Cérémonies",
        file: ceremoniesLabel(fileRow.ceremonyIds) || "—",
        db: ceremoniesLabel(guest.ceremonyIds) || "—",
      });
    }
  }

  return diffs;
}

function recordMatch(
  row: CompareFileRow,
  guest: AdminGuest,
  matchBy: CompareMatchedDiff["matchBy"],
  columns: CompareFileColumns,
  differing: CompareMatchedDiff[],
  ceremonyId: CeremonyId | null,
  fileGuestsMode: FileGuestsMode,
  dbGuestsMode: DbGuestsMode,
) {
  const diffs = buildDiffs(
    row,
    guest,
    columns,
    ceremonyId,
    fileGuestsMode,
    dbGuestsMode,
  );
  if (diffs.length === 0) return "identical" as const;
  differing.push({
    lineNumber: row.lineNumber,
    matchBy,
    name: row.name,
    phone: row.phone || "—",
    numGuests: fileConvivesTotal(row, fileGuestsMode, ceremonyId),
    dbName: guest.name,
    dbPhone: guest.phoneFictitious ? "(fictif)" : guest.phone,
    dbNumGuests: dbConvivesTotal(guest, dbGuestsMode, ceremonyId),
    diffs,
  });
  return "differing" as const;
}

function findCompatibleByName(row: CompareFileRow, candidates: AdminGuest[]) {
  const exactKey = normalizeGuestName(row.name);
  const exact = candidates.filter(
    (guest) => normalizeGuestName(guest.name) === exactKey,
  );
  if (exact.length === 1) return { guest: exact[0], ambiguous: false as const };
  if (exact.length > 1) return { guest: null, ambiguous: true as const, count: exact.length };

  const soft = candidates.filter((guest) =>
    namesAreCompatible(row.name, guest.name),
  );
  if (soft.length === 1) return { guest: soft[0], ambiguous: false as const };
  if (soft.length > 1) return { guest: null, ambiguous: true as const, count: soft.length };
  return { guest: null, ambiguous: false as const };
}

export function buildGuestCompareReport(
  fileRows: CompareFileRow[],
  dbGuests: AdminGuest[],
  columns: CompareFileColumns,
  parseErrors: string[] = [],
  options?: {
    ceremonyId?: CeremonyId | null;
    fileGuestsMode?: FileGuestsMode;
    dbGuestsMode?: DbGuestsMode;
  },
): GuestCompareReport {
  const ceremonyId = options?.ceremonyId ?? null;
  const fileGuestsMode = options?.fileGuestsMode ?? "sum";
  const dbGuestsMode = options?.dbGuestsMode ?? "sum";

  const scopedFileRows = ceremonyId
    ? fileRows.filter(
        (row) =>
          row.ceremonyIds.length === 0 || row.ceremonyIds.includes(ceremonyId),
      )
    : fileRows;

  const scopedDbGuests = ceremonyId
    ? dbGuests.filter((guest) => guest.ceremonyIds.includes(ceremonyId))
    : dbGuests;

  const remaining = new Map(scopedDbGuests.map((guest) => [guest.id, guest]));
  const phoneIndex = buildGuestPhoneIndex(
    scopedDbGuests.filter((guest) => !guest.phoneFictitious && guest.phone),
  );

  const onlyInFile: CompareGuestRef[] = [];
  const differing: CompareMatchedDiff[] = [];
  const ambiguous: CompareGuestRef[] = [];
  const phoneNameConflicts: CompareGuestRef[] = [];
  let matched = 0;
  let identical = 0;

  const pendingAfterPhone: CompareFileRow[] = [];

  for (const row of scopedFileRows) {
    if (!row.phone.trim()) {
      pendingAfterPhone.push(row);
      continue;
    }

    const hit = findGuestInPhoneIndex(phoneIndex, row.phone);
    if (!hit || !remaining.has(hit.id)) {
      pendingAfterPhone.push(row);
      continue;
    }

    const guest = remaining.get(hit.id)!;
    if (!namesAreCompatible(row.name, guest.name)) {
      phoneNameConflicts.push({
        lineNumber: row.lineNumber,
        id: guest.id,
        name: row.name,
        phone: row.phone,
        numGuests: fileConvivesTotal(row, fileGuestsMode, ceremonyId),
        dbName: guest.name,
        dbPhone: guest.phone,
        dbNumGuests: dbConvivesTotal(guest, dbGuestsMode, ceremonyId),
        detail: "Même téléphone, noms différents",
      });
      pendingAfterPhone.push(row);
      continue;
    }

    remaining.delete(guest.id);
    matched += 1;
    const kind = recordMatch(
      row,
      guest,
      "phone+name",
      columns,
      differing,
      ceremonyId,
      fileGuestsMode,
      dbGuestsMode,
    );
    if (kind === "identical") identical += 1;
  }

  for (const row of pendingAfterPhone) {
    const candidates = [...remaining.values()];
    const found = findCompatibleByName(row, candidates);

    if (found.ambiguous) {
      ambiguous.push({
        lineNumber: row.lineNumber,
        name: row.name,
        phone: row.phone || "—",
        numGuests: fileConvivesTotal(row, fileGuestsMode, ceremonyId),
        detail: `${found.count ?? 0} invités DB avec un nom proche`,
      });
      continue;
    }

    if (!found.guest) {
      const alreadyConflict = phoneNameConflicts.some(
        (item) => item.lineNumber === row.lineNumber,
      );
      if (!alreadyConflict) {
        onlyInFile.push({
          lineNumber: row.lineNumber,
          name: row.name,
          phone: row.phone || "—",
          numGuests: fileConvivesTotal(row, fileGuestsMode, ceremonyId),
        });
      }
      continue;
    }

    remaining.delete(found.guest.id);
    matched += 1;
    const kind = recordMatch(
      row,
      found.guest,
      "name",
      columns,
      differing,
      ceremonyId,
      fileGuestsMode,
      dbGuestsMode,
    );
    if (kind === "identical") identical += 1;
  }

  const onlyInDb: CompareGuestRef[] = [...remaining.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((guest) => ({
      id: guest.id,
      name: guest.name,
      phone: guest.phoneFictitious ? "(fictif)" : guest.phone || "—",
      numGuests: dbConvivesTotal(guest, dbGuestsMode, ceremonyId),
    }));

  return {
    summary: {
      fileRows: scopedFileRows.length,
      dbGuests: scopedDbGuests.length,
      matched,
      identical,
      differing: differing.length,
      onlyInFile: onlyInFile.length,
      onlyInDb: onlyInDb.length,
      ambiguous: ambiguous.length,
      phoneNameConflicts: phoneNameConflicts.length,
    },
    ceremonyId,
    fileGuestsMode,
    dbGuestsMode,
    columns,
    parseErrors,
    onlyInFile,
    onlyInDb,
    differing,
    ambiguous,
    phoneNameConflicts,
  };
}
