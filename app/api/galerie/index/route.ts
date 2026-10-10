import { after } from "next/server";

import { jsonError, jsonOk } from "@/lib/api-response";
import { ensureNoFaceManifest } from "@/lib/galerie/no-face";
import { ensureGalleryIndexed, GalerieRekognitionError } from "@/lib/galerie/rekognition";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    await ensureGalleryIndexed();

    // Albums déjà indexés : reconstruit Ambiance en arrière-plan si besoin.
    after(async () => {
      try {
        await ensureNoFaceManifest();
      } catch (error) {
        console.error("[galerie] ensure no-face impossible", error);
      }
    });

    return jsonOk({ ready: true });
  } catch (error) {
    if (error instanceof GalerieRekognitionError) {
      return jsonError(error.message, 503);
    }
    console.error("[galerie] indexation Rekognition impossible");
    return jsonError("La galerie n’a pas pu être préparée.", 500);
  }
}
