import { jsonError, jsonOk } from "@/lib/api-response";
import { GalerieRekognitionError } from "@/lib/galerie/rekognition";
import { createLivenessSession } from "@/lib/galerie/liveness";

export const runtime = "nodejs";
export const maxDuration = 30;

const recentHits = new Map<string, number[]>();

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (recentHits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 20) {
    recentHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentHits.set(ip, recent);
  return false;
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request))) {
    return jsonError("Trop de tentatives. Patientez un instant.", 429);
  }

  try {
    const session = await createLivenessSession();
    return jsonOk({
      sessionId: session.sessionId,
      region: session.region,
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken,
        expiration: session.credentials.expiration?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof GalerieRekognitionError) {
      return jsonError(error.message, 503);
    }
    console.error("[galerie] création session liveness impossible", error);
    return jsonError("Le contrôle anti-fraude n’a pas pu démarrer. Réessayez.", 500);
  }
}
