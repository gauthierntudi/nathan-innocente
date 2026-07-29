let lockCount = 0;

/**
 * Verrouille le scroll du document avec un compteur :
 * ouvrir un modal par-dessus un autre ne laisse plus overflow:hidden collé.
 */
export function lockBodyScroll() {
  if (typeof document === "undefined") {
    return () => {};
  }

  lockCount += 1;
  if (lockCount === 1) {
    document.body.style.overflow = "hidden";
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = "";
    }
  };
}

export function unlockAllBodyScroll() {
  if (typeof document === "undefined") return;
  lockCount = 0;
  document.body.style.overflow = "";
}
