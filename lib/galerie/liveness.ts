import {
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
  RekognitionClient,
  type GetFaceLivenessSessionResultsCommandOutput,
} from "@aws-sdk/client-rekognition";
import { GetFederationTokenCommand, STSClient } from "@aws-sdk/client-sts";

import type { MatchedAlbum } from "@/lib/galerie/content";
import { GalerieRekognitionError, searchGalleryFace } from "@/lib/galerie/rekognition";

const LIVENESS_SESSION_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: ["rekognition:StartFaceLivenessSession"],
      Resource: ["*"],
    },
  ],
});

export type LivenessCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
};

function assertAwsConfigured() {
  const key = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!key || !secret) {
    throw new GalerieRekognitionError("La reconnaissance faciale n’est pas encore configurée.");
  }
}

/** Région Face Liveness (eu-west-3 n’est pas supporté). */
export function livenessRegion() {
  return process.env.AWS_LIVENESS_REGION?.trim() || "us-east-1";
}

/** Seuil bas-moyen : galerie mariage, pas banque. 90 refuse trop de vrais invités. */
function livenessThreshold() {
  const raw = Number(process.env.REKOGNITION_LIVENESS_THRESHOLD ?? "70");
  if (!Number.isFinite(raw)) return 70;
  return Math.min(100, Math.max(50, Math.round(raw)));
}

function livenessClient() {
  assertAwsConfigured();
  return new RekognitionClient({ region: livenessRegion() });
}

function stsClient() {
  assertAwsConfigured();
  return new STSClient({ region: livenessRegion() });
}

export async function createLivenessSession() {
  const created = await livenessClient().send(
    new CreateFaceLivenessSessionCommand({
      Settings: {
        AuditImagesLimit: 0,
      },
    }),
  );

  if (!created.SessionId) {
    throw new GalerieRekognitionError("Impossible de créer la session de liveness.");
  }

  const credentials = await createStreamingCredentials();
  return {
    sessionId: created.SessionId,
    region: livenessRegion(),
    credentials,
  };
}

async function createStreamingCredentials(): Promise<LivenessCredentials> {
  const token = await stsClient().send(
    new GetFederationTokenCommand({
      Name: "galerie-liveness",
      DurationSeconds: 900,
      Policy: LIVENESS_SESSION_POLICY,
    }),
  );

  const creds = token.Credentials;
  if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
    throw new GalerieRekognitionError(
      "Impossible d’émettre des identifiants temporaires pour le liveness. Ajoutez sts:GetFederationToken et rekognition:StartFaceLivenessSession à l’utilisateur AWS.",
    );
  }

  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration,
  };
}

export type LivenessCompleteResult =
  | { status: "not_live"; confidence: number; sessionStatus: string }
  | { status: "session_failed"; confidence: number; sessionStatus: string }
  | { status: "no_face"; confidence: number; sessionStatus: string }
  | { status: "matched"; confidence: number; albums: MatchedAlbum[] };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLivenessResults(sessionId: string) {
  let last: GetFaceLivenessSessionResultsCommandOutput | undefined;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    last = await livenessClient().send(
      new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }),
    );
    if (last.Status !== "CREATED" && last.Status !== "IN_PROGRESS") {
      return last;
    }
    await sleep(400 + attempt * 200);
  }

  return last!;
}

export async function completeLivenessSession(sessionId: string): Promise<LivenessCompleteResult> {
  const results = await fetchLivenessResults(sessionId);
  const confidence = results.Confidence ?? 0;
  const threshold = livenessThreshold();
  const sessionStatus = results.Status ?? "UNKNOWN";

  console.info("[galerie] liveness result", {
    sessionStatus,
    confidence: Math.round(confidence * 10) / 10,
    threshold,
    hasReference: Boolean(results.ReferenceImage?.Bytes?.length),
  });

  if (sessionStatus === "FAILED" || sessionStatus === "EXPIRED") {
    return { status: "session_failed", confidence, sessionStatus };
  }

  if (sessionStatus !== "SUCCEEDED" || confidence < threshold) {
    return { status: "not_live", confidence, sessionStatus };
  }

  const { withAmbianceAlbum } = await import("@/lib/galerie/no-face");

  const raw = results.ReferenceImage?.Bytes;
  if (!raw || raw.length < 1000) {
    return {
      status: "matched",
      confidence,
      albums: await withAmbianceAlbum([]),
    };
  }

  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const search = await searchGalleryFace(bytes);
  if (search.status === "no_face") {
    return {
      status: "matched",
      confidence,
      albums: await withAmbianceAlbum([]),
    };
  }
  return { status: "matched", confidence, albums: search.albums };
}
