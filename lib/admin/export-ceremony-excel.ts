import ExcelJS from "exceljs";
import type {
  Ceremony,
  CeremonyGroup,
  CeremonyTable,
  Guest,
  GuestCeremony,
} from "@prisma/client";

import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
  isCeremonyId,
} from "@/lib/admin/ceremony-types";

export type CeremonyExportAssignment = GuestCeremony & {
  guest: Guest;
  table: Pick<CeremonyTable, "name" | "sortOrder"> | null;
  group: Pick<CeremonyGroup, "id" | "name" | "sortOrder"> | null;
  ceremony: Pick<Ceremony, "id" | "name" | "sortOrder">;
};

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2B1814" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  name: "Calibri",
  size: 11,
};

const BODY_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
};

const COLUMNS = [
  { header: "Nom", key: "name", width: 32 },
  { header: "Téléphone", key: "phone", width: 18 },
  { header: "Type", key: "guestType", width: 16 },
  { header: "Genre", key: "genre", width: 12 },
  { header: "Convives", key: "numGuests", width: 12 },
  { header: "RSVP", key: "rsvp", width: 16 },
  { header: "Places confirmées", key: "confirmedGuests", width: 18 },
  { header: "Table", key: "table", width: 18 },
  { header: "Groupe", key: "group", width: 18 },
  { header: "Invitation activée", key: "invitation", width: 18 },
  { header: "Message envoyé", key: "statusSend", width: 16 },
  { header: "Dress code", key: "dressCode", width: 14 },
] as const;

function rsvpLabel(availability: boolean | null) {
  if (availability === null) return "En attente";
  return availability ? "Oui" : "Non";
}

function guestTypeLabel(guestType: string) {
  return guestType === "honor" ? "Invité d'honneur" : "Standard";
}

function excelSheetName(name: string) {
  return name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Cérémonie";
}

function ceremonyFileSlug(ceremonyId: CeremonyId) {
  return ceremonyId;
}

function fileSlug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "groupe"
  );
}

function addRsvpSheets(
  workbook: ExcelJS.Workbook,
  assignments: CeremonyExportAssignment[],
) {
  const sorted = sortAssignments(assignments);
  addListSheet(workbook, "Tous", sorted);
  addListSheet(
    workbook,
    "Confirmés",
    sorted.filter((item) => item.availability === true),
  );
  addListSheet(
    workbook,
    "Déclinés",
    sorted.filter((item) => item.availability === false),
  );
  addListSheet(
    workbook,
    "En attente",
    sorted.filter((item) => item.availability === null),
  );
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = HEADER_FONT;
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };
}

function appendAssignmentRows(
  sheet: ExcelJS.Worksheet,
  assignments: CeremonyExportAssignment[],
) {
  for (const assignment of assignments) {
    sheet.addRow({
      name: assignment.guest.name,
      phone: assignment.guest.phone,
      guestType: guestTypeLabel(assignment.guest.guestType),
      genre: assignment.guest.genre,
      numGuests: Math.max(0, assignment.numGuests ?? assignment.guest.numGuests),
      rsvp: rsvpLabel(assignment.availability),
      confirmedGuests:
        assignment.availability === true
          ? Math.max(0, assignment.confirmedGuests ?? 0)
          : 0,
      table: assignment.table?.name ?? "—",
      group: assignment.group?.name ?? "—",
      invitation: assignment.guest.invitationEnabled ? "Oui" : "Non",
      statusSend: assignment.guest.statusSend ? "Oui" : "Non",
      dressCode:
        assignment.dressCodeDownloadedAt || assignment.guest.dressCodeDownloadedAt
          ? "Oui"
          : "Non",
    });
  }

  const lastDataRow = assignments.length + 1;
  if (assignments.length === 0) return;

  const totalsRow = lastDataRow + 1;
  const convivesCol = "E";
  const confirmedCol = "G";
  const total = sheet.getRow(totalsRow);
  total.getCell(1).value = "Total";
  total.getCell(1).font = { ...BODY_FONT, bold: true };
  total.getCell(5).value = {
    formula: `SUM(${convivesCol}2:${convivesCol}${lastDataRow})`,
  };
  total.getCell(7).value = {
    formula: `SUM(${confirmedCol}2:${confirmedCol}${lastDataRow})`,
  };
  total.font = { ...BODY_FONT, bold: true };
}

function addListSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  assignments: CeremonyExportAssignment[],
) {
  const sheet = workbook.addWorksheet(excelSheetName(name), {
    properties: { defaultRowHeight: 18 },
  });
  sheet.columns = COLUMNS.map((column) => ({ ...column }));
  styleHeader(sheet);
  appendAssignmentRows(sheet, assignments);
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.font = BODY_FONT;
    row.alignment = { vertical: "middle" };
  });
  return sheet;
}

function sortAssignments(assignments: CeremonyExportAssignment[]) {
  return [...assignments].sort((a, b) => {
    const tableOrder =
      (a.table?.sortOrder ?? 9999) - (b.table?.sortOrder ?? 9999);
    if (tableOrder !== 0) return tableOrder;
    const tableName = (a.table?.name ?? "zzz").localeCompare(
      b.table?.name ?? "zzz",
      "fr",
    );
    if (tableName !== 0) return tableName;
    return a.guest.name.localeCompare(b.guest.name, "fr");
  });
}

