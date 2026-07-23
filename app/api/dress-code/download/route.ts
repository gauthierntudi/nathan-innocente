import { NextResponse } from "next/server";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  buildContentDispositionAttachment,
  buildContentDispositionInline,
  getCeremonyDressCodeDownloadUrl,
  getDressCodeFilename,
  getGuestDressCodeDownloadUrl,
} from "@/lib/dress-code-urls";
import { findGuestBySession, markDressCodeDownloaded } from "@/lib/guests";
import { prisma } from "@/lib/prisma";
import { getSessionCookies } from "@/lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ceremonyIdParam = url.searchParams.get("ceremonyId");
  const ceremonyId =
    ceremonyIdParam && isCeremonyId(ceremonyIdParam)
      ? (ceremonyIdParam as CeremonyId)
      : null;
  const inlineView = url.searchParams.get("view") === "1";

  const { phone, deviceId } = await getSessionCookies();
  const guest = phone || deviceId ? await findGuestBySession(phone, deviceId) : null;

  let honorGuest = false;
  if (guest) {
    const ceremonyCount = await prisma.guestCeremony.count({
      where: { guestId: guest.id },
    });
    honorGuest = ceremonyCount > 1;
  }

  const dressOptions = { honorGuest };

  const sourceUrl = ceremonyId
    ? getCeremonyDressCodeDownloadUrl(ceremonyId, dressOptions)
    : getGuestDressCodeDownloadUrl(
        ceremonyId ? [{ id: ceremonyId }] : [],
        dressOptions,
      );

  const filename = getDressCodeFilename(ceremonyId, dressOptions);

  try {
    const upstream = await fetch(sourceUrl, { cache: "no-store" });

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, message: "Dress code introuvable." },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const fileBuffer = await upstream.arrayBuffer();
    let firstDownload = false;

    if (guest) {
      const result = await markDressCodeDownloaded(guest.id, ceremonyId);
      firstDownload = result.recorded;
    }

    return new NextResponse(fileBuffer, {
      headers: {
        // view=1 → PDF inline pour aperçu ; sinon octet-stream (Safari)
        "Content-Type": inlineView ? "application/pdf" : "application/octet-stream",
        "Content-Disposition": inlineView
          ? buildContentDispositionInline(filename)
          : buildContentDispositionAttachment(filename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Dress-Code-First-Download": firstDownload ? "1" : "0",
        "X-Dress-Code-Honor": honorGuest ? "1" : "0",
        "X-Dress-Code-Filename": encodeURIComponent(filename),
      },
    });
  } catch (error) {
    console.error("GET /api/dress-code/download", error);
    return NextResponse.json(
      { success: false, message: "Impossible de récupérer le dress code." },
      { status: 500 },
    );
  }
}
