/** URL publique du site (QR code, liens invités). */
export function getAppBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://www.nathan-innocente.com";
  return raw.replace(/\/$/, "");
}

/** Page affichée quand le staff scanne le QR code de l'invité. */
export function buildCheckInUrl(guestToken: string) {
  const params = new URLSearchParams({ token: guestToken });
  return `${getAppBaseUrl()}/check-in?${params.toString()}`;
}

/** Lien login direct vers le pass d'entrée. */
export function buildPassAccessLoginUrl(guestToken?: string) {
  const params = new URLSearchParams({ passaccess: "1" });
  if (guestToken) {
    params.set("params", guestToken);
  }
  return `${getAppBaseUrl()}/login?${params.toString()}`;
}

export function isPassAccessLoginParam(value?: string | null) {
  if (value == null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Lien login direct vers les dispositions pratiques (cocktail). */
export function buildCocktailLoginUrl(guestToken?: string) {
  const params = new URLSearchParams({ cocktail: "1" });
  if (guestToken) {
    params.set("params", guestToken);
  }
  return `${getAppBaseUrl()}/login?${params.toString()}`;
}

export function isCocktailLoginParam(value?: string | null) {
  if (value == null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
