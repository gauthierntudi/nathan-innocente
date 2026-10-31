import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  DescribeCollectionCommand,
  DetectFacesCommand,
  IndexFacesCommand,
  ListFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
  SearchFacesCommand,
  type FaceMatch,
} from "@aws-sdk/client-rekognition";

import {
  albumById,
  canonicalAlbumId,
  displayAlbumById,
  galleryAlbums,
  galleryDuplicateAlbums,
  photoPublicUrl,
  type GalleryAlbumId,
  type GalleryImage,
  type MatchedAlbum,
} from "@/lib/galerie/content";
const globalForRekognition = globalThis as typeof globalThis & {
  galerieIndex?: Promise<void>;
  galerieRekognition?: RekognitionClient;
};

export class GalerieRekognitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalerieRekognitionError";
  }
}

/** Maximum AWS : les mariés dépassent 2 000 correspondances. */
export const SEARCH_MAX_FACES = 4096;
/** Maximum AWS : au-delà de 15, les photos de groupe perdaient leurs petits visages. */
export const INDEX_MAX_FACES = 100;

export type FaceSearchResult =
  | { status: "no_face" }
  | { status: "matched"; albums: MatchedAlbum[] };

/** ExternalImageId Rekognition : "civil__VIS06975.jpg" (max 255). */
export function externalIdFor(albumId: string, filename: string) {
  const safeAlbum = albumId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  const safeFile = filename
    .replace(/^\/+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_.\-]/g, "-")
    .slice(0, 200);
  return `${safeAlbum}__${safeFile}`.slice(0, 255);
}

export function parseExternalId(externalId: string): {
  albumId: GalleryAlbumId;
  filename: string;
} | null {
  const sep = externalId.indexOf("__");
  if (sep <= 0) return null;
  const albumId = externalId.slice(0, sep);
  const filename = externalId.slice(sep + 2);
  if (!filename || !albumById(albumId)) return null;
  return { albumId: albumId as GalleryAlbumId, filename };
}

function collectionId() {
  const id = process.env.REKOGNITION_COLLECTION_ID?.trim() || "mariage-galerie";
  if (!/^[a-zA-Z0-9_.-]{1,255}$/.test(id)) {
    throw new GalerieRekognitionError("L’identifiant de collection Rekognition est invalide.");
  }
  return id;
}

function matchThreshold() {
  const raw = Number(process.env.REKOGNITION_FACE_MATCH_THRESHOLD ?? "80");
  if (!Number.isFinite(raw)) return 80;
  return Math.min(99, Math.max(70, Math.round(raw)));
}

function assertConfigured() {
  const region = process.env.AWS_REGION?.trim();
  const key = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!region || !key || !secret) {
    throw new GalerieRekognitionError("La reconnaissance faciale n’est pas encore configurée.");
  }
  return region;
}

function rekognition() {
  if (!globalForRekognition.galerieRekognition) {
    globalForRekognition.galerieRekognition = new RekognitionClient({
      region: assertConfigured(),
    });
  }
  return globalForRekognition.galerieRekognition;
}

function awsName(error: unknown) {
  if (error && typeof error === "object" && "name" in error) {
    return String(error.name);
  }
  return "";
}

async function ensureCollection() {
  const client = rekognition();
  const CollectionId = collectionId();
  try {
    await client.send(new DescribeCollectionCommand({ CollectionId }));
  } catch (error) {
    if (awsName(error) !== "ResourceNotFoundException") throw error;
    try {
      await client.send(new CreateCollectionCommand({ CollectionId }));
    } catch (createError) {
      if (awsName(createError) !== "ResourceAlreadyExistsException") throw createError;
    }
  }
}

export type IndexedFace = {
  faceId: string;
  externalImageId: string;
};

