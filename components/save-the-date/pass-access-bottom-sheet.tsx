"use client";

import { useEffect } from "react";

import { PassAccessPanel } from "@/components/save-the-date/pass-access-panel";
import { lockBodyScroll } from "@/lib/lock-body-scroll";

type PassAccessBottomSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function PassAccessBottomSheet({
  open,
  onClose,
}: PassAccessBottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const unlock = lockBodyScroll();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      unlock();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="invitation-sheet" role="presentation">
      <button
        type="button"
        className="invitation-sheet__backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />

      <div
        className="invitation-sheet__panel invitation-sheet__panel--pass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-access-sheet-title"
      >
        <div className="invitation-sheet__handle" aria-hidden />
        <PassAccessPanel variant="sheet" />
        <button
          type="button"
          className="invitation-sheet__cancel"
          onClick={onClose}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
