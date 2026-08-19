import ExcelJS from "exceljs";
import type { CeremonyGroup, Guest, GuestCeremony } from "@prisma/client";

import { CEREMONY_DEFINITIONS, type CeremonyId } from "@/lib/admin/ceremony-types";

type GuestWithCeremonies = Guest & {
  guestCeremonies: Array<
    GuestCeremony & {
      group: Pick<CeremonyGroup, "name"> | null;
    }
  >;
};

function availabilityLabel(availability: boolean | null) {
  if (availability === null) return "En attente";
  return availability ? "Disponible" : "Non disponible";
}

function ceremonyAvailabilityLabel(
  guestCeremonies: GuestWithCeremonies["guestCeremonies"],
  ceremonyId: CeremonyId,
) {
  const assignment = guestCeremonies.find((item) => item.ceremonyId === ceremonyId);
  if (!assignment) return "—";
  return availabilityLabel(assignment.availability);
}

function ceremonyConvivesLabel(
  guestCeremonies: GuestWithCeremonies["guestCeremonies"],
  ceremonyId: CeremonyId,
) {
  const assignment = guestCeremonies.find((item) => item.ceremonyId === ceremonyId);
  if (!assignment) return "—";
  return Math.max(0, assignment.numGuests ?? 0);
}

function ceremonyGroupLabel(
  guestCeremonies: GuestWithCeremonies["guestCeremonies"],
  ceremonyId: CeremonyId,
) {
  const assignment = guestCeremonies.find((item) => item.ceremonyId === ceremonyId);
  if (!assignment) return "—";
  return assignment.group?.name?.trim() || "Sans groupe";
}

function groupsSummary(guestCeremonies: GuestWithCeremonies["guestCeremonies"]) {
  const labels = CEREMONY_DEFINITIONS.flatMap((ceremony) => {
    const assignment = guestCeremonies.find(
      (item) => item.ceremonyId === ceremony.id,
    );
    const name = assignment?.group?.name?.trim();
    if (!name) return [];
    return [`${name} (${ceremony.name})`];
  });
  return labels.length > 0 ? labels.join(" · ") : "—";
}

function totalCeremonyConvives(guest: GuestWithCeremonies) {
  if (guest.guestCeremonies.length === 0) {
    return Math.max(1, guest.numGuests);
  }
  return guest.guestCeremonies.reduce(
    (total, item) => total + Math.max(0, item.numGuests ?? 0),
    0,
  );
}

function formatAddedAt(value: Date) {
  return value.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rowForGuest(guest: GuestWithCeremonies) {
  const ceremonyCells = CEREMONY_DEFINITIONS.flatMap((ceremony) => [
    ceremonyConvivesLabel(guest.guestCeremonies, ceremony.id),
    ceremonyAvailabilityLabel(guest.guestCeremonies, ceremony.id),
    ceremonyGroupLabel(guest.guestCeremonies, ceremony.id),
  ]);

  return [
    guest.name,
    guest.phone,
    guest.guestType === "honor" ? "Invité d'honneur" : "Standard",
    formatAddedAt(guest.createdAt),
    groupsSummary(guest.guestCeremonies),
    totalCeremonyConvives(guest),
    guest.confirmedGuests,
    availabilityLabel(guest.availability),
    ...ceremonyCells,
    guest.status,
    guest.statusSend ? "Oui" : "Non",
    guest.deviceId ? "Oui" : "Non",
    guest.dressCodeDownloadedAt ? "Oui" : "Non",
    guest.token,
  ];
}

const COLUMNS = [
  "Nom",
  "Téléphone",
  "Type d'invité",
  "Date d'ajout",
  "Groupes",
  "Convives (total cérémonies)",
  "Convives (confirmés)",
  "Disponibilité globale",
  ...CEREMONY_DEFINITIONS.flatMap((ceremony) => [
    `Convives — ${ceremony.name}`,
    `RSVP — ${ceremony.name}`,
    `Groupe — ${ceremony.name}`,
  ]),
  "Statut",
  "Message envoyé",
  "Device lié",
  "Dress code téléchargé",
  "Token",
];

export async function buildGuestsWorkbook(guests: GuestWithCeremonies[]) {
  const chronological = [...guests].sort((a, b) => {
    const byDateTime = a.createdAt.getTime() - b.createdAt.getTime();
    if (byDateTime !== 0) return byDateTime;
    return a.name.localeCompare(b.name, "fr");
  });
  const responded = chronological.filter((g) => g.availability !== null);
  const pending = chronological.filter((g) => g.availability === null);
  const notAvailable = chronological.filter((g) => g.availability === false);

  const workbook = new ExcelJS.Workbook();
  const sheets: Array<{ name: string; data: GuestWithCeremonies[] }> = [
    { name: "Tous les invités", data: chronological },
    { name: "Ont répondu", data: responded },
    { name: "Pas encore répondu", data: pending },
    { name: "Non disponibles", data: notAvailable },
  ];

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.addRow(COLUMNS);
    ws.getRow(1).font = { bold: true };

    for (const guest of sheet.data) {
      ws.addRow(rowForGuest(guest));
    }

    ws.columns.forEach((column, index) => {
      column.width =
        index === 0 ? 28 : index === 3 ? 20 : index === 4 ? 32 : 16;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
