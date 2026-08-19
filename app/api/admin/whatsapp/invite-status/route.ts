import { jsonError, jsonOk } from "@/lib/api-response";
import { inviteErrorLabel } from "@/lib/admin/invite-delivery";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  fetchTwilioMessage,
  findTwilioInviteMessage,
  isStoredInviteMessage,
} from "@/lib/twilio";

type StatusBody = {
  guestId?: string;
  guestIds?: string[];
  allSent?: boolean;
};

const guestInclude = {
  guestCeremonies: {
    select: {
      ceremonyId: true,
      tableId: true,
      groupId: true,
      group: { select: { name: true } },
      availability: true,
      confirmedGuests: true,
      numGuests: true,
      dressCodeDownloadedAt: true,
    },
  },
} as const;

async function refreshOne(guest: {
  id: string;
  name: string;
  phone: string;
  inviteMessageSid: string | null;
}) {
  let messageSid = guest.inviteMessageSid;
  let fetched: Awaited<ReturnType<typeof fetchTwilioMessage>> | null = null;
  let recovered = false;

  if (messageSid) {
    const bySid = await fetchTwilioMessage(messageSid);
    if (bySid.ok && isStoredInviteMessage(bySid)) {
      fetched = bySid;
    }
  }

  if (!fetched) {
    const found = await findTwilioInviteMessage(guest.phone);
    if (!found.ok) {
      return {
        ok: false as const,
        guestId: guest.id,
        message: `${guest.name} : ${found.message}`,
      };
    }
    messageSid = found.sid;
    recovered = true;
    fetched = {
      ok: true,
      sid: found.sid,
      status: found.status,
      contentSid: found.contentSid ?? null,
      body: null,
      dateSent: null,
      errorCode: found.errorCode,
      errorMessage: found.errorMessage,
    };
  }

  const error = inviteErrorLabel(fetched.errorCode, fetched.errorMessage);
  const updated = await prisma.guest.update({
    where: { id: guest.id },
    data: {
      inviteMessageSid: messageSid,
      inviteDeliveryStatus: fetched.status || "sent",
      inviteDeliveryError: error,
      inviteStatusAt: new Date(),
    },
    include: guestInclude,
  });

  return {
    ok: true as const,
    guestId: guest.id,
    guest: serializeGuest(updated),
    status: fetched.status,
    error,
    recovered,
  };
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as StatusBody;
  const guestId = body.guestId?.trim() ?? "";
  if (!guestId) return jsonError("Invité manquant");

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { id: true, name: true, phone: true, inviteMessageSid: true },
  });
  if (!guest) return jsonError("Invité introuvable", 404);

  const result = await refreshOne(guest);
  if (!result.ok) return jsonError(result.message);

  return jsonOk({
    guest: result.guest,
    message: [
      result.recovered ? "Ancien envoi retrouvé." : null,
      result.error
        ? `${guest.name} : ${result.status} — ${result.error}`
        : `${guest.name} : ${result.status}`,
    ]
      .filter(Boolean)
      .join(" "),
  });
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as StatusBody;
  const allSent = body.allSent === true;
  const guestIds = Array.from(new Set((body.guestIds ?? []).filter(Boolean)));
  if (!allSent && guestIds.length === 0) {
    return jsonError("Aucun invité sélectionné");
  }

  const guests = await prisma.guest.findMany({
    where: allSent
      ? { statusSend: true, phoneFictitious: false }
      : { id: { in: guestIds } },
    select: { id: true, name: true, phone: true, inviteMessageSid: true },
    orderBy: { name: "asc" },
  });

  if (guests.length === 0) {
    return jsonError(
      allSent
        ? "Aucune invitation envoyée à vérifier"
        : "Aucun invité sélectionné",
    );
  }

  let okCount = 0;
  let failCount = 0;
  const updatedGuests = [];
  const failures: string[] = [];

  for (let index = 0; index < guests.length; index += 1) {
    const guest = guests[index];
    const result = await refreshOne(guest);
    if (result.ok) {
      okCount += 1;
      updatedGuests.push(result.guest);
    } else {
      failCount += 1;
      failures.push(result.message);
    }
    if (index < guests.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  const failurePreview =
    failures.length > 0 ? ` — ${failures.slice(0, 3).join(" | ")}` : "";

  return jsonOk({
    okCount,
    failCount,
    failures,
    guests: updatedGuests,
    message: `Statuts Twilio — Mis à jour: ${okCount} | Introuvables / erreurs: ${failCount}${failurePreview}`,
  });
}
