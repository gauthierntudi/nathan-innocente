import { NextResponse } from "next/server";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  buildContentDispositionAttachment,
  buildContentDispositionInline,
} from "@/lib/dress-code-urls";
import {
  getCeremonyInvitationUrl,
  getInvitationFilename,
} from "@/lib/invitation-urls";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ceremonyIdParam = url.searchParams.get("ceremonyId");

  if (!ceremonyIdParam || !isCeremonyId(ceremonyIdParam)) {
    return NextResponse.json(
      { success: false, message: "Cérémonie invalide." },
      { status: 400 },
    );
  }

  const ceremonyId = ceremonyIdParam as CeremonyId;
  const filename = getInvitationFilename(ceremonyId);
  const sourceUrl = getCeremonyInvitationUrl(ceremonyId);

  if (!filename || !sourceUrl) {
    return NextResponse.json(
      { success: false, message: "Invitation indisponible pour cette cérémonie." },
      { status: 404 },
    );
  }

  const inlineView = url.searchParams.get("view") === "1";

  try {
    const upstream = await fetch(sourceUrl, { cache: "no-store" });

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, message: "Invitation introuvable." },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const fileBuffer = await upstream.arrayBuffer();

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": inlineView ? "application/pdf" : "application/octet-stream",
        "Content-Disposition": inlineView
          ? buildContentDispositionInline(filename)
          : buildContentDispositionAttachment(filename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Invitation-Filename": encodeURIComponent(filename),
      },
    });
  } catch (error) {
    console.error("GET /api/invitation/download", error);
    return NextResponse.json(
      { success: false, message: "Impossible de récupérer l'invitation." },
      { status: 500 },
    );
  }
}
