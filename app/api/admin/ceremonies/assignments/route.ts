import { jsonError, jsonOk } from "@/lib/api-response";
import {
  assignGuestToCeremony,
  assignGuestsBulk,
  removeGuestFromCeremony,
} from "@/lib/admin/ceremonies";
import { isCeremonyId } from "@/lib/admin/ceremony-types";
import { requireAdmin } from "@/lib/admin-auth";

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      guestId?: string;
      guestIds?: string[];
      ceremonyId?: string;
      tableId?: string | null;
    };

    if (!body.ceremonyId || !isCeremonyId(body.ceremonyId)) {
      return jsonError("Cérémonie invalide");
    }

    if (body.guestIds?.length) {
      await assignGuestsBulk({
        guestIds: body.guestIds,
        ceremonyId: body.ceremonyId,
        tableId: body.tableId,
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
    });

    return jsonOk({});
  } catch (error) {
    if (error instanceof Error && error.message === "TABLE_CEREMONY_MISMATCH") {
      return jsonError("Cette table n'appartient pas à la cérémonie");
    }
    return jsonError("Non autorisé", 401);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
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
  } catch {
    return jsonError("Non autorisé", 401);
  }
}