export async function listIndexedFaces() {
  assertConfigured();
  const faces: IndexedFace[] = [];
  let nextToken: string | undefined;

  do {
    const page = await rekognition().send(
      new ListFacesCommand({
        CollectionId: collectionId(),
        MaxResults: 1000,
        NextToken: nextToken,
      }),
    );
    for (const face of page.Faces ?? []) {
      if (!face.FaceId || !face.ExternalImageId) continue;
      faces.push({ faceId: face.FaceId, externalImageId: face.ExternalImageId });
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return faces;
}

export async function listIndexedExternalIds() {
  const ids = new Set<string>();
  for (const face of await listIndexedFaces()) {
    ids.add(face.externalImageId);
  }
  return ids;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isThrottleError(error: unknown) {
  const name = awsName(error);
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === "ProvisionedThroughputExceededException" ||
    name === "ThrottlingException" ||
    /Provisioned Rate exceeded|Throughput|throttl/i.test(message)
  );
}

/**
 * Supprime des FaceId par petits lots + retry (évite Provisioned Rate exceeded).
 */
export async function deleteFacesByIds(
  faceIds: string[],
  options?: { chunkSize?: number; pauseMs?: number },
) {
  assertConfigured();
  if (faceIds.length === 0) return 0;

  const chunkSize = Math.min(100, Math.max(1, options?.chunkSize ?? 50));
  const pauseMs = Math.max(0, options?.pauseMs ?? 350);
  let deleted = 0;

  for (let i = 0; i < faceIds.length; i += chunkSize) {
    const chunk = faceIds.slice(i, i + chunkSize);
    let attempt = 0;

    while (true) {
      try {
        const result = await rekognition().send(
          new DeleteFacesCommand({
            CollectionId: collectionId(),
            FaceIds: chunk,
          }),
        );
        deleted += result.DeletedFaces?.length ?? chunk.length;
        break;
      } catch (error) {
        if (!isThrottleError(error) || attempt >= 8) throw error;
        attempt += 1;
        const wait = Math.min(12_000, 600 * 2 ** attempt);
        await sleep(wait);
      }
    }

    if (i + chunkSize < faceIds.length && pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  return deleted;
}

export async function indexFaceBytes(
  albumId: string,
  filename: string,
  bytes: Uint8Array,
) {
  assertConfigured();
  await ensureCollection();
  const ExternalImageId = externalIdFor(albumId, filename);
  const indexed = await rekognition().send(
    new IndexFacesCommand({
      CollectionId: collectionId(),
      Image: { Bytes: bytes },
      ExternalImageId,
      MaxFaces: INDEX_MAX_FACES,
      QualityFilter: "NONE",
    }),
  );
  const faceIds = (indexed.FaceRecords ?? []).flatMap((record) =>
    record.Face?.FaceId ? [record.Face.FaceId] : [],
  );
  return {
    externalId: ExternalImageId,
    faces: faceIds.length,
    faceIds,
  };
}

/** Au runtime : vérifie seulement que la collection existe (l’index R2 se fait hors scan). */
async function prepareCollection() {
  assertConfigured();
  await ensureCollection();
}

export function ensureGalleryIndexed() {
  if (!globalForRekognition.galerieIndex) {
    globalForRekognition.galerieIndex = prepareCollection().catch((error) => {
      globalForRekognition.galerieIndex = undefined;
      throw error;
    });
  }
  return globalForRekognition.galerieIndex;
}

function isNoFace(error: unknown) {
  if (awsName(error) !== "InvalidParameterException") return false;
  const message = error instanceof Error ? error.message : "";
  return /no face/i.test(message);
}

/** true s’il y a au moins un visage détectable (pas d’indexation). */
export async function imageHasAnyFace(bytes: Uint8Array): Promise<boolean> {
  assertConfigured();
  try {
    const result = await rekognition().send(
      new DetectFacesCommand({
        Image: { Bytes: bytes },
        Attributes: ["DEFAULT"],
      }),
    );
    return (result.FaceDetails?.length ?? 0) > 0;
  } catch (error) {
    if (isNoFace(error)) return false;
    throw error;
  }
}

function groupMatchesByAlbum(externalIds: string[]): MatchedAlbum[] {
  const photosByAlbum = new Map<GalleryAlbumId, GalleryImage[]>();

  for (const externalId of externalIds) {
    const parsed = parseExternalId(externalId);
    if (!parsed || parsed.albumId in galleryDuplicateAlbums) continue;
    // URL = dossier R2 source ; regroupement UI = album canonique (fusion).
    const sourceAlbum = albumById(parsed.albumId);
    if (!sourceAlbum) continue;
    const displayId = canonicalAlbumId(parsed.albumId) as GalleryAlbumId;
    const displayAlbum = displayAlbumById(displayId) ?? sourceAlbum;

    const src = photoPublicUrl(sourceAlbum, parsed.filename);
    const list = photosByAlbum.get(displayId) ?? [];
    if (list.some((photo) => photo.src === src)) continue;
    list.push({
      src,
      alt: `${displayAlbum.title} — ${parsed.filename}`,
      albumId: displayId,
    });
    photosByAlbum.set(displayId, list);
  }

  const albums: MatchedAlbum[] = [];
  for (const album of galleryAlbums) {
    const photos = photosByAlbum.get(album.id);
    if (!photos?.length) continue;
    albums.push({
      id: album.id,
      title: album.title,
      cover: photos[0]?.src || album.cover,
      photos,
    });
  }
  return albums;
}

export type FaceMatchHit = {
  faceId: string;
  externalImageId: string;
  similarity: number;
};

/** Recherche des visages similaires dans la collection (pour scan + build VIP). */
export async function searchFaceMatches(
  bytes: Uint8Array,
  options?: { threshold?: number; maxFaces?: number },
): Promise<FaceMatchHit[]> {
  await ensureGalleryIndexed();
  const result = await rekognition().send(
    new SearchFacesByImageCommand({
      CollectionId: collectionId(),
      Image: { Bytes: bytes },
      FaceMatchThreshold: options?.threshold ?? matchThreshold(),
      MaxFaces: options?.maxFaces ?? SEARCH_MAX_FACES,
      QualityFilter: "NONE",
    }),
  );

  return toFaceMatchHits(result.FaceMatches);
}

function toFaceMatchHits(matches: FaceMatch[] | undefined) {
  const hits: FaceMatchHit[] = [];
  for (const match of matches ?? []) {
    const faceId = match.Face?.FaceId;
    const externalImageId = match.Face?.ExternalImageId;
    if (!faceId || !externalImageId) continue;
    hits.push({
      faceId,
      externalImageId,
      similarity: match.Similarity ?? 0,
    });
  }
  return hits;
}

/** Recherche à partir d’un visage déjà indexé (réindexation VIP). */
export async function searchFaceMatchesById(
  faceId: string,
  threshold: number,
): Promise<FaceMatchHit[]> {
  assertConfigured();
  const result = await rekognition().send(
    new SearchFacesCommand({
      CollectionId: collectionId(),
      FaceId: faceId,
      FaceMatchThreshold: threshold,
      MaxFaces: SEARCH_MAX_FACES,
    }),
  );
  return toFaceMatchHits(result.FaceMatches);
}

export async function searchGalleryFace(bytes: Uint8Array): Promise<FaceSearchResult> {
  try {
    const hits = await searchFaceMatches(bytes);

    const externalIds: string[] = [];
    const seen = new Set<string>();
    const matchedFaceIds: string[] = [];
    for (const hit of hits) {
      matchedFaceIds.push(hit.faceId);
      if (seen.has(hit.externalImageId)) continue;
      seen.add(hit.externalImageId);
      externalIds.push(hit.externalImageId);
    }

    const { filterExternalIdsForVip, loadHiddenVipManifest } = await import(
      "@/lib/galerie/hidden-vip"
    );
    const vipManifest = await loadHiddenVipManifest();
    const visibleIds = filterExternalIdsForVip(
      externalIds,
      matchedFaceIds,
      vipManifest,
    );

    const { withAmbianceAlbum } = await import("@/lib/galerie/no-face");
    return {
      status: "matched",
      albums: await withAmbianceAlbum(groupMatchesByAlbum(visibleIds)),
    };
  } catch (error) {
    if (isNoFace(error)) {
      const { withAmbianceAlbum } = await import("@/lib/galerie/no-face");
      return { status: "matched", albums: await withAmbianceAlbum([]) };
    }
    throw error;
  }
}
