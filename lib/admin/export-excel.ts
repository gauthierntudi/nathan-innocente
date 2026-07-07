import ExcelJS from "exceljs";
import type { Guest, GuestCeremony } from "@prisma/client";

import { CEREMONY_DEFINITIONS, type CeremonyId } from "@/lib/admin/ceremony-types";

type GuestWithCeremonies = Guest & {
  guestCeremonies: GuestCeremony[];
};

function availabilityLabel(availability: boolean | null) {
  if (availability === null) return "En attente";
  return availability ? "Disponible" : "Non disponible";
}

function ceremonyAvailabilityLabel(
  guestCeremonies: GuestCeremony[],
  ceremonyId: CeremonyId,
) {
  const assignment = guestCeremonies.find((item) => item.ceremonyId === ceremonyId);
  if (!assignment) return "—";
  return availabilityLabel(assignment.availability);
}

function rowForGuest(guest: GuestWithCeremonies) {
  return [
    guest.name,
    guest.phone,
    Math.max(1, guest.numGuests),
    guest.confirmedGuests,
    availabilityLabel(guest.availability),
    ...CEREMONY_DEFINITIONS.map((ceremony) =>
      ceremonyAvailabilityLabel(guest.guestCeremonies, ceremony.id),
    ),
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
  "Convives (invités)",
  "Convives (confirmés)",
  "Disponibilité globale",
  ...CEREMONY_DEFINITIONS.map((ceremony) => `RSVP ${ceremony.name}`),
  "Statut",
  "Message envoyé",
  "Device lié",
  "Dress code téléchargé",
  "Token",
];

export async function buildGuestsWorkbook(guests: GuestWithCeremonies[]) {
  const responded = guests.filter((g) => g.availability !== null);
  const pending = guests.filter((g) => g.availability === null);
  const notAvailable = guests.filter((g) => g.availability === false);

  const workbook = new ExcelJS.Workbook();
  const sheets: Array<{ name: string; data: GuestWithCeremonies[] }> = [
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

    ws.columns.forEach((column) => {
      column.width = 18;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
