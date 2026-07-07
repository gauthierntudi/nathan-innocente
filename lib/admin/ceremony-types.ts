import type { Ceremony, CeremonyTable, Guest, GuestCeremony } from "@prisma/client";

export const CEREMONY_IDS = ["coutumier", "civile", "religieux"] as const;
export type CeremonyId = (typeof CEREMONY_IDS)[number];

export const CEREMONY_DEFINITIONS: ReadonlyArray<{
  id: CeremonyId;
  name: string;
  sortOrder: number;
}> = [
  { id: "coutumier", name: "Cérémonie coutumière", sortOrder: 1 },
  { id: "civile", name: "Cérémonie civile", sortOrder: 2 },
  { id: "religieux", name: "Bénédiction nuptiale", sortOrder: 3 },
];

export type CeremonyAssignment = {
  id: string;
  guestId: string;
  ceremonyId: CeremonyId;
  tableId: string | null;
  availability: boolean | null;
  confirmedGuests: number;
  guest: {
    id: string;
    name: string;
    phone: string;
    numGuests: number;
  };
};

export type AdminCeremonyTable = {
  id: string;
  ceremonyId: CeremonyId;
  name: string;
  capacity: number | null;
  sortOrder: number;
  assignments: CeremonyAssignment[];
};

export type AdminCeremony = {
  id: CeremonyId;
  name: string;
  sortOrder: number;
  tables: AdminCeremonyTable[];
  unassignedGuests: CeremonyAssignment[];
};

export type CeremonyBoard = {
  ceremonies: AdminCeremony[];
};

export function isCeremonyId(value: string): value is CeremonyId {
  return CEREMONY_IDS.includes(value as CeremonyId);
}

type GuestCeremonyWithGuest = GuestCeremony & { guest: Guest };
type CeremonyTableWithAssignments = CeremonyTable & {
  assignments: GuestCeremonyWithGuest[];
};
type CeremonyWithRelations = Ceremony & {
  tables: CeremonyTableWithAssignments[];
  assignments: GuestCeremonyWithGuest[];
};

export function serializeAssignment(record: GuestCeremonyWithGuest): CeremonyAssignment {
  return {
    id: record.id,
    guestId: record.guestId,
    ceremonyId: record.ceremonyId as CeremonyId,
    tableId: record.tableId,
    availability: record.availability,
    confirmedGuests: record.confirmedGuests,
    guest: {
      id: record.guest.id,
      name: record.guest.name,
      phone: record.guest.phone,
      numGuests: record.guest.numGuests,
    },
  };
}

export function serializeCeremonyBoard(ceremonies: CeremonyWithRelations[]): CeremonyBoard {
  return {
    ceremonies: ceremonies.map((ceremony) => {
      const assignments = ceremony.assignments.map(serializeAssignment);
      const assignedGuestIds = new Set(assignments.map((item) => item.guestId));

      return {
        id: ceremony.id as CeremonyId,
        name: ceremony.name,
        sortOrder: ceremony.sortOrder,
        unassignedGuests: assignments.filter((item) => !item.tableId),
        tables: ceremony.tables
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"))
          .map((table) => ({
            id: table.id,
            ceremonyId: table.ceremonyId as CeremonyId,
            name: table.name,
            capacity: table.capacity,
            sortOrder: table.sortOrder,
            assignments: table.assignments.map(serializeAssignment),
          })),
        ...(assignedGuestIds.size ? {} : {}),
      };
    }),
  };
}

export function getGuestsNotInCeremony(
  allGuests: Array<Pick<Guest, "id" | "name" | "phone" | "numGuests">>,
  ceremony: AdminCeremony,
) {
  const assignedIds = new Set([
    ...ceremony.unassignedGuests.map((item) => item.guestId),
    ...ceremony.tables.flatMap((table) => table.assignments.map((item) => item.guestId)),
  ]);

  return allGuests.filter((guest) => !assignedIds.has(guest.id));
}
