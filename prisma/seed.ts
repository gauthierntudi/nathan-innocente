import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CEREMONY_DEFINITIONS } from "../lib/admin/ceremony-types";

const prisma = new PrismaClient();

const GUESTS_FILE = resolve(
  process.env.GUESTS_JSON_PATH ?? resolve(__dirname, "data/guests.json"),
);

type JsonGuest = {
  phone: string;
  name: string;
  genre?: string;
  token: string;
  device_id?: string | null;
  status?: string;
  status_send?: boolean;
  status_reminder_sent?: boolean;
  availability?: boolean | null;
  confirmed_guests?: number;
  num_guests?: number;
};

function loadGuests(): JsonGuest[] {
  const raw = readFileSync(GUESTS_FILE, "utf-8");
  const data = JSON.parse(raw) as unknown;

  if (!Array.isArray(data)) {
    throw new Error(`${GUESTS_FILE} doit contenir un tableau JSON`);
  }

  return data as JsonGuest[];
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function mapGuest(raw: JsonGuest) {
  if (!raw.phone?.trim() || !raw.name?.trim() || !raw.token?.trim()) {
    throw new Error(
      `Invité invalide (phone/name/token requis): ${JSON.stringify(raw)}`,
    );
  }

  return {
    phone: raw.phone.trim(),
    name: raw.name.trim(),
    genre: raw.genre?.trim() || "Cher(e)",
    token: raw.token.trim(),
    deviceId: raw.device_id ?? null,
    status: raw.status?.trim() || "pending",
    statusSend: Boolean(raw.status_send),
    statusReminderSent: Boolean(raw.status_reminder_sent),
    availability: raw.availability ?? null,
    confirmedGuests: toInt(raw.confirmed_guests, 0),
    numGuests: Math.max(1, toInt(raw.num_guests, 1)),
  };
}

function reportDuplicatePhones(guests: ReturnType<typeof mapGuest>[]) {
  const byPhone = new Map<string, string[]>();

  for (const guest of guests) {
    const names = byPhone.get(guest.phone) ?? [];
    names.push(guest.name);
    byPhone.set(guest.phone, names);
  }

  const duplicates = [...byPhone.entries()].filter(
    ([, names]) => names.length > 1,
  );

  if (duplicates.length > 0) {
    console.warn(
      "\n⚠ Numéros partagés par plusieurs invités (conservés, token unique) :",
    );
    for (const [phone, names] of duplicates) {
      console.warn(`  ${phone} → ${names.join(" | ")}`);
    }
  }
}

async function seedCeremonies() {
  await Promise.all(
    CEREMONY_DEFINITIONS.map((ceremony) =>
      prisma.ceremony.upsert({
        where: { id: ceremony.id },
        update: { name: ceremony.name, sortOrder: ceremony.sortOrder },
        create: ceremony,
      }),
    ),
  );
}

async function main() {
  const reset = process.env.SEED_RESET === "true";

  console.log(`Lecture de ${GUESTS_FILE}`);
  const rawGuests = loadGuests();
  const guests = rawGuests.map(mapGuest);

  reportDuplicatePhones(guests);

  if (reset) {
    console.log("SEED_RESET=true → suppression de la table guests…");
    await prisma.guest.deleteMany();
  }

  const BATCH_SIZE = 50;

  for (let i = 0; i < guests.length; i += BATCH_SIZE) {
    const batch = guests.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((guest) =>
        prisma.guest.upsert({
          where: { token: guest.token },
          create: guest,
          update: guest,
        }),
      ),
    );

    process.stdout.write(
      `\r  ${Math.min(i + BATCH_SIZE, guests.length)} / ${guests.length}`,
    );
  }

  console.log("\n");

  await seedCeremonies();
  console.log("✓ 3 cérémonies initialisées");

  const total = await prisma.guest.count();
  const pending = await prisma.guest.count({ where: { availability: null } });
  const yes = await prisma.guest.count({ where: { availability: true } });
  const no = await prisma.guest.count({ where: { availability: false } });

  console.log(`✓ ${guests.length} invités importés (${total} en base)`);
  console.log(
    `  Disponibilité — en attente: ${pending}, disponible: ${yes}, non disponible: ${no}`,
  );
}

main()
  .catch((error) => {
    console.error("Échec du seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
