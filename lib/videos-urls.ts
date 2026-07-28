const DEFAULT_BASE_URL =
  "https://pub-5ff2b676c3a745bb957c2e00cc6690d6.r2.dev/videos";

const VIDEOS_BASE_URL = (
  process.env.NEXT_PUBLIC_VIDEOS_BASE_URL ?? DEFAULT_BASE_URL
).replace(/\/$/, "");

const DEFAULT_ETERNITE_FILE =
  process.env.NEXT_PUBLIC_ETERNITE_VIDEO_FILE ?? "reelss.mp4";

export function buildVideoUrl(filename: string): string {
  const cleanFilename = filename.replace(/^\//, "");
  return `${VIDEOS_BASE_URL}/${encodeURIComponent(cleanFilename)}`;
}

/** Vidéo de fond du slide « Vers l’éternité » (dossier R2 `videos/`). */
export function getEterniteVideoUrl(): string {
  const fullUrl = process.env.NEXT_PUBLIC_ETERNITE_VIDEO_URL?.trim();
  if (fullUrl) return fullUrl;
  return buildVideoUrl(DEFAULT_ETERNITE_FILE);
}
