/**
 * Densité de rendu PDF adaptée aux appareils faibles
 * (évite les OOM canvas sur vieux téléphones).
 */
export function getPdfPixelRatio(options?: {
  /** Plafond Retina (flipbook hi-res). Défaut 2. */
  max?: number;
  /** Minimum forcé. Défaut 1. */
  min?: number;
}): number {
  const max = options?.max ?? 2;
  const min = options?.min ?? 1;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const cores =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const narrow =
    typeof window !== "undefined" ? window.innerWidth < 480 : false;

  // Peu de cœurs / petit écran → rester proche de 1× pour limiter la mémoire.
  let cap = max;
  if (cores <= 4 || narrow) {
    cap = Math.min(cap, 1.5);
  }
  if (cores <= 2) {
    cap = Math.min(cap, 1.25);
  }

  return Math.min(Math.max(dpr, min), cap);
}
