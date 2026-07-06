import ExcelJS from "exceljs";
import type { Guest } from "@prisma/client";

function availabilityLabel(guest: Guest) {
  if (guest.availability === null) return "En attente";
  return guest.availability ? "Disponible" : "Non disponible";
}

function rowForGuest(guest: Guest) {
  return [
    guest.name,
    guest.phone,
    Math.max(1, guest.numGuests),
    guest.confirmedGuests,
    availabilityLabel(guest),
    guest.status,
    guest.statusSend ? "Oui" : "Non",
    guest.deviceId ? "Oui" : "Non",
    guest.token,
  ];
}

const COLUMNS = [
  "Nom",
  "Téléphone",
  "Convives (invités)",
  "Convives (confirmés)",
  "Disponibilité",
  "Statut",
  "Message envoyé",
  "Device lié",
  "Token",
];

export async function buildGuestsWorkbook(guests: Guest[]) {
  const responded = guests.filter((g) => g.availability !== null);
  const pending = guests.filter((g) => g.availability === null);
  const notAvailable = guests.filter((g) => g.availability === false);

  const workbook = new ExcelJS.Workbook();
  const sheets: Array<{ name: string; data: Guest[] }> = [
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
