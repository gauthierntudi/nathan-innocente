export const galleryPath = "/galerie" as const;

const DEFAULT_R2_BASE =
  "https://pub-5ff2b676c3a745bb957c2e00cc6690d6.r2.dev";

export function galleryR2BaseUrl() {
  return (
    process.env.NEXT_PUBLIC_GALERIE_BASE_URL?.trim().replace(/\/$/, "") ||
    DEFAULT_R2_BASE
  );
}

export type GalleryAlbum = {
  id: string;
  title: string;
  /** Préfixe R2 dans le bucket mariage, ex. "galeries/" */
  prefix: string;
  /** Image de couverture (URL absolue ou chemin local) */
  cover: string;
};

/**
 * Tous les dossiers R2 physiques (upload / index / URL).
 * Les albums « secondaires » sont fusionnés à l’affichage via `galleryAlbumMerge`.
 */
export const galleryAlbumFolders = [
  {
    id: "civil",
    title: "Mariage Civil",
    prefix: "galeries/",
    cover: "/img/5.jpg",
  },
  {
    id: "eglise",
    title: "Eglise",
    prefix: "galeries-2/",
    cover: "/img/1001.jpg",
  },
  {
    id: "soiree",
    title: "Soirée",
    prefix: "galeries-3/",
    cover: "/img/08.jpg",
  },
  {
    id: "pre-dot",
    title: "Pré-dot",
    prefix: "galeries-4/",
    cover: "/img/LUK_0750.jpg",
  },
  {
    id: "cocktail",
    title: "Cocktail",
    prefix: "galeries-5/",
    cover: "/img/03.jpg",
  },
  {
    id: "shoot-maries",
    title: "Shoot avec les mariés",
    prefix: "galeries-6/",
    cover: "/img/04.jpg",
  },
  {
    id: "full-preparation",
    title: "Full préparation",
    prefix: "galeries-7/",
    cover: "/img/2.jpg",
  },
  {
    id: "civil-autres",
    title: "Civil autres photos",
    prefix: "galeries-8/",
    cover: "/img/5.jpg",
  },
  {
    id: "civil-moments",
    title: "Civil moments",
    prefix: "galeries-9/",
    cover: "/img/3.jpg",
  },
  {
    id: "civil-autres-instants",
    title: "Civil autres instants",
    prefix: "galeries-10/",
    cover: "/img/4.jpg",
  },
  {
    id: "nathan-chez-inno",
    title: "Nathan chez Inno",
    prefix: "galeries-11/",
    cover: "/img/02.jpg",
  },
  {
    id: "autres-photos-soiree",
    title: "Autres photos soirée",
    prefix: "galeries-12/",
    cover: "/img/5.jpg",
  },
  {
    id: "autres-instants-civil",
    title: "Autres instants civil",
    prefix: "galeries-13/",
    cover: "/img/5.jpg",
  },
  {
    id: "autres-photo-nathan-chez-inno",
    title: "Autres photo Nathan chez Inno",
    prefix: "galeries-14/",
    cover: "/img/5.jpg",
  },
  {
    id: "coutumier",
    title: "Coutumier",
    prefix: "galeries-15/",
    cover: "/img/5.jpg",
  },
] as const satisfies readonly GalleryAlbum[];

/**
 * Fusion affichage scan : id source → id album visible.
 * Les photos restent dans leur dossier R2 ; seul le regroupement UI change.
 */
export const galleryAlbumMerge: Record<string, string> = {
  civil: "civil",
  "civil-autres": "civil",
  "civil-moments": "civil",
  "civil-autres-instants": "civil",
  "autres-instants-civil": "civil",
  soiree: "soiree",
  "autres-photos-soiree": "soiree",
  "nathan-chez-inno": "nathan-chez-inno",
  "autres-photo-nathan-chez-inno": "nathan-chez-inno",
};

const MERGED_AWAY = new Set(
  Object.entries(galleryAlbumMerge)
    .filter(([source, canonical]) => source !== canonical)
    .map(([source]) => source),
);

/**
 * Dossiers R2 copiés à l’identique : ignorés au scan et à la réindexation.
 * id doublon → id du dossier conservé.
 */
export const galleryDuplicateAlbums: Record<string, string> = {
  "autres-instants-civil": "civil-autres-instants",
  "autres-photo-nathan-chez-inno": "nathan-chez-inno",
};

/** Albums visibles après scan (fusion appliquée). */
export const galleryAlbums = galleryAlbumFolders.filter(
  (album) => !MERGED_AWAY.has(album.id),
);

/** @deprecated Alias — préférer galleryAlbumFolders pour upload/index. */
export const galleryAlbumsAll = galleryAlbumFolders;

export type GalleryAlbumId =
  | (typeof galleryAlbumFolders)[number]["id"]
  | "ambiance";

export type GalleryImage = {
  src: string;
  alt: string;
  albumId: GalleryAlbumId;
};

export type MatchedAlbum = {
  id: GalleryAlbumId;
  title: string;
  cover: string;
  photos: GalleryImage[];
};

/** Mur d’accueil (teaser) — pas les albums complets. */
export const galleryWallImages = [
  { src: "/img/5.jpg", alt: "Nathan et Innocente" },
  { src: "/img/1001.jpg", alt: "Nathan et Innocente" },
  { src: "/img/04.jpg", alt: "Nathan et Innocente" },
  { src: "/img/3.jpg", alt: "Nathan et Innocente" },
  { src: "/img/02.jpg", alt: "Nathan et Innocente" },
  { src: "/img/LAB3-A-26--30.jpg", alt: "Nathan et Innocente" },
  { src: "/img/2.jpg", alt: "Nathan et Innocente" },
  { src: "/img/4.jpg", alt: "Nathan et Innocente" },
  { src: "/img/08.jpg", alt: "Nathan et Innocente" },
  { src: "/img/LUK_0750.jpg", alt: "Nathan et Innocente" },
  { src: "/img/0T8A5173.jpg", alt: "Nathan et Innocente" },
  { src: "/img/0T8A5174.jpg", alt: "Nathan et Innocente" },
  { src: "/img/0T8A5252.jpg", alt: "Nathan et Innocente" },
  { src: "/img/LAB3-A-26--27.jpg", alt: "Nathan et Innocente" },
  { src: "/img/03.jpg", alt: "Nathan et Innocente" },
  { src: "/img/05.jpg", alt: "Nathan et Innocente" },
  { src: "/img/06.jpg", alt: "Nathan et Innocente" },
  { src: "/img/LAB3-A-26--28%202.jpg", alt: "Nathan et Innocente" },
] as const;

/** @deprecated Utiliser galleryWallImages — conservé pour imports legacy. */
export const galleryImages = galleryWallImages;

/** Dossier R2 physique (upload / index / URL). */
export function albumById(id: string) {
  return galleryAlbumFolders.find((album) => album.id === id);
}

/** Album affiché après fusion (civil, soiree, …). */
export function displayAlbumById(id: string) {
  const canonical = canonicalAlbumId(id);
  return galleryAlbums.find((album) => album.id === canonical);
}

export function canonicalAlbumId(id: string): string {
  return galleryAlbumMerge[id] ?? id;
}

export function albumByPrefix(prefix: string) {
  const normalized = prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
  return galleryAlbumFolders.find((album) => album.prefix === normalized);
}

export function photoPublicUrl(album: GalleryAlbum, filename: string) {
  const key = `${album.prefix}${filename}`.replace(/\/{2,}/g, "/");
  return `${galleryR2BaseUrl()}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
