/**
 * Remet à zéro status_send / status_reminder_sent pour les invités
 * déjà affectés à une table. L'ancien status_send (save-the-date / seed)
 * ne doit pas compter comme « Invitation envoyée » dans Messages.
 *
 * Usage: npx tsx scripts/reset-table-invite-status.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.guest.updateMany({
    where: {
      guestCeremonies: { some: { tableId: { not: null } } },
    },
    data: {
      statusSend: false,
      statusReminderSent: false,
    },
  });

  console.log(
    `Réinitialisé : ${result.count} invité(s) avec table → À inviter dans Messages.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
