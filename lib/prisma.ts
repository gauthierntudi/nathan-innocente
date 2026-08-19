import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion?: string;
};

/** Bump this after schema changes so the Nest/Turbopack singleton is rebuilt. */
const PRISMA_SCHEMA_VERSION = "invite-delivery-status-v2";

function databaseUrl() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return url;
  if (url.includes("connect_timeout=")) return url;
  return url.includes("?")
    ? `${url}&connect_timeout=15`
    : `${url}?connect_timeout=15`;
}

function createPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl() },
    },
  });
}

if (
  process.env.NODE_ENV !== "production" &&
  globalForPrisma.prisma &&
  globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION
) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}
