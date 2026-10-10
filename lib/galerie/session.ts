import type { GalleryAlbumId, MatchedAlbum } from "@/lib/galerie/content";

const STORAGE_KEY = "galerie-scan-results-v2";
const TTL_MS = 7 * 24 * 60 * 60_000;

export type GalerieSessionPhase = "albums" | "photos";

export type GalerieSessionState = {
  savedAt: number;
  phase: GalerieSessionPhase;
  albums: MatchedAlbum[];
  activeAlbumId: GalleryAlbumId | null;
  brokenSrcs: string[];
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadGalerieSession(): GalerieSessionState | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GalerieSessionState;
    if (!data || !Array.isArray(data.albums)) return null;
    if (!data.savedAt || Date.now() - data.savedAt > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (data.phase !== "albums" && data.phase !== "photos") return null;
    return {
      savedAt: data.savedAt,
      phase: data.phase,
      albums: data.albums,
      activeAlbumId: data.activeAlbumId ?? null,
      brokenSrcs: Array.isArray(data.brokenSrcs) ? data.brokenSrcs : [],
    };
  } catch {
    return null;
  }
}

export function saveGalerieSession(state: Omit<GalerieSessionState, "savedAt">) {
  if (!canUseStorage()) return;
  try {
    const payload: GalerieSessionState = {
      ...state,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

export function clearGalerieSession() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
