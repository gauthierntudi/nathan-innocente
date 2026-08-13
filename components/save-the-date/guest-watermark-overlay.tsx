"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CELL_COUNT = 24;
const HOLD_MS = 2200;

function formatWatermarkStamp(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function isScreenshotChord(event: KeyboardEvent) {
  const key = event.key;
  const lower = key.toLowerCase();

  if (key === "PrintScreen" || lower === "printscreen") return true;

  // macOS : ⌘⇧3 / ⌘⇧4 / ⌘⇧5
  if (event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key)) {
    return true;
  }

  // Windows : Win+Shift+S (Snipping Tool) — Super souvent mappé comme meta sur certains navigateurs
  if (event.shiftKey && lower === "s" && (event.metaKey || event.getModifierState?.("OS"))) {
    return true;
  }

  // Ctrl+Shift+S / Ctrl+P (impression → PDF)
  if (event.ctrlKey && event.shiftKey && lower === "s") return true;
  if ((event.ctrlKey || event.metaKey) && lower === "p") return true;

  return false;
}

type GuestWatermarkOverlayProps = {
  guestName: string;
  guestRef?: string;
};

export function GuestWatermarkOverlay({
  guestName,
  guestRef = "",
}: GuestWatermarkOverlayProps) {
  const [active, setActive] = useState(false);
  const [stamp, setStamp] = useState(() => formatWatermarkStamp(new Date()));
  const hideTimerRef = useRef<number | null>(null);

  const displayName = guestName.trim() || "Invité";
  const refLine = guestRef ? `Réf. ${guestRef}` : "Invitation personnelle";

  const triggerShield = useCallback(() => {
    setStamp(formatWatermarkStamp(new Date()));
    setActive(true);

    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setActive(false);
      hideTimerRef.current = null;
    }, HOLD_MS);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isScreenshotChord(event)) return;
      // Remplacement immédiat (avant la capture quand c'est possible)
      triggerShield();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen" || event.key.toLowerCase() === "printscreen") {
        triggerShield();
      }
    };

    const onBeforePrint = () => {
      triggerShield();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("beforeprint", onBeforePrint);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("beforeprint", onBeforePrint);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [triggerShield]);

  const cells = useMemo(
    () => Array.from({ length: CELL_COUNT }, (_, index) => index),
    [],
  );

  return (
    <div
      className={`guest-watermark${active ? " guest-watermark--active" : ""}`}
      aria-hidden="true"
    >
      <div className="guest-watermark__shield">
        <div className="guest-watermark__hero">
          <p className="guest-watermark__kicker">Capture protégée</p>
          <p className="guest-watermark__name">{displayName}</p>
          <p className="guest-watermark__label">CONFIDENTIEL</p>
          <p className="guest-watermark__meta">
            {refLine}
            <br />
            {stamp}
          </p>
          <p className="guest-watermark__note">
            Cette invitation est personnelle. Toute diffusion non autorisée est
            identifiable.
          </p>
        </div>
        <div className="guest-watermark__grid">
          {cells.map((index) => (
            <div key={index} className="guest-watermark__cell">
              <span className="guest-watermark__name">{displayName}</span>
              <span className="guest-watermark__label">CONFIDENTIEL</span>
              <span className="guest-watermark__meta">
                {refLine} · {stamp}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
