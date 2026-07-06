import { NextResponse } from "next/server";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  buildContentDispositionAttachment,
  getCeremonyDressCodeDownloadUrl,
  getDressCodeFilename,
  getGuestDressCodeDownloadUrl,
} from "@/lib/dress-code-urls";

export async function GET(request: Request) {
  const ceremonyIdParam = new URL(request.url).searchParams.get("ceremonyId");
  const ceremonyId =
    ceremonyIdParam && isCeremonyId(ceremonyIdParam)
      ? (ceremonyIdParam as CeremonyId)
      : null;

  const sourceUrl = ceremonyId
    ? getCeremonyDressCodeDownloadUrl(ceremonyId)
    : getGuestDressCodeDownloadUrl(ceremonyId ? [{ id: ceremonyId }] : []);

  const filename = getDressCodeFilename(ceremonyId);

  try {
    const upstream = await fetch(sourceUrl, { cache: "no-store" });

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, message: "Dress code introuvable." },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const fileBuffer = await upstream.arrayBuffer();

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
        "Content-Disposition": buildContentDispositionAttachment(filename),
        "Cache-Control": "private, no-store",
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
