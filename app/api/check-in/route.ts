import { jsonError, jsonOk } from "@/lib/api-response";
import { buildPassAccessPayload } from "@/lib/pass-access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
    if (!token) {
      return jsonError("Pass invalide", 400);
    }

    const guest = await prisma.guest.findUnique({ where: { token } });
    if (!guest) {
      return jsonError("Pass introuvable", 404);
    }

    const payload = await buildPassAccessPayload(guest);
    if (!payload.valid) {
      return jsonError(payload.invalidReason ?? "Pass non valide", 403);
    }

    return jsonOk({
      guestName: payload.guestName,
      guestGenre: payload.guestGenre,
      numGuests: payload.numGuests,
      ceremonies: payload.confirmedCeremonies,
      valid: true,
    });
  } catch (error) {
    console.error("GET /api/check-in", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Une erreur technique est survenue.",
      500,
    );
  }
}
