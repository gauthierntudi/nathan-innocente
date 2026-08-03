"use client";

import { useEffect } from "react";

import { lockBodyScroll } from "@/lib/lock-body-scroll";

type GuestDeclineBottomSheetProps = {
  open: boolean;
  ceremonyLabel?: string;
  declining: boolean;
  onClose: () => void;
  onConfirmDecline: () => void;
};

export function GuestDeclineBottomSheet({
  open,
  ceremonyLabel,
  declining,
  onClose,
  onConfirmDecline,
}: GuestDeclineBottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const unlock = lockBodyScroll();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !declining) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      unlock();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, declining, onClose]);

  if (!open) return null;

  return (
    <div className="invitation-sheet" role="presentation">
      <button
        type="button"
        className="invitation-sheet__backdrop"
        aria-label="Fermer"
        disabled={declining}
        onClick={onClose}
      />

      <div
        className="invitation-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invitation-decline-sheet-title"
      >
        <div className="invitation-sheet__handle" aria-hidden />

        <h2
          id="invitation-decline-sheet-title"
          className="invitation-sheet__title"
        >
          Confirmer votre indisponibilité ?
        </h2>
        <p className="invitation-sheet__lead">
          {ceremonyLabel ? (
            <>
              Vous allez indiquer que vous ne pourrez pas assister à{" "}
              <strong>{ceremonyLabel}</strong>.
            </>
          ) : (
            <>Vous allez indiquer que vous ne pourrez pas assister.</>
          )}{" "}
          Vous pourrez modifier cette réponse plus tard si besoin.
        </p>

        <div className="invitation-sheet__actions">
          <button
            type="button"
            className="invitation-rsvp__btn invitation-rsvp__btn--decline"
            disabled={declining}
            onClick={onConfirmDecline}
          >
            {declining ? (
              <>
                <span className="invitation-rsvp__spinner" aria-hidden />
                Enregistrement...
              </>
            ) : (
              "Oui, je ne pourrai pas"
            )}
          </button>

          <button
            type="button"
            className="invitation-sheet__cancel"
            disabled={declining}
            onClick={onClose}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
