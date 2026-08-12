/**
 * Similarité de noms pour fusion d’invités (même téléphone).
 *
 * Liés (mise à jour invité) :
 * - Jean Kalonji ↔ Jean
 * - Jean Kalonji ↔ Kalonji
 * - Jean Kalonji ↔ jean kalonji
 *
 * Non liés (table doublon) :
 * - Jean Kalonji ↔ Laurent
 */

export function normalizeGuestNameKey(name: string): string {
  return name
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[-'_./]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Tokens significatifs (≥ 2 caractères) pour comparer les noms. */
export function guestNameTokens(name: string): Set<string> {
  const key = normalizeGuestNameKey(name);
  if (!key) return new Set();

  return new Set(
    key
      .split(" ")
      .map((part) => part.trim())
      .filter((part) => part.length >= 2),
  );
}

/** true si au moins un token en commun (prénom ou nom partiel). */
export function guestNamesAreRelated(a: string, b: string): boolean {
  const keyA = normalizeGuestNameKey(a);
  const keyB = normalizeGuestNameKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;

  const tokensA = guestNameTokens(a);
  const tokensB = guestNameTokens(b);
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  for (const token of tokensA) {
    if (tokensB.has(token)) return true;
  }

  return false;
}

/** Préfère le libellé le plus complet (plus de tokens / plus long). */
export function preferRicherGuestName(current: string, incoming: string): string {
  const currentTokens = guestNameTokens(current).size;
  const incomingTokens = guestNameTokens(incoming).size;

  if (incomingTokens > currentTokens) return incoming.trim();
  if (incomingTokens < currentTokens) return current.trim();
  if (incoming.trim().length > current.trim().length) return incoming.trim();
  return current.trim();
}
