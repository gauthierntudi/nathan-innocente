import { jsonError, jsonOk } from "@/lib/api-response";
import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { isPassSendEnabledForCeremony } from "@/lib/admin/pass-config";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { sendPassWhatsApp } from "@/lib/twilio";

type PassSendBody = {
  guestId?: string;
  ceremonyId?: string;
  /** Renvoyer même si le pass a déjà été envoyé pour cette cérémonie. */
  force?: boolean;
};

type PassBulkBody = {
  ceremonyId?: string;
  /** Nombre maximum de messages à envoyer (ordre alphabétique). */
  limit?: number;
  /** Inclure les invités ayant déjà reçu le pass (renvoi). */
  force?: boolean;
};

const passSendWhere = (ceremonyId: CeremonyId, pendingOnly: boolean) => ({
  ceremonyId,
  guest: { phoneFictitious: false },
  ...(pendingOnly ? { passSentAt: null } : {}),
});

async function markPassSent(guestId: string, ceremonyId: CeremonyId) {
  await prisma.guestCeremony.update({
    where: {
      guestId_ceremonyId: { guestId, ceremonyId },
    },
    data: { passSentAt: new Date() },
  });
}

async function loadPassAssignment(guestId: string, ceremonyId: CeremonyId) {
  return prisma.guestCeremony.findUnique({
    where: {
      guestId_ceremonyId: { guestId, ceremonyId },
    },
    include: { guest: true },
  });
}

async function loadPassAssignmentsForCeremony(
  ceremonyId: CeremonyId,
  limit: number,
  pendingOnly: boolean,
) {
  return prisma.guestCeremony.findMany({
    where: passSendWhere(ceremonyId, pendingOnly),
    include: { guest: true },
    orderBy: { guest: { name: "asc" } },
    take: limit,
  });
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const url = new URL(request.url);
  const ceremonyIdRaw = url.searchParams.get("ceremonyId")?.trim() ?? "";

  if (!ceremonyIdRaw || !isCeremonyId(ceremonyIdRaw)) {
    return jsonError("Cérémonie invalide");
  }

  const ceremonyId = ceremonyIdRaw as CeremonyId;
  const baseWhere = {
    ceremonyId,
    guest: { phoneFictitious: false },
  };

  const [eligibleTotal, pending, sent] = await Promise.all([
    prisma.guestCeremony.count({ where: baseWhere }),
    prisma.guestCeremony.count({
      where: { ...baseWhere, passSentAt: null },
    }),
    prisma.guestCeremony.count({
      where: { ...baseWhere, passSentAt: { not: null } },
    }),
  ]);

  return jsonOk({
    ceremonyId,
    eligibleTotal,
    pending,
    sent,
    /** @deprecated Préférer `pending`. */
    eligible: pending,
  });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as PassSendBody;
  const guestId = body.guestId?.trim() ?? "";
  const ceremonyIdRaw = body.ceremonyId?.trim() ?? "";
  const force = body.force === true;

  if (!guestId) {
    return jsonError("Invité manquant");
  }
  if (!ceremonyIdRaw || !isCeremonyId(ceremonyIdRaw)) {
    return jsonError("Cérémonie invalide");
  }

  const ceremonyId = ceremonyIdRaw as CeremonyId;
  if (!isPassSendEnabledForCeremony(ceremonyId)) {
    return jsonError("L'envoi de pass est désactivé pour cette cérémonie", 403);
  }

  const assignment = await loadPassAssignment(guestId, ceremonyId);

  if (!assignment) {
    return jsonError("Invité non affecté à cette cérémonie", 404);
  }
  if (assignment.guest.phoneFictitious) {
    return jsonError("Numéro fictif : WhatsApp impossible");
  }
  if (!force && assignment.passSentAt) {
    return jsonError("Pass déjà envoyé pour cette cérémonie");
  }

  const result = await sendPassWhatsApp(assignment.guest);
  if (!result.ok) {
    return jsonError(result.message ?? "Erreur Twilio");
  }

  await markPassSent(guestId, ceremonyId);

  return jsonOk({
    message: result.message ?? `Pass envoyé à ${assignment.guest.name}`,
    sid: result.sid,
    status: result.status,
    resent: Boolean(force && assignment.passSentAt),
  });
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as PassBulkBody;
  const ceremonyIdRaw = body.ceremonyId?.trim() ?? "";
  const limitRaw = Number(body.limit);
  const force = body.force === true;

  if (!ceremonyIdRaw || !isCeremonyId(ceremonyIdRaw)) {
    return jsonError("Cérémonie invalide");
  }
  if (!Number.isFinite(limitRaw) || limitRaw < 1 || limitRaw > 500) {
    return jsonError("Indiquez un nombre entre 1 et 500");
  }

  const ceremonyId = ceremonyIdRaw as CeremonyId;
  if (!isPassSendEnabledForCeremony(ceremonyId)) {
    return jsonError("L'envoi de pass est désactivé pour cette cérémonie", 403);
  }

  const limit = Math.floor(limitRaw);
  const pendingOnly = !force;

  const eligibleTotal = await prisma.guestCeremony.count({
    where: passSendWhere(ceremonyId, false),
  });

  const pendingTotal = await prisma.guestCeremony.count({
    where: passSendWhere(ceremonyId, true),
  });

  if (eligibleTotal === 0) {
    return jsonError("Aucun invité affecté à cette cérémonie");
  }
  if (pendingOnly && pendingTotal === 0) {
    return jsonError("Tous les invités affectés ont déjà reçu le pass");
  }

  const assignments = await loadPassAssignmentsForCeremony(
    ceremonyId,
    limit,
    pendingOnly,
  );

  if (assignments.length === 0) {
    return jsonError(
      pendingOnly
        ? "Aucun invité en attente de pass pour cette cérémonie"
        : "Aucun invité affecté à cette cérémonie",
    );
  }

  let sentCount = 0;
  let failCount = 0;
  const results: Array<{
    guestId: string;
    guestName: string;
    success: boolean;
    message?: string;
  }> = [];

  for (const assignment of assignments) {
    const result = await sendPassWhatsApp(assignment.guest);
    if (result.ok) {
      await markPassSent(assignment.guestId, ceremonyId);
      sentCount += 1;
      results.push({
        guestId: assignment.guestId,
        guestName: assignment.guest.name,
        success: true,
        message: result.message,
      });
    } else {
      failCount += 1;
      results.push({
        guestId: assignment.guestId,
        guestName: assignment.guest.name,
        success: false,
        message: result.message,
      });
    }
  }

  return jsonOk({
    ceremonyId,
    requested: limit,
    eligibleTotal,
    pendingTotal,
    sentCount,
    failCount,
    results,
    message: `Pass — ${sentCount} envoyé${sentCount > 1 ? "s" : ""} · ${failCount} erreur${failCount > 1 ? "s" : ""} (${pendingOnly ? `${pendingTotal} en attente` : `${eligibleTotal} affecté${eligibleTotal > 1 ? "s" : ""}`} au total)`,
  });
}
