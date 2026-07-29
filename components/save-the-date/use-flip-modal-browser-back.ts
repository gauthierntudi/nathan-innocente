"use client";

import { useEffect, useRef } from "react";

const HISTORY_KEY = "__inviteFlipModal";

type FlipModalHistoryState = {
  [HISTORY_KEY]?: boolean;
};

/**
 * Quand un modal flip est ouvert, le bouton Retour du navigateur le ferme
 * au lieu de quitter la page. À la fermeture via UI, l’entrée d’historique
 * poussée est aussi consommée.
 */
export function useFlipModalBrowserBack(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closedByPopRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    closedByPopRef.current = false;
    const nextState: FlipModalHistoryState = {
      ...(window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : {}),
      [HISTORY_KEY]: true,
    };
    window.history.pushState(nextState, "");

    function onPopState() {
      closedByPopRef.current = true;
      onCloseRef.current();
    }

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);

      if (closedByPopRef.current) return;

      const state = window.history.state as FlipModalHistoryState | null;
      if (state?.[HISTORY_KEY]) {
        window.history.back();
      }
    };
  }, [isOpen]);
}
