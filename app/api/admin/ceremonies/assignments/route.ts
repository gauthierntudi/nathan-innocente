import { Prisma } from "@prisma/client";

import { jsonError, jsonOk } from "@/lib/api-response";
import {
  assignGuestToCeremony,
  assignGuestsBulk,
  removeGuestFromCeremony,
} from "@/lib/admin/ceremonies";
import { isCeremonyId } from "@/lib/admin/ceremony-types";
import { requireAdmin } from "@/lib/admin-auth";

function assignmentErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return jsonError("Non autorisé", 401);
  }
  if (error instanceof Error && error.message === "TABLE_CEREMONY_MISMATCH") {
    return jsonError("Cette table n'appartient pas à la cérémonie");
  }
  if (error instanceof Error && error.message === "GROUP_CEREMONY_MISMATCH") {
    return jsonError("Ce groupe n'appartient pas à la cérémonie");
  }
  if (error instanceof Error && error.message === "GUEST_NOT_FOUND") {
    return jsonError("Invité introuvable", 404);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return jsonError(
        "Référence invalide (invité, cérémonie, table ou groupe).",
      );
    }
    if (error.code === "P2002") {
      return jsonError("Cet invité est déjà affecté à cette cérémonie.");
    }
    if (error.code === "P2025") {
      return jsonError("Affectation introuvable.");
    }
  }

  console.error("[admin/ceremonies/assignments]", error);
  return jsonError(
    error instanceof Error && error.message
      ? `Affectation impossible : ${error.message}`
      : "Affectation impossible",
  );
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  try {
    const body = (await request.json()) as {
      guestId?: string;
      guestIds?: string[];
      ceremonyId?: string;
      tableId?: string | null;
      groupId?: string | null;
      numGuests?: number | null;
    };

    if (!body.ceremonyId || !isCeremonyId(body.ceremonyId)) {
      return jsonError("Cérémonie invalide");
    }

    if (body.guestIds?.length) {
      await assignGuestsBulk({
        guestIds: body.guestIds,
        ceremonyId: body.ceremonyId,
        tableId: body.tableId,
        groupId: body.groupId,
        numGuests: body.numGuests,
      });
      return jsonOk({});
    }

    if (!body.guestId) {
      return jsonError("Invité requis");
    }

    await assignGuestToCeremony({
      guestId: body.guestId,
      ceremonyId: body.ceremonyId,
      tableId: body.tableId,
      groupId: body.groupId,
      numGuests: body.numGuests,
    });

    return jsonOk({});
  } catch (error) {
    return assignmentErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  try {
    const body = (await request.json()) as {
      guestId?: string;
      ceremonyId?: string;
    };

    if (!body.guestId || !body.ceremonyId || !isCeremonyId(body.ceremonyId)) {
      return jsonError("Données invalides");
    }

    await removeGuestFromCeremony({
      guestId: body.guestId,
      ceremonyId: body.ceremonyId,
    });

    return jsonOk({});
  } catch (error) {
    return assignmentErrorResponse(error);
  }
}
