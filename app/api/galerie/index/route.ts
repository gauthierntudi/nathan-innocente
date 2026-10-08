import { jsonError, jsonOk } from "@/lib/api-response";
import { ensureGalleryIndexed, GalerieRekognitionError } from "@/lib/galerie/rekognition";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    await ensureGalleryIndexed();
    return jsonOk({ ready: true });
  } catch (error) {
    if (error instanceof GalerieRekognitionError) {
      return jsonError(error.message, 503);
    }
    console.error("[galerie] indexation Rekognition impossible");
    return jsonError("La galerie n’a pas pu être préparée.", 500);
  }
}
