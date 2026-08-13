import ExcelJS from "exceljs";

import type { CeremonyId } from "@/lib/admin/ceremony-types";
import type {
  CompareFileColumns,
  CompareFileRow,
} from "@/lib/admin/guest-compare";
import { normalizePhone } from "@/lib/phone";

type SheetCell = string;

type GuestBlock = {
  nameCol: number;
  guestsCol: number;
  phoneCol: number;
  headerRow: number;
  groupHint: string | null;
};

type ExtractedGuest = {
  name: string;
  phone: string;
  numGuests: number;
  guestType: "standard" | "honor";
  groupName: string | null;
  ceremonyIds: CeremonyId[];
  sheet: string;
  lineNumber: number;
};

const SKIP_NAME_TOKENS = new Set([
  "nom",
  "noms",
  "nbre",
  "nb",
  "tot",
  "gt",
  "famille m",
  "famille k",
  "sam",
  "mb",
]);

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result != null) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
}

function normalizeGuestName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isNameHeader(value: string) {
  const n = normalizeHeader(value);
  return n === "nom" || n === "noms" || n.startsWith("nom ");
}

function isGuestsHeader(value: string) {
  const n = normalizeHeader(value);
  return (
    n.includes("personne") ||
    n === "nbre" ||
    n === "nb" ||
    n === "pax" ||
    n === "convives" ||
    n.includes("personnes")
  );
}

function isPhoneHeader(value: string) {
  const n = normalizeHeader(value);
  return (
    n.includes("telephone") ||
    n.includes("whatsapp") ||
    n === "numero" ||
    n.includes("numero")
  );
}

function sheetCeremony(sheetName: string): CeremonyId | "honor" | null {
  const n = normalizeHeader(sheetName);
  if (n.includes("honneur") || n.includes("honor")) return "honor";
  if (n.includes("coutumier")) return "coutumier";
  if (n.includes("civil")) return "civile";
  if (n.includes("religieux") || n.includes("religieu")) return "religieux";
  return null;
}

function sheetSideGroup(sheetName: string): string | null {
  const n = normalizeHeader(sheetName);
  if (n.includes("mbemba")) return "Mbemba";
  if (n.includes("samuna")) return "Samuna";
  return null;
}

function parseNumGuests(raw: string) {
  if (!raw.trim()) return 1;
  const value = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(50, Math.floor(value));
}

function sanitizePhone(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/e\+/i.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return String(Math.round(asNumber));
    }
  }
  // Excel sometimes stores local numbers like 0898665626
  return trimmed.replace(/\s+/g, "");
}

function looksLikePersonName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const n = normalizeHeader(trimmed);
  if (!n) return false;
  if (SKIP_NAME_TOKENS.has(n)) return false;
  if (isNameHeader(trimmed) || isGuestsHeader(trimmed) || isPhoneHeader(trimmed)) {
    return false;
  }
  if (
    n.startsWith("liste ") ||
    n === "amis famille" ||
    n.startsWith("famille tuluka") ||
    n.startsWith("famille samuna") ||
    n.startsWith("amis nathan") ||
    n.startsWith("amis arnaud") ||
    n === "coutumier" ||
    n === "civil religieux" ||
    n.includes("carton") ||
    n.includes("liste invite")
  ) {
    return false;
  }
  // totals / codes
  if (/^(tot\.?|gt|mb|sam|s|t|n|m|k|i)$/i.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return /[A-Za-zÀ-ÿ]/.test(trimmed);
}

function matrixFromSheet(sheet: ExcelJS.Worksheet): SheetCell[][] {
  const matrix: SheetCell[][] = [];
  const rowCount = sheet.rowCount || 0;
  const colCount = sheet.columnCount || 0;

  for (let r = 1; r <= rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: SheetCell[] = [];
    for (let c = 1; c <= colCount; c += 1) {
      cells.push(cellToString(row.getCell(c).value));
    }
    // trim trailing empties
    while (cells.length > 0 && !cells[cells.length - 1]) cells.pop();
    matrix.push(cells);
  }
  return matrix;
}

