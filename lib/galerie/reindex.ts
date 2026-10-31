import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  albumById,
  galleryAlbumFolders,
  galleryDuplicateAlbums,
  type GalleryAlbum,
} from "@/lib/galerie/content";
import {
  loadHiddenVipManifest,
  writeHiddenVipManifest,
} from "@/lib/galerie/hidden-vip";
import { compressForRekognition } from "@/lib/galerie/no-face";
import {
  deleteFacesByIds,
  externalIdFor,
  indexFaceBytes,
  isThrottleError,
  listIndexedFaces,
  parseExternalId,
  searchFaceMatchesById,
} from "@/lib/galerie/rekognition";

const STATE_KEY = "galerie-meta/reindex-state.json";
/** Ancienne limite d’IndexFaces : 15 visages = photo probablement tronquée. */
const OLD_MAX_FACES = 15;
/** Marge sous les 60 s de la fonction Vercel. */
const TIME_BUDGET_MS = 40_000;
const PHOTO_CONCURRENCY = 3;
/** Plus strict que le build VIP (85) : on part ici de visages de photos, pas de portraits. */
const VIP_MATCH_THRESHOLD = 90;

type PendingPhoto = { externalId: string; faceIds: string[] };

export type ReindexState = {
  phase: "photos" | "vip" | "done";
  startedAt: string;
  updatedAt: string;
  total: number;
  pending: PendingPhoto[];
  reindexed: string[];
  facesAdded: number;
  failed: { externalId: string; message: string }[];
  orphansRemoved: number;
  renamed: number;
  /** Visages VIP restant à interroger pour retrouver ses nouveaux visages. */
  vipSeeds: string[];
  /** Anciens visages VIP : conservés jusqu’à la mise à jour du manifeste. */
  vipStaleFaceIds: string[];
  vipNewFaceIds: string[];
  vipNewExternalIds: string[];
};

export type ReindexPlan = {
  pending: PendingPhoto[];
  orphanFaceIds: string[];
  orphanPhotos: string[];
  renames: { from: string; to: string }[];
};

export type ReindexStatus = {
  phase: ReindexState["phase"];
  total: number;
  done: number;
  facesAdded: number;
  failed: number;
  failedSample: string[];
  orphansRemoved: number;
  renamed: number;
  vipRemaining: number;
  updatedAt: string;
};

export class ReindexConflictError extends Error {}

const BUCKET = () => process.env.R2_BUCKET?.trim() || "mariage";
const ACCOUNT_ID = () =>
  process.env.R2_ACCOUNT_ID?.trim() ||
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  "2db1464f25a468e66bd514b16785ecee";

function r2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY manquants.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID()}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function albumPrefix(album: GalleryAlbum) {
  return album.prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
}

async function listAlbumFilenames(client: S3Client, album: GalleryAlbum) {
  const prefix = albumPrefix(album);
  const filenames: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET(),
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const item of page.Contents ?? []) {
      const filename = item.Key?.slice(prefix.length);
      if (filename && !filename.includes("/")) filenames.push(filename);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return filenames;
}

async function readState(client: S3Client): Promise<ReindexState | null> {
  try {
    const obj = await client.send(
      new GetObjectCommand({ Bucket: BUCKET(), Key: STATE_KEY }),
    );
    const text = await obj.Body?.transformToString("utf8");
    return text ? (JSON.parse(text) as ReindexState) : null;
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") return null;
    throw error;
  }
}

async function writeState(client: S3Client, state: ReindexState) {
  state.updatedAt = new Date().toISOString();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: STATE_KEY,
      Body: JSON.stringify(state),
      ContentType: "application/json",
    }),
  );
}

function toStatus(state: ReindexState): ReindexStatus {
  return {
    phase: state.phase,
    total: state.total,
    done: state.total - state.pending.length,
    facesAdded: state.facesAdded,
    failed: state.failed.length,
    failedSample: state.failed
      .slice(0, 5)
      .map((item) => `${item.externalId} : ${item.message}`),
    orphansRemoved: state.orphansRemoved,
    renamed: state.renamed,
    vipRemaining: state.vipSeeds.length,
    updatedAt: state.updatedAt,
  };
}

