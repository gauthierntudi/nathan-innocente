/**
 * Marque `status_send = true` pour les invités remis « À inviter » par erreur
 * (reset plan de table). Ne renvoie aucun WhatsApp.
 *
 * Usage:
 *   npx tsx scripts/backfill-invite-sent-status.ts --dry-run
 *   npx tsx scripts/backfill-invite-sent-status.ts
 *   npx tsx scripts/backfill-invite-sent-status.ts --invitation-enabled --dry-run
 *   npx tsx scripts/backfill-invite-sent-status.ts --invitation-enabled
 *
 * Modes (cumulables) :
 * - défaut : preuve d’interaction ou statut Twilio (délivré, envoyé, lu…)
 * - --invitation-enabled : tous les invités avec invitation activée (après envoi massif déjà fait)
 * - --with-table : invités affectés à au moins une table
 */
import "dotenv/config";

import {
  guestWasAlreadyContacted,
} from "@/lib/admin/invite-sent-backfill";
import { prisma } from "@/lib/prisma";

const dryRun = process.argv.includes("--dry-run");
const includeInvitationEnabled = process.argv.includes("--invitation-enabled");
const includeWithTable = process.argv.includes("--with-table");

async function main() {
  const guests = await prisma.guest.findMany({
    where: {
      phoneFictitious: false,
      statusSend: false,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      invitationEnabled: true,
      deviceId: true,
      availability: true,
      statusReminderSent: true,
      dressCodeDownloadedAt: true,
      inviteMessageSid: true,
      inviteDeliveryStatus: true,
      passCheckedInAt: true,
      guestCeremonies: {
        select: {
          tableId: true,
          availability: true,
          checkedInAt: true,
          dressCodeDownloadedAt: true,
          passSentAt: true,
          respondedAt: true,
        },
      },
    },
  });

  const toUpdate = guests.filter((guest) => {
    if (guestWasAlreadyContacted(guest)) return true;
    if (includeInvitationEnabled && guest.invitationEnabled) return true;
    if (
      includeWithTable &&
      guest.guestCeremonies.some((item) => Boolean(item.tableId))
    ) {
      return true;
    }
    return false;
  });

  const modeLabel = [
    "interaction ou statut Twilio",
    includeInvitationEnabled ? "invitation activée" : null,
    includeWithTable ? "avec table" : null,
  ]
    .filter(Boolean)
    .join(" + ");

  console.log(
    dryRun ? "[DRY RUN] " : "",
    `${toUpdate.length} invité(s) à marquer « Invitation envoyée »`,
    `(mode: ${modeLabel})`,
    `sur ${guests.length} sans status_send.`,
  );

  if (toUpdate.length > 0 && toUpdate.length <= 20) {
    for (const guest of toUpdate) {
      console.log(`  · ${guest.name} (${guest.phone})`);
    }
  } else if (toUpdate.length > 20) {
    for (const guest of toUpdate.slice(0, 10)) {
      console.log(`  · ${guest.name} (${guest.phone})`);
    }
    console.log(`  … et ${toUpdate.length - 10} autres`);
  }

  if (dryRun || toUpdate.length === 0) {
    return;
  }

  const ids = toUpdate.map((guest) => guest.id);
  const result = await prisma.guest.updateMany({
    where: { id: { in: ids } },
    data: {
      statusSend: true,
      inviteStatusAt: new Date(),
    },
  });

  console.log(`Mis à jour : ${result.count} invité(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