function findBlocks(matrix: SheetCell[][]): GuestBlock[] {
  const blocks: GuestBlock[] = [];
  const maxScanRows = Math.min(8, matrix.length);

  for (let r = 0; r < maxScanRows; r += 1) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      if (!isNameHeader(row[c] ?? "")) continue;
      // Look ahead same row for guests + phone
      let guestsCol = -1;
      let phoneCol = -1;
      for (let k = c + 1; k <= Math.min(c + 4, row.length - 1); k += 1) {
        const cell = row[k] ?? "";
        if (guestsCol < 0 && isGuestsHeader(cell)) guestsCol = k;
        else if (phoneCol < 0 && isPhoneHeader(cell)) phoneCol = k;
      }
      // Some sheets put headers split across nearby columns without exact labels
      if (guestsCol < 0 && c + 1 < row.length) {
        const maybe = row[c + 1] ?? "";
        if (!maybe || isGuestsHeader(maybe) || /^#/.test(maybe)) guestsCol = c + 1;
      }
      if (phoneCol < 0 && guestsCol >= 0 && guestsCol + 1 < row.length) {
        phoneCol = guestsCol + 1;
      }
      if (guestsCol < 0 || phoneCol < 0) continue;

      // Avoid duplicate blocks on same nameCol
      if (blocks.some((b) => b.nameCol === c && Math.abs(b.headerRow - r) <= 1)) {
        continue;
      }

      let groupHint: string | null = null;
      // title row above header
      if (r > 0) {
        const above = (matrix[r - 1]?.[c] ?? "").trim();
        if (above && !isNameHeader(above) && looksLikeSectionTitle(above)) {
          groupHint = above;
        }
      }
      // single-letter codes M/K/I on row 1
      if (!groupHint && r > 0) {
        const code = (matrix[0]?.[c] ?? "").trim();
        if (/^[MKI]$/i.test(code)) {
          groupHint =
            code.toUpperCase() === "M"
              ? "Famille M"
              : code.toUpperCase() === "K"
                ? "Famille K"
                : "Amis Inno & Cie";
        }
      }

      blocks.push({ nameCol: c, guestsCol, phoneCol, headerRow: r, groupHint });
    }
  }

  return blocks.sort((a, b) => a.nameCol - b.nameCol);
}

function looksLikeSectionTitle(value: string) {
  const n = normalizeHeader(value);
  return (
    n.startsWith("liste ") ||
    n.startsWith("famille ") ||
    n.startsWith("amis ") ||
    n.includes("invite")
  );
}

function extractFromBlocks(
  matrix: SheetCell[][],
  blocks: GuestBlock[],
  sheetName: string,
  ceremony: CeremonyId | null,
  honor: boolean,
  sideGroup: string | null,
): ExtractedGuest[] {
  const guests: ExtractedGuest[] = [];
  if (blocks.length === 0) return guests;

  const startRow = Math.min(...blocks.map((b) => b.headerRow)) + 1;

  for (let r = startRow; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    for (const block of blocks) {
      const name = (row[block.nameCol] ?? "").trim();
      if (!looksLikePersonName(name)) continue;

      const numGuests = parseNumGuests(row[block.guestsCol] ?? "");
      const phone = sanitizePhone(row[block.phoneCol] ?? "");
      // Skip rows that are clearly totals (name empty phone empty already skipped)
      if (!phone && numGuests > 20) continue;

      const groupName =
        block.groupHint?.trim() ||
        sideGroup ||
        null;

      guests.push({
        name,
        phone,
        numGuests,
        guestType: honor ? "honor" : "standard",
        groupName,
        ceremonyIds: ceremony ? [ceremony] : [],
        sheet: sheetName,
        lineNumber: r + 1,
      });
    }
  }

  return guests;
}

/** Fallback for honor sheet with irregular headers. */
function extractHonorLoose(matrix: SheetCell[][], sheetName: string): ExtractedGuest[] {
  const guests: ExtractedGuest[] = [];
  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length - 2; c += 1) {
      const name = (row[c] ?? "").trim();
      const maybeGuests = (row[c + 1] ?? "").trim();
      const maybePhone = (row[c + 2] ?? "").trim();
      if (!looksLikePersonName(name)) continue;
      if (!/^\d+([.,]\d+)?$/.test(maybeGuests)) continue;
      const phone = sanitizePhone(maybePhone);
      if (!phone && !maybePhone) continue;
      // phone-ish
      if (maybePhone && !/[\d+]/.test(maybePhone)) continue;

      guests.push({
        name,
        phone,
        numGuests: parseNumGuests(maybeGuests),
        guestType: "honor",
        groupName: "Invités d'honneur",
        ceremonyIds: [],
        sheet: sheetName,
        lineNumber: r + 1,
      });
    }
  }
  return guests;
}

function phoneKey(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized.replace(/\D/g, "");
}

