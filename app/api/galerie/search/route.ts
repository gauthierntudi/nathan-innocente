import { jsonError, jsonOk } from "@/lib/api-response";
import { GalerieRekognitionError, searchGalleryFace } from "@/lib/galerie/rekognition";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 2_500_000;
const recentHits = new Map<string, number[]>();

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (recentHits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 40) {
    recentHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentHits.set(ip, recent);
  return false;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request))) {
    return jsonError("Trop de tentatives. Patientez un instant.", 429);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength < 2_000 || bytes.byteLength > MAX_BYTES || !isJpeg(bytes)) {
    return jsonError("Image du visage illisible.");
  }

  try {
    const result = await searchGalleryFace(bytes);
    if (result.status === "no_face") return jsonOk({ status: "no_face" });
    return jsonOk({ status: "matched", albums: result.albums });
  } catch (error) {
    if (error instanceof GalerieRekognitionError) {
      return jsonError(error.message, 503);
    }
    console.error("[galerie] recherche Rekognition impossible");
    return jsonError("Le scan n’a pas pu aboutir. Réessayez.", 500);
  }
}