function addRecapSheet(
  workbook: ExcelJS.Workbook,
  groups: Array<{ name: string; sheetName: string; count: number }>,
) {
  const sheet = workbook.addWorksheet("Récapitulatif");
  sheet.columns = [
    { header: "Cérémonie", key: "name", width: 28 },
    { header: "Invités", key: "invites", width: 12 },
    { header: "Convives", key: "convives", width: 12 },
    { header: "Oui", key: "yes", width: 10 },
    { header: "Non", key: "no", width: 10 },
    { header: "En attente", key: "pending", width: 14 },
    { header: "Places confirmées", key: "confirmed", width: 18 },
  ];
  styleHeader(sheet);

  groups.forEach((group, index) => {
    const row = index + 2;
    const quoted = `'${group.sheetName.replace(/'/g, "''")}'`;
    sheet.addRow({
      name: group.name,
      invites: { formula: `COUNTA(${quoted}!A2:A${Math.max(group.count + 1, 2)})` },
      convives: { formula: `SUM(${quoted}!E2:E${Math.max(group.count + 1, 2)})` },
      yes: {
        formula: `COUNTIF(${quoted}!F2:F${Math.max(group.count + 1, 2)},"Oui")`,
      },
      no: {
        formula: `COUNTIF(${quoted}!F2:F${Math.max(group.count + 1, 2)},"Non")`,
      },
      pending: {
        formula: `COUNTIF(${quoted}!F2:F${Math.max(group.count + 1, 2)},"En attente")`,
      },
      confirmed: { formula: `SUM(${quoted}!G2:G${Math.max(group.count + 1, 2)})` },
    });
    void row;
  });

  if (groups.length > 0) {
    const last = groups.length + 1;
    const total = sheet.addRow({
      name: "Total",
      invites: { formula: `SUM(B2:B${last})` },
      convives: { formula: `SUM(C2:C${last})` },
      yes: { formula: `SUM(D2:D${last})` },
      no: { formula: `SUM(E2:E${last})` },
      pending: { formula: `SUM(F2:F${last})` },
      confirmed: { formula: `SUM(G2:G${last})` },
    });
    total.font = { ...BODY_FONT, bold: true };
  }

  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.font = BODY_FONT;
    row.alignment = { vertical: "middle" };
  });
}

export function ceremonyExportFilename(
  ceremonyId?: CeremonyId | null,
  options?: { groupName?: string | null; byGroups?: boolean },
) {
  const date = new Date().toISOString().slice(0, 10);
  if (options?.groupName) {
    return `liste_groupe_${fileSlug(options.groupName)}_${date}.xlsx`;
  }
  if (options?.byGroups && ceremonyId && isCeremonyId(ceremonyId)) {
    return `listes_groupes_${ceremonyFileSlug(ceremonyId)}_${date}.xlsx`;
  }
  if (ceremonyId && isCeremonyId(ceremonyId)) {
    return `liste_${ceremonyFileSlug(ceremonyId)}_${date}.xlsx`;
  }
  return `listes_ceremonies_${date}.xlsx`;
}

export async function buildCeremonyListsWorkbook(
  assignments: CeremonyExportAssignment[],
  options?: {
    ceremonyId?: CeremonyId | null;
    groupId?: string | null;
    byGroups?: boolean;
  },
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nathan & Innocente";
  workbook.created = new Date();

  const scoped = assignments.filter((item) => {
    if (options?.groupId) return item.groupId === options.groupId;
    if (options?.ceremonyId) return item.ceremonyId === options.ceremonyId;
    return true;
  });

  if (options?.groupId) {
    addRsvpSheets(workbook, scoped);
    addListSheet(
      workbook,
      "Sans table",
      sortAssignments(scoped).filter((item) => !item.tableId),
    );
  } else if (options?.byGroups) {
    const groups = new Map<string, { name: string; rows: CeremonyExportAssignment[] }>();
    const ungrouped: CeremonyExportAssignment[] = [];

    for (const assignment of sortAssignments(scoped)) {
      if (!assignment.groupId || !assignment.group) {
        ungrouped.push(assignment);
        continue;
      }
      const existing = groups.get(assignment.groupId);
      if (existing) {
        existing.rows.push(assignment);
        continue;
      }
      groups.set(assignment.groupId, {
        name: assignment.group.name,
        rows: [assignment],
      });
    }

    const recapGroups: Array<{ name: string; sheetName: string; count: number }> =
      [];

    for (const group of groups.values()) {
      const name = excelSheetName(group.name);
      addListSheet(workbook, name, group.rows);
      recapGroups.push({
        name: group.name,
        sheetName: name,
        count: group.rows.length,
      });
    }

    if (ungrouped.length > 0) {
      addListSheet(workbook, "Sans groupe", ungrouped);
      recapGroups.push({
        name: "Sans groupe",
        sheetName: "Sans groupe",
        count: ungrouped.length,
      });
    }

    if (recapGroups.length === 0) {
      addListSheet(workbook, "Groupes", []);
    } else {
      addRecapSheet(workbook, recapGroups);
    }
  } else if (options?.ceremonyId) {
    const sorted = sortAssignments(scoped);
    addRsvpSheets(workbook, sorted);
    addListSheet(
      workbook,
      "Sans table",
      sorted.filter((item) => !item.tableId),
    );
  } else {
    const recapGroups: Array<{ name: string; sheetName: string; count: number }> =
      [];

    for (const definition of CEREMONY_DEFINITIONS) {
      const rows = sortAssignments(
        scoped.filter((item) => item.ceremonyId === definition.id),
      );
      const name = excelSheetName(definition.name.replace(/^Cérémonie\s+/i, "").replace(/^Mariage\s+/i, ""));
      addListSheet(workbook, name, rows);
      recapGroups.push({
        name: definition.name,
        sheetName: name,
        count: rows.length,
      });
    }

    addRecapSheet(workbook, recapGroups);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