async function withThrottleRetry<T>(run: () => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isThrottleError(error) || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
    }
  }
}

/** Lecture seule : photos tronquées, entrées sans fichier R2, noms à réparer. */
export async function planReindex(client = r2Client()): Promise<ReindexPlan> {
  const faceIdsByPhoto = new Map<string, string[]>();
  for (const face of await listIndexedFaces()) {
    const list = faceIdsByPhoto.get(face.externalImageId) ?? [];
    list.push(face.faceId);
    faceIdsByPhoto.set(face.externalImageId, list);
  }

  // externalId → nom réel sur R2 (l’externalId remplace par exemple « ( » par « - »).
  const filenameByExternalId = new Map<string, string>();
  for (const album of galleryAlbumFolders) {
    for (const filename of await listAlbumFilenames(client, album)) {
      filenameByExternalId.set(externalIdFor(album.id, filename), filename);
    }
  }

  const plan: ReindexPlan = {
    pending: [],
    orphanFaceIds: [],
    orphanPhotos: [],
    renames: [],
  };

  for (const [externalId, faceIds] of faceIdsByPhoto) {
    const parsed = parseExternalId(externalId);
    if (!parsed || parsed.albumId in galleryDuplicateAlbums) continue;

    const realFilename = filenameByExternalId.get(externalId);
    if (!realFilename) {
      plan.orphanFaceIds.push(...faceIds);
      plan.orphanPhotos.push(externalId);
      continue;
    }

    if (realFilename !== parsed.filename) {
      const prefix = albumPrefix(albumById(parsed.albumId)!);
      plan.renames.push({
        from: `${prefix}${realFilename}`,
        to: `${prefix}${parsed.filename}`,
      });
    }

    if (faceIds.length === OLD_MAX_FACES) {
      plan.pending.push({ externalId, faceIds });
    }
  }

  return plan;
}

export async function getReindexStatus() {
  const state = await readState(r2Client());
  return state ? toStatus(state) : null;
}

export async function startReindex() {
  const client = r2Client();
  const existing = await readState(client);
  if (existing && existing.phase !== "done") {
    throw new ReindexConflictError("Une réindexation est déjà en cours.");
  }

  const plan = await planReindex(client);

  // Copie plutôt que déplacement : l’original reste en place.
  for (const { from, to } of plan.renames) {
    await client.send(
      new CopyObjectCommand({
        Bucket: BUCKET(),
        Key: to,
        CopySource: `${BUCKET()}/${from.split("/").map(encodeURIComponent).join("/")}`,
      }),
    );
  }

  const vip = await loadHiddenVipManifest();
  const vipFaceIds = new Set(vip.faceIds);
  await deleteFacesByIds(plan.orphanFaceIds.filter((id) => !vipFaceIds.has(id)));

  const now = new Date().toISOString();
  const state: ReindexState = {
    phase: "photos",
    startedAt: now,
    updatedAt: now,
    total: plan.pending.length,
    pending: plan.pending,
    reindexed: [],
    facesAdded: 0,
    failed: [],
    orphansRemoved: plan.orphanPhotos.length,
    renamed: plan.renames.length,
    vipSeeds: [...vip.faceIds],
    vipStaleFaceIds: plan.orphanFaceIds.filter((id) => vipFaceIds.has(id)),
    vipNewFaceIds: [],
    vipNewExternalIds: [],
  };
  await writeState(client, state);
  return toStatus(state);
}

