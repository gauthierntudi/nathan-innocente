const DEFAULT_BASE_URL =
  "https://pub-5ff2b676c3a745bb957c2e00cc6690d6.r2.dev/demande-mariage";

const DEMANDE_MARIAGE_BASE_URL = (
  process.env.NEXT_PUBLIC_DEMANDE_MARIAGE_BASE_URL ?? DEFAULT_BASE_URL
).replace(/\/$/, "");

/** Fichiers présents dans le dossier R2 `demande-mariage/`. */
const DEFAULT_FILES = [
  "0T8A5173.jpg",
  "0T8A5174.jpg",
  "0T8A5178.jpg",
  "0T8A5185.jpg",
  "0T8A5203.jpg",
  "0T8A5252.jpg",
] as const;

function readConfiguredFiles(): string[] {
  const fromEnv = process.env.NEXT_PUBLIC_DEMANDE_MARIAGE_FILES?.trim();
  if (!fromEnv) return [...DEFAULT_FILES];

  return fromEnv
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function buildDemandeMariageUrl(filename: string): string {
  const cleanFilename = filename.replace(/^\//, "");
  return `${DEMANDE_MARIAGE_BASE_URL}/${encodeURIComponent(cleanFilename)}`;
}

export function getDemandeMariageImages(): Array<{ src: string; alt: string }> {
  return readConfiguredFiles().map((filename, index) => ({
    src: buildDemandeMariageUrl(filename),
    alt: `La demande en mariage — ${index + 1}`,
  }));
}