function mergeExtracted(guests: ExtractedGuest[]): CompareFileRow[] {
  const byPhone = new Map<string, CompareFileRow>();
  const byName: CompareFileRow[] = [];
  let syntheticLine = 1;

  function applyCeremonySeats(row: CompareFileRow, guest: ExtractedGuest) {
    const seats = { ...(row.ceremonySeats ?? {}) };
    for (const ceremonyId of guest.ceremonyIds) {
      seats[ceremonyId] = Math.max(seats[ceremonyId] ?? 0, guest.numGuests);
    }
    row.ceremonySeats = seats;
    const values = Object.values(seats);
    row.numGuests =
      values.length > 0 ? Math.max(1, ...values) : Math.max(1, guest.numGuests);
  }

  for (const guest of guests) {
    const key = guest.phone ? phoneKey(guest.phone) : "";
    const base: CompareFileRow = {
      lineNumber: guest.lineNumber || syntheticLine,
      name: guest.name.trim(),
      phone: guest.phone,
      numGuests: guest.numGuests,
      ceremonySeats: {},
      guestType: guest.guestType,
      groupName: guest.groupName ?? undefined,
      ceremonyIds: [...guest.ceremonyIds],
    };
    applyCeremonySeats(base, guest);
    syntheticLine += 1;

    if (!key) {
      byName.push(base);
      continue;
    }

    const existing = byPhone.get(key);
    if (!existing) {
      byPhone.set(key, base);
      continue;
    }

    existing.ceremonyIds = [
      ...new Set([...existing.ceremonyIds, ...base.ceremonyIds]),
    ];
    if (base.guestType === "honor") existing.guestType = "honor";
    applyCeremonySeats(existing, guest);
    if (base.name.length > existing.name.length) existing.name = base.name;
    if (!existing.groupName && base.groupName) existing.groupName = base.groupName;
    if (base.phone.startsWith("+") && !existing.phone.startsWith("+")) {
      existing.phone = base.phone;
    }
  }

  const namelessMerged = new Map<string, CompareFileRow>();
  for (const row of byName) {
    const n = normalizeGuestName(row.name);
    const hit = namelessMerged.get(n);
    if (!hit) {
      namelessMerged.set(n, row);
      continue;
    }
    hit.ceremonyIds = [...new Set([...hit.ceremonyIds, ...row.ceremonyIds])];
    if (row.guestType === "honor") hit.guestType = "honor";
    for (const [ceremonyId, seats] of Object.entries(row.ceremonySeats ?? {})) {
      const id = ceremonyId as CeremonyId;
      hit.ceremonySeats = {
        ...(hit.ceremonySeats ?? {}),
        [id]: Math.max(hit.ceremonySeats?.[id] ?? 0, seats),
      };
    }
    const values = Object.values(hit.ceremonySeats ?? {});
    hit.numGuests =
      values.length > 0 ? Math.max(1, ...values) : Math.max(hit.numGuests, row.numGuests);
  }

  return [...byPhone.values(), ...namelessMerged.values()].map((row, index) => ({
    ...row,
    lineNumber: index + 1,
  }));
}

export async function parseInvitationListWorkbook(
  buffer: Buffer,
  options?: { ceremonyId?: CeremonyId },
): Promise<{
  rows: CompareFileRow[];
  columns: CompareFileColumns;
  errors: string[];
  stats: { sheets: number; rawRows: number; mergedRows: number };
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ceremonyFilter = options?.ceremonyId;

  const extracted: ExtractedGuest[] = [];
  const errors: string[] = [];

  for (const sheet of workbook.worksheets) {
    const kind = sheetCeremony(sheet.name);
    if (!kind) {
      errors.push(`Feuille ignorée (cérémonie inconnue) : ${sheet.name}`);
      continue;
    }

    const honor = kind === "honor";
    // Filtre cérémonie : ignorer les autres feuilles (+ honneur hors scope)
    if (ceremonyFilter) {
      if (honor) continue;
      if (kind !== ceremonyFilter) continue;
    }

    const matrix = matrixFromSheet(sheet);
    const ceremony = honor ? null : kind;
    const sideGroup = sheetSideGroup(sheet.name);
    const blocks = findBlocks(matrix);

    let sheetGuests =
      blocks.length > 0
        ? extractFromBlocks(matrix, blocks, sheet.name, ceremony, honor, sideGroup)
        : [];

    if (honor && sheetGuests.length === 0) {
      sheetGuests = extractHonorLoose(matrix, sheet.name);
    }

    if (sheetGuests.length === 0) {
      errors.push(`Aucune ligne détectée dans « ${sheet.name} »`);
      continue;
    }

    extracted.push(...sheetGuests);
  }

  const rows = mergeExtracted(extracted);
  return {
    rows,
    columns: {
      phone: true,
      numGuests: true,
      guestType: true,
      // Les groupes Excel (Famille M / Tuluka…) ≠ groupes DB (souvent nom de feuille)
      group: false,
      // En filtre cérémonie, la présence est déjà scopée
      ceremonies: !ceremonyFilter,
    },
    errors,
    stats: {
      sheets: workbook.worksheets.length,
      rawRows: extracted.length,
      mergedRows: rows.length,
    },
  };
}

/** Heuristic: multi-sheet invitation workbook vs flat export. */
export function looksLikeInvitationListWorkbook(workbook: ExcelJS.Workbook) {
  const names = workbook.worksheets.map((s) => normalizeHeader(s.name));
  const hits = names.filter(
    (n) =>
      n.includes("coutumier") ||
      n.includes("civil") ||
      n.includes("religieux") ||
      n.includes("honneur"),
  ).length;
  return hits >= 2;
}

export async function detectAndParseGuestsWorkbook(
  buffer: Buffer,
  options?: { ceremonyId?: CeremonyId },
): Promise<{
  rows: CompareFileRow[];
  columns: CompareFileColumns;
  errors: string[];
  format: "invitation-list" | "flat";
} | null> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    if (looksLikeInvitationListWorkbook(workbook)) {
      const parsed = await parseInvitationListWorkbook(buffer, options);
      return {
        rows: parsed.rows,
        columns: parsed.columns,
        errors: parsed.errors,
        format: "invitation-list",
      };
    }
  } catch {
    return null;
  }
  return null;
}