/** Exportée pour pouvoir tester une photo seule sur une collection de test. */
export async function reindexPhoto(client: S3Client, photo: PendingPhoto, vipFaceIds: Set<string>) {
  const parsed = parseExternalId(photo.externalId);
  const album = parsed && albumById(parsed.albumId);
  if (!parsed || !album) throw new Error("Album inconnu");

  const obj = await client.send(
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: `${albumPrefix(album)}${parsed.filename}`,
    }),
  );
  const raw = await obj.Body?.transformToByteArray();
  if (!raw?.byteLength) throw new Error("Objet R2 vide");

  const bytes = await compressForRekognition(raw);
  // Indexer avant de supprimer : un échec laisse les anciens visages en place.
  const indexed = await withThrottleRetry(() =>
    indexFaceBytes(parsed.albumId, parsed.filename, bytes),
  );
  if (indexed.faces === 0) throw new Error("Aucun visage réindexé");

  // Rekognition redonne le même FaceId pour un visage déjà indexé dans la même
  // image : ne supprimer que ceux qui ne sont pas revenus.
  const kept = new Set(indexed.faceIds);
  const obsolete = photo.faceIds.filter((id) => !kept.has(id));
  await deleteFacesByIds(
    obsolete.filter((id) => !vipFaceIds.has(id)),
    { pauseMs: 0 },
  );

  return {
    added: indexed.faces - (photo.faceIds.length - obsolete.length),
    staleVipFaceIds: obsolete.filter((id) => vipFaceIds.has(id)),
  };
}

async function stepPhotos(client: S3Client, state: ReindexState, deadline: number) {
  const vip = await loadHiddenVipManifest();
  const vipFaceIds = new Set(vip.faceIds);

  async function worker() {
    while (Date.now() < deadline) {
      const photo = state.pending.shift();
      if (!photo) return;
      try {
        const result = await reindexPhoto(client, photo, vipFaceIds);
        state.reindexed.push(photo.externalId);
        state.facesAdded += result.added;
        state.vipStaleFaceIds.push(...result.staleVipFaceIds);
      } catch (error) {
        state.failed.push({
          externalId: photo.externalId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: PHOTO_CONCURRENCY }, () => worker()));
  if (state.pending.length === 0) state.phase = "vip";
}

async function stepVip(state: ReindexState, deadline: number) {
  const reindexed = new Set(state.reindexed);
  const stale = new Set(state.vipStaleFaceIds);
  const newFaceIds = new Set(state.vipNewFaceIds);
  const newExternalIds = new Set(state.vipNewExternalIds);

  while (state.vipSeeds.length > 0 && Date.now() < deadline) {
    const hits = await withThrottleRetry(() =>
      searchFaceMatchesById(state.vipSeeds[0]!, VIP_MATCH_THRESHOLD),
    );
    for (const hit of hits) {
      // Seules les photos réindexées ont de nouveaux visages à rattacher au VIP.
      if (!reindexed.has(hit.externalImageId) || stale.has(hit.faceId)) continue;
      newFaceIds.add(hit.faceId);
      newExternalIds.add(hit.externalImageId);
    }
    state.vipSeeds.shift();
  }

  state.vipNewFaceIds = [...newFaceIds];
  state.vipNewExternalIds = [...newExternalIds];
  if (state.vipSeeds.length > 0) return;

  const manifest = await loadHiddenVipManifest();
  if (manifest.faceIds.length > 0) {
    await writeHiddenVipManifest({
      ...manifest,
      updatedAt: new Date().toISOString(),
      faceIds: [
        ...manifest.faceIds.filter((id) => !stale.has(id)),
        ...state.vipNewFaceIds,
      ].sort(),
      externalIds: [...manifest.externalIds, ...state.vipNewExternalIds].sort(),
    });
  }
  await deleteFacesByIds(state.vipStaleFaceIds);
  state.phase = "done";
}

/** Traite un lot puis rend la main : à rappeler jusqu’à `phase === "done"`. */
export async function stepReindex() {
  const client = r2Client();
  const state = await readState(client);
  if (!state) throw new ReindexConflictError("Aucune réindexation en cours.");
  if (state.phase === "done") return toStatus(state);

  const deadline = Date.now() + TIME_BUDGET_MS;
  if (state.phase === "photos") await stepPhotos(client, state, deadline);
  if (state.phase === "vip") await stepVip(state, deadline);

  await writeState(client, state);
  return toStatus(state);
}
